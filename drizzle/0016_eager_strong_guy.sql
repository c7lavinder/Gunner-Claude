ALTER TABLE `campaign_kpis` ADD `market` enum('tennessee','global') DEFAULT 'global' NOT NULL;--> statement-breakpoint
ALTER TABLE `campaign_kpis` ADD `contacts` int DEFAULT 0 NOT NULL;