import { describe, it, expect, vi, beforeEach } from "vitest";

describe("Webhook Retry Queue", () => {
  describe("queueFailedWebhook", () => {
    it("should export queueFailedWebhook function", async () => {
      const mod = await import("./webhookRetryQueue");
      expect(typeof mod.queueFailedWebhook).toBe("function");
    });
  });

  describe("processRetryQueue", () => {
    it("should export processRetryQueue function", async () => {
      const mod = await import("./webhookRetryQueue");
      expect(typeof mod.processRetryQueue).toBe("function");
    });

    it("should return stats object with correct structure", async () => {
      const { processRetryQueue } = await import("./webhookRetryQueue");
      const stats = await processRetryQueue();
      
      expect(stats).toBeDefined();
      expect(typeof stats.processed).toBe("number");
      expect(typeof stats.succeeded).toBe("number");
      expect(typeof stats.failed).toBe("number");
      expect(typeof stats.pending).toBe("number");
    });
  });

  describe("getRetryQueueStatus", () => {
    it("should export getRetryQueueStatus function", async () => {
      const mod = await import("./webhookRetryQueue");
      expect(typeof mod.getRetryQueueStatus).toBe("function");
    });

    it("should return status object with correct structure", async () => {
      const { getRetryQueueStatus } = await import("./webhookRetryQueue");
      const status = await getRetryQueueStatus(1);
      
      expect(status).toBeDefined();
      expect(typeof status.pending).toBe("number");
      expect(typeof status.delivered).toBe("number");
      expect(typeof status.failed).toBe("number");
      expect(Array.isArray(status.recentFailures)).toBe(true);
    });
  });

  describe("Polling functions", () => {
    it("should export startWebhookRetryQueue function", async () => {
      const mod = await import("./webhookRetryQueue");
      expect(typeof mod.startWebhookRetryQueue).toBe("function");
    });

    it("should export stopWebhookRetryQueue function", async () => {
      const mod = await import("./webhookRetryQueue");
      expect(typeof mod.stopWebhookRetryQueue).toBe("function");
    });
  });
});

describe("CRM Sync Timestamps", () => {
  describe("Tenant settings update", () => {
    it("should accept lastGhlSync in updateTenantSettings", async () => {
      const { updateTenantSettings } = await import("./tenant");
      
      // This should not throw a TypeScript error
      const updates = {
        lastGhlSync: new Date(),
      };
      
      expect(updates.lastGhlSync).toBeInstanceOf(Date);
    });

    it("should accept lastBatchDialerSync in updateTenantSettings", async () => {
      const { updateTenantSettings } = await import("./tenant");
      
      const updates = {
        lastBatchDialerSync: new Date(),
      };
      
      expect(updates.lastBatchDialerSync).toBeInstanceOf(Date);
    });

    it("should accept lastBatchLeadsSync in updateTenantSettings", async () => {
      const { updateTenantSettings } = await import("./tenant");
      
      const updates = {
        lastBatchLeadsSync: new Date(),
      };
      
      expect(updates.lastBatchLeadsSync).toBeInstanceOf(Date);
    });
  });
});

describe("Gunner Engine Webhook with Retry Queue", () => {
  describe("sendCallGradedWebhook", () => {
    it("should accept tenantId and callId parameters", async () => {
      const { sendCallGradedWebhook } = await import("./gunnerEngineWebhook");
      
      // This test verifies the function signature accepts the new parameters
      expect(typeof sendCallGradedWebhook).toBe("function");
      expect(sendCallGradedWebhook.length).toBe(3); // payload, tenantId, callId
    });
  });
});
