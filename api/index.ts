/**
 * Vercel Serverless Entry Point
 *
 * ⚠️  IMPORTANT LIMITATIONS FOR VERCEL DEPLOYMENT:
 * This app uses an Express server with background jobs (GHL sync, BatchDialer polling, etc.).
 * Serverless functions cannot run persistent background jobs.
 *
 * Background jobs that will NOT work on Vercel serverless:
 *   - startPolling() - GHL call sync every 5 min
 *   - startBatchDialerPolling() - BatchDialer sync
 *   - startBatchLeadsPolling() - BatchLeads enrichment
 *   - startWebhookRetryQueue() - Webhook retry processor
 *   - startWeeklyInsightsRefresh() - Weekly AI insights
 *
 * Solutions for background jobs:
 *   1. Use Vercel Cron Jobs to hit API endpoints that trigger each job
 *   2. Keep the backend on Railway (recommended — already configured there)
 *      and use Vercel only for the frontend static files
 *   3. Use Supabase Edge Functions or pg_cron for DB-level scheduling
 *
 * RECOMMENDED: Deploy frontend to Vercel, keep backend on Railway.
 * The Railway service (gunner-engine) is already configured and running.
 */

import "dotenv/config";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../server/routers";
import { createContext } from "../server/_core/context";
import { createGHLWebhookRouter } from "../server/webhook";
import { handleStripeWebhook } from "../server/stripe/webhook";
import selfServeAuthRoutes from "../server/selfServeAuthRoutes";
import { coachStreamRouter } from "../server/coachStream";
import { dispoAssistantRouter } from "../server/dispoAssistantStream";
import { analyticsStreamRouter } from "../server/analyticsStream";
import { createGHLOAuthRouter } from "../server/ghlOAuthRoutes";

const app = express();

// Stripe webhook endpoint - MUST be before express.json()
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), handleStripeWebhook);

// GHL webhook endpoint - MUST be before express.json()
app.use(createGHLWebhookRouter());

// Body parser
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// GHL OAuth install/callback routes
app.use(createGHLOAuthRouter());

// Self-serve auth routes (email/password + Google OAuth)
app.use("/api/auth", selfServeAuthRoutes);

// AI Coach streaming endpoint
app.use(coachStreamRouter);

// AI Dispo Assistant streaming endpoint
app.use(dispoAssistantRouter);

// AI Analytics Coach streaming endpoint
app.use(analyticsStreamRouter);

// tRPC API
app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

export default app;
