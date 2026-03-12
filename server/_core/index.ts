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
import { seedDemoTenant } from "../seeds/seedDemoTenant";
import { chatCompletionStream } from "./llm";

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
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

app.get("/health", (_req, res) => {
  // #region agent log
  fetch('http://127.0.0.1:7316/ingest/c1bc405f-7550-4dc7-9f21-822afeacd0cb',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c9202e'},body:JSON.stringify({sessionId:'c9202e',location:'index.ts:/health',message:'healthcheck endpoint hit',data:{ts:new Date().toISOString()},timestamp:Date.now(),hypothesisId:'D'})}).catch(()=>{});
  // #endregion
  res.json({ status: "ok", timestamp: new Date().toISOString() });
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

// #region agent log
fetch('http://127.0.0.1:7316/ingest/c1bc405f-7550-4dc7-9f21-822afeacd0cb',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c9202e'},body:JSON.stringify({sessionId:'c9202e',location:'index.ts:beforeListen',message:'process reached app.listen call',data:{port:ENV.port,ts:new Date().toISOString()},timestamp:Date.now(),hypothesisId:'A'})}).catch(()=>{});
// #endregion
app.listen(ENV.port, "0.0.0.0", () => {
  const t0 = Date.now();
  console.log(`[startup] Gunner v2 listening on port ${ENV.port} at ${new Date().toISOString()}`);
  // #region agent log
  fetch('http://127.0.0.1:7316/ingest/c1bc405f-7550-4dc7-9f21-822afeacd0cb',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c9202e'},body:JSON.stringify({sessionId:'c9202e',location:'index.ts:app.listen',message:'server listening - port bound',data:{port:ENV.port,ts:new Date().toISOString()},timestamp:Date.now(),hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  runStartupMigrations()
    .then(() => {
      // #region agent log
      fetch('http://127.0.0.1:7316/ingest/c1bc405f-7550-4dc7-9f21-822afeacd0cb',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c9202e'},body:JSON.stringify({sessionId:'c9202e',location:'index.ts:afterMigrations',message:'startup migrations complete',data:{elapsedMs:Date.now()-t0},timestamp:Date.now(),hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      return seedIndustryPlaybooks();
    })
    .then(() => {
      // #region agent log
      fetch('http://127.0.0.1:7316/ingest/c1bc405f-7550-4dc7-9f21-822afeacd0cb',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c9202e'},body:JSON.stringify({sessionId:'c9202e',location:'index.ts:afterIndustryPlaybooks',message:'industry playbooks seeded',data:{elapsedMs:Date.now()-t0},timestamp:Date.now(),hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      return seedNahTenantPlaybook();
    })
    .then(() => {
      // #region agent log
      fetch('http://127.0.0.1:7316/ingest/c1bc405f-7550-4dc7-9f21-822afeacd0cb',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c9202e'},body:JSON.stringify({sessionId:'c9202e',location:'index.ts:afterNahSeed',message:'NAH tenant seeded',data:{elapsedMs:Date.now()-t0},timestamp:Date.now(),hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      return seedDemoTenant();
    })
    .then(() => {
      console.log("[startup] All migrations and seeds complete.");
      // #region agent log
      fetch('http://127.0.0.1:7316/ingest/c1bc405f-7550-4dc7-9f21-822afeacd0cb',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c9202e'},body:JSON.stringify({sessionId:'c9202e',location:'index.ts:afterAllSeeds',message:'all seeds complete',data:{elapsedMs:Date.now()-t0},timestamp:Date.now(),hypothesisId:'B'})}).catch(()=>{});
      // #endregion
    })
    .catch((err) => {
      console.error("[startup] Migration/seed error:", err);
      // #region agent log
      fetch('http://127.0.0.1:7316/ingest/c1bc405f-7550-4dc7-9f21-822afeacd0cb',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c9202e'},body:JSON.stringify({sessionId:'c9202e',location:'index.ts:seedError',message:'seed/migration error',data:{error:String(err),elapsedMs:Date.now()-t0},timestamp:Date.now(),hypothesisId:'C'})}).catch(()=>{});
      // #endregion
    });
  if (ENV.isProduction) {
    try { startPolling(5); } catch (e) { console.error("[services] Polling failed:", e); }
    try { startDailyDigestJob(); } catch (e) { console.error("[services] Digest failed:", e); }
    try { startEventFlusher(); } catch (e) { console.error("[services] Flusher failed:", e); }
    try { startRetryProcessor(); } catch (e) { console.error("[services] Retry failed:", e); }
    try { startScheduledJobs(); } catch (e) { console.error("[services] Jobs failed:", e); }
  }
});

export type AppRouter = typeof appRouter;
