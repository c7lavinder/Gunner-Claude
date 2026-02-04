CREATE TABLE `platform_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(100) NOT NULL,
	`value` text NOT NULL,
	`description` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `platform_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `platform_settings_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
ALTER TABLE `subscription_plans` ADD `trialDays` int DEFAULT 14 NOT NULL;--> statement-breakpoint
ALTER TABLE `subscription_plans` ADD `maxCallsPerMonth` int DEFAULT 500 NOT NULL;--> statement-breakpoint
ALTER TABLE `subscription_plans` ADD `isPopular` enum('true','false') DEFAULT 'false';