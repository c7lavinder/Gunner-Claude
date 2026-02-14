import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { handleGHLWebhook } from "../webhook";
import { seedTeamMembers } from "../db";
import { startPolling } from "../ghlService";
import { initializeBadges } from "../gamification";
import { handleStripeWebhook } from "../stripe/webhook";
import selfServeAuthRoutes from "../selfServeAuthRoutes";
import { runEmailSequenceJobs } from "../emailSequenceJobs";
import { startBatchDialerPolling } from "../batchDialerSync";
import { startBatchLeadsPolling } from "../batchLeadsSync";
import { startWebhookRetryQueue } from "../webhookRetryQueue";
import { startWeeklyInsightsRefresh } from "../weeklyInsightsRefresh";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  
  // Stripe webhook endpoint - MUST be before express.json() middleware for signature verification
  app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), handleStripeWebhook);
  
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  
  // GoHighLevel webhook endpoint
  app.post("/api/webhook/ghl", handleGHLWebhook);
  
  // Self-serve auth routes (email/password)
  app.use("/api/auth", selfServeAuthRoutes);
  
  // Seed team members on startup
  seedTeamMembers().catch(err => console.error("Failed to seed team members:", err));
  
  // Initialize gamification badges
  initializeBadges().catch(err => console.error("Failed to initialize badges:", err));
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    
    // Start GHL automatic polling every 30 minutes
    // Delay start to let server fully initialize
    setTimeout(() => {
      startPolling(30);
    }, 10000);
    
    // Start BatchDialer automatic polling every 30 minutes
    setTimeout(() => {
      startBatchDialerPolling();
    }, 15000);
    
    // Start BatchLeads enrichment polling every 60 minutes
    setTimeout(() => {
      startBatchLeadsPolling();
    }, 20000);
    
    // Start webhook retry queue processing every 5 minutes
    setTimeout(() => {
      startWebhookRetryQueue();
    }, 25000);
    
    // Start weekly insights refresh - checks every hour, runs Monday 6AM CT
    setTimeout(() => {
      startWeeklyInsightsRefresh();
    }, 30000);
    
    // Start email sequence job - runs every hour
    // Initial run after 35 seconds, then every hour
    setTimeout(async () => {
      console.log('[EmailSequence] Running initial email sequence check...');
      try {
        const result = await runEmailSequenceJobs();
        console.log(`[EmailSequence] Initial run complete: ${result.emailsSent} emails sent, ${result.processed} tenants processed`);
      } catch (error) {
        console.error('[EmailSequence] Initial run error:', error);
      }
      
      // Schedule hourly runs
      setInterval(async () => {
        console.log('[EmailSequence] Running hourly email sequence check...');
        try {
          const result = await runEmailSequenceJobs();
          console.log(`[EmailSequence] Hourly run complete: ${result.emailsSent} emails sent, ${result.processed} tenants processed`);
        } catch (error) {
          console.error('[EmailSequence] Hourly run error:', error);
        }
      }, 60 * 60 * 1000); // Every hour
    }, 30000);
  });
}

startServer().catch(console.error);
