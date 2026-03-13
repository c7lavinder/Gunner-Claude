import "dotenv/config";
import * as Sentry from "@sentry/node";
import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";
import { ENV } from "./env";
import { createContext } from "./context";
import { appRouter } from "../routers";
import { webhookRouter } from "../middleware/webhook";
import { stripeWebhookRouter } from "../middleware/stripeWebhook";
import { rateLimiter } from "../middleware/rateLimiter";
import { startPolling } from "../services/callIngestion";
import { startDailyDigestJob } from "../services/notifications";
import { startEventFlusher } from "../services/eventTracking";
import { startRetryProcessor } from "../middleware/webhook";
import { startScheduledJobs } from "../services/scheduledJobs";
import { seedIndustryPlaybooks } from "../seeds/seedPlaybooks";
import { runStartupMigrations } from "../seeds/startupMigrations";
import { seedNahTenantPlaybook } from "../seeds/nahTenant";
import { chatCompletionStream } from "./llm";
import { initRedis, initQueueManager, initWorkers } from "../queues";
import { registerAllAgents, startOrchestrator } from "../agents";

process.on("unhandledRejection", (reason) => {
  console.error("[process] unhandledRejection:", reason instanceof Error ? reason.stack ?? reason.message : String(reason));
});
process.on("uncaughtException", (err) => {
  console.error("[process] uncaughtException:", err.stack ?? err.message);
});

if (ENV.sentryDsn) {
  Sentry.init({
    dsn: ENV.sentryDsn,
    environment: ENV.isProduction ? "production" : "development",
    tracesSampleRate: ENV.isProduction ? 0.1 : 1.0,
  });
  console.log("[sentry] Initialized");
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// Trust Railway's reverse proxy so req.ip and secure cookies work correctly in production
app.set("trust proxy", 1);

app.use("/api/stripe/webhook", stripeWebhookRouter);
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:", "blob:"],
        connectSrc: [
          "'self'",
          "https://api.openai.com",
          "https://*.sentry.io",
          "https://*.supabase.co",
          "https://app.posthog.com",
          "https://resend.com",
          "wss:",
          "https:",
        ],
        mediaSrc: ["'self'", "blob:", "https://*.supabase.co"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

app.get("/health", async (_req, res) => {
  let crmStatus: "connected" | "degraded" | "disconnected" = "disconnected";
  try {
    const { db: healthDb } = await import("./db");
    const { tenants: tenantsTable } = await import("../../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    const connected = await healthDb
      .select({ lastWebhookAt: tenantsTable.lastWebhookAt })
      .from(tenantsTable)
      .where(eq(tenantsTable.crmConnected, "true"))
      .limit(1);
    if (connected.length > 0) {
      const lastWebhook = connected[0]?.lastWebhookAt;
      if (lastWebhook && Date.now() - lastWebhook.getTime() < 2 * 60 * 60 * 1000) {
        crmStatus = "connected";
      } else {
        crmStatus = "degraded";
      }
    }
  } catch {
    crmStatus = "degraded";
  }
  res.json({ status: "ok", timestamp: new Date().toISOString(), crmStatus });
});

app.use(
  "/api/trpc/auth.login",
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 10, keyPrefix: "auth-login" })
);
app.use(
  "/api/trpc/auth.signup",
  rateLimiter({ windowMs: 60 * 60 * 1000, max: 5, keyPrefix: "auth-signup" })
);
app.use(
  "/api/trpc/auth.googleCallback",
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 15, keyPrefix: "auth-google" })
);

app.use("/api/webhooks", webhookRouter);

// Rate limit the AI streaming endpoint (20 req/min per user)
app.use(
  "/api/ai/stream",
  rateLimiter({
    windowMs: 60 * 1000,
    max: 20,
    keyPrefix: "ai-stream",
    keyGenerator: (req: express.Request) => {
      const token = req.cookies?.auth_token ?? (req.headers.authorization?.replace("Bearer ", "") || "");
      try {
        const payload = jwt.verify(token, ENV.jwtSecret) as jwt.JwtPayload;
        return String(payload.userId ?? req.ip);
      } catch {
        return req.ip ?? "unknown";
      }
    },
  })
);

// SSE streaming endpoint for AI coach
app.post("/api/ai/stream", async (req, res) => {
  const token = req.cookies?.auth_token ?? (req.headers.authorization?.replace("Bearer ", "") || "");
  try {
    const payload = jwt.verify(token, ENV.jwtSecret) as jwt.JwtPayload;
    if (!payload.userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  } catch {
    res.status(401).json({ error: "Unauthorized" }); return;
  }

  const { messages } = req.body as { messages?: Array<{ role: "system" | "user" | "assistant"; content: string }> };
  if (!messages?.length) { res.status(400).json({ error: "Missing messages" }); return; }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  try {
    await chatCompletionStream({
      messages,
      onChunk: (chunk) => { res.write(`data: ${JSON.stringify({ chunk })}\n\n`); },
      onDone: (fullText) => { res.write(`data: ${JSON.stringify({ done: true, fullText })}\n\n`); res.end(); },
      onError: (err) => { res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`); res.end(); },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Stream failed";
    res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
    res.end();
  }
});

app.use(
  "/api/trpc",
  createExpressMiddleware({ router: appRouter, createContext })
);

if (ENV.isProduction) {
  const publicDir = path.resolve(__dirname, "public");
  app.use(express.static(publicDir));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });
}

async function startup() {
  // 1. Run database migrations and seeds FIRST — tables must exist before any queries
  try {
    await runStartupMigrations();
    await seedIndustryPlaybooks();
    await seedNahTenantPlaybook();
    console.log("[startup] Migrations and seeds complete");
  } catch (err) {
    console.error("[startup] Migration/seed error:", err);
    throw err;
  }

  // 2. Initialize queue system (Redis + BullMQ or in-memory fallback)
  initRedis(ENV.redisUrl || undefined);
  initQueueManager();

  // 3. Register the agent system
  registerAllAgents();

  // 4. Start the HTTP server
  app.listen(ENV.port, "0.0.0.0", () => {
    console.log(`[startup] Gunner v2 listening on port ${ENV.port}`);
  });

  // 5. Start background services (production only)
  if (ENV.isProduction) {
    try { startPolling(5); } catch (e) { console.error("[services] Polling failed:", e); }
    try { startDailyDigestJob(); } catch (e) { console.error("[services] Digest failed:", e); }
    try { startEventFlusher(); } catch (e) { console.error("[services] Flusher failed:", e); }
    try { startRetryProcessor(); } catch (e) { console.error("[services] Retry failed:", e); }
    try { startScheduledJobs(); } catch (e) { console.error("[services] Jobs failed:", e); }
    initWorkers().catch((e) => console.error("[workers] Init failed:", e));
    startOrchestrator();
  }
}

startup().catch((err) => {
  console.error("[startup] Fatal error:", err);
  process.exit(1);
});

export type AppRouter = typeof appRouter;
