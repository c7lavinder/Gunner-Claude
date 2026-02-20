ALTER TABLE `campaign_kpis` MODIFY COLUMN `market` varchar(100) NOT NULL DEFAULT 'global';--> statement-breakpoint
ALTER TABLE `campaign_kpis` MODIFY COLUMN `channel` varchar(100) NOT NULL;--> statement-breakpoint
ALTER TABLE `kpi_deals` MODIFY COLUMN `leadSource` varchar(100);