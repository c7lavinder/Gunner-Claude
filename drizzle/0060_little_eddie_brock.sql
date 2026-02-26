CREATE TABLE `contact_cache` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`ghlContactId` varchar(255) NOT NULL,
	`ghlLocationId` varchar(255),
	`firstName` varchar(255),
	`lastName` varchar(255),
	`name` varchar(512),
	`email` varchar(320),
	`phone` varchar(50),
	`tags` text,
	`address` text,
	`companyName` varchar(255),
	`lastSyncedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contact_cache_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `webhook_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int,
	`provider` varchar(50) NOT NULL,
	`locationId` varchar(255),
	`eventType` varchar(100) NOT NULL,
	`eventId` varchar(255),
	`status` enum('received','processed','skipped','failed') NOT NULL DEFAULT 'received',
	`errorMessage` text,
	`processedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `webhook_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `contact_cache` ADD CONSTRAINT `contact_cache_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `webhook_events` ADD CONSTRAINT `webhook_events_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;