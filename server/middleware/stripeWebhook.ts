import { Router } from "express";
import express from "express";
import { handleWebhook } from "../services/stripe";

export const stripeWebhookRouter = Router();

stripeWebhookRouter.post(
  "/",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"] as string;
    try {
      await handleWebhook(req.body as Buffer, sig);
      res.json({ received: true });
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : "Webhook error" });
    }
  }
);
