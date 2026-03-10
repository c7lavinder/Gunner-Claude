import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import path from "node:path";
import { ENV } from "./env";
import { createContext } from "./context";
import { appRouter } from "../routers";
import { webhookRouter } from "../middleware/webhook";
import { startPolling } from "../services/callIngestion";
import { startDailyDigestJob } from "../services/notifications";

const app = express();

app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/webhooks", webhookRouter);

app.use(
  "/api/trpc",
  createExpressMiddleware({ router: appRouter, createContext })
);

if (ENV.isProduction) {
  const publicDir = path.resolve(import.meta.dirname, "../../dist/public");
  app.use(express.static(publicDir));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });
}

app.listen(ENV.port, "0.0.0.0", () => {
  console.log(`Gunner v2 running on port ${ENV.port}`);
  if (ENV.isProduction) {
    startPolling(5);
    startDailyDigestJob();
  }
});

export type AppRouter = typeof appRouter;
