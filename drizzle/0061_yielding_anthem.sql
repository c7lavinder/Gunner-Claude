ALTER TABLE `tenants` ADD `webhookActive` enum('true','false') DEFAULT 'false';--> statement-breakpoint
ALTER TABLE `tenants` ADD `lastWebhookAt` timestamp;--> statement-breakpoint
ALTER TABLE `tenants` ADD `contactCacheImported` enum('true','false') DEFAULT 'false';