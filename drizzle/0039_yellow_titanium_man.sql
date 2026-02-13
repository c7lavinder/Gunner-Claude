CREATE TABLE `webhook_retry_queue` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`callId` int NOT NULL,
	`payload` text NOT NULL,
	`attemptCount` int NOT NULL DEFAULT 0,
	`maxAttempts` int NOT NULL DEFAULT 5,
	`lastAttemptAt` timestamp,
	`nextRetryAt` timestamp NOT NULL,
	`status` enum('pending','delivered','failed') NOT NULL DEFAULT 'pending',
	`lastError` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `webhook_retry_queue_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `tenants` ADD `lastGhlSync` timestamp;--> statement-breakpoint
ALTER TABLE `tenants` ADD `lastBatchDialerSync` timestamp;--> statement-breakpoint
ALTER TABLE `tenants` ADD `lastBatchLeadsSync` timestamp;--> statement-breakpoint
ALTER TABLE `webhook_retry_queue` ADD CONSTRAINT `webhook_retry_queue_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `webhook_retry_queue` ADD CONSTRAINT `webhook_retry_queue_callId_calls_id_fk` FOREIGN KEY (`callId`) REFERENCES `calls`(`id`) ON DELETE no action ON UPDATE no action;