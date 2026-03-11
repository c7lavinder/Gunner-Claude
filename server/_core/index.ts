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

// #region agent log — in-memory debug buffer readable via /debug
const _debugLog: string[] = [];
function dlog(msg: string) { const entry = `[${new Date().toISOString()}] ${msg}`; _debugLog.push(entry); console.log(entry); }

process.on("unhandledRejection", (reason) => {
  dlog(`[FATAL] unhandledRejection: ${reason instanceof Error ? reason.stack ?? reason.message : String(reason)}`);
});
process.on("uncaughtException", (err) => {
  dlog(`[FATAL] uncaughtException: ${err.stack ?? err.message}`);
});

dlog(`[boot] ENV loaded. PORT=${ENV.port} NODE_ENV=${process.env.NODE_ENV} DB_HOST=${new URL(ENV.databaseUrl).hostname}`);
// #endregion

if (ENV.sentryDsn) {
  Sentry.init({
    dsn: ENV.sentryDsn,
    environment: ENV.isProduction ? "production" : "development",
    tracesSampleRate: ENV.isProduction ? 0.1 : 1.0,
  });
  dlog("[sentry] Initialized");
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
    contentSecurityPolicy: false,
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

// #region agent log — remote-readable debug endpoint
app.get("/debug", (_req, res) => {
  res.json({ logs: _debugLog, count: _debugLog.length, uptime: process.uptime() });
});
// #endregion

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

app.listen(ENV.port, "0.0.0.0", () => {
  dlog(`[listen] Gunner v2 running on port ${ENV.port}`);
  runStartupMigrations()
    .then(() => { dlog("[startup] Migrations done"); return seedIndustryPlaybooks(); })
    .then(() => { dlog("[startup] Industry playbooks seeded"); return seedNahTenantPlaybook(); })
    .then(() => { dlog("[startup] NAH tenant seeded — startup complete"); })
    .catch((err) => dlog(`[startup] Migration/seed error (non-fatal): ${err instanceof Error ? err.message : String(err)}`));
  if (ENV.isProduction) {
    // #region agent log — wrap services in try/catch so they don't crash the process
    try { startPolling(5); dlog("[services] Polling started"); } catch (e) { dlog(`[services] Polling failed: ${e}`); }
    try { startDailyDigestJob(); dlog("[services] Daily digest started"); } catch (e) { dlog(`[services] Digest failed: ${e}`); }
    try { startEventFlusher(); dlog("[services] Event flusher started"); } catch (e) { dlog(`[services] Flusher failed: ${e}`); }
    try { startRetryProcessor(); dlog("[services] Retry processor started"); } catch (e) { dlog(`[services] Retry failed: ${e}`); }
    try { startScheduledJobs(); dlog("[services] Scheduled jobs started"); } catch (e) { dlog(`[services] Jobs failed: ${e}`); }
    // #endregion
  }
});

export type AppRouter = typeof appRouter;
