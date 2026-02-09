ALTER TABLE `badge_progress` MODIFY COLUMN `badgeCode` varchar(64) NOT NULL;--> statement-breakpoint
ALTER TABLE `badge_progress` MODIFY COLUMN `currentCount` int;--> statement-breakpoint
ALTER TABLE `badge_progress` ADD `currentStreak` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `badge_progress` ADD `weekStart` timestamp;--> statement-breakpoint
ALTER TABLE `badge_progress` ADD `updatedAt` timestamp DEFAULT (now()) NOT NULL ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `calls` ADD `callSource` enum('ghl','batchdialer') DEFAULT 'ghl';--> statement-breakpoint
ALTER TABLE `calls` ADD `batchDialerCallId` int;--> statement-breakpoint
ALTER TABLE `calls` ADD `batchDialerCampaignId` int;--> statement-breakpoint
ALTER TABLE `calls` ADD `batchDialerCampaignName` varchar(255);--> statement-breakpoint
ALTER TABLE `calls` ADD `batchDialerAgentName` varchar(255);--> statement-breakpoint
ALTER TABLE `calls` ADD CONSTRAINT `calls_batchDialerCallId_unique` UNIQUE(`batchDialerCallId`);--> statement-breakpoint
ALTER TABLE `badge_progress` DROP COLUMN `lastUpdated`;