import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ENV } from "./env";
import { createContext } from "./context";
import { appRouter } from "../routers";
import { webhookRouter } from "../middleware/webhook";
import { stripeWebhookRouter } from "../middleware/stripeWebhook";
import { rateLimiter } from "../middleware/rateLimiter";
import { startPolling } from "../services/callIngestion";
import { startDailyDigestJob } from "../services/notifications";
import { startEventFlusher } from "../services/eventTracking";
import { seedIndustryPlaybooks } from "../seeds/seedPlaybooks";
import { runStartupMigrations } from "../seeds/startupMigrations";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

app.use("/api/stripe/webhook", stripeWebhookRouter);
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  if (ENV.isProduction) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});

app.get("/health", (_req, res) => {
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
  console.log(`Gunner v2 running on port ${ENV.port}`);
  runStartupMigrations()
    .then(() => seedIndustryPlaybooks())
    .catch((err) => console.error("[startup] Migration/seed error:", err));
  if (ENV.isProduction) {
    startPolling(5);
    startDailyDigestJob();
    startEventFlusher();
  }
});

export type AppRouter = typeof appRouter;
