CREATE TABLE `kpi_sources` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`kpi_source_type` enum('outbound','inbound') NOT NULL,
	`tracksVolume` boolean NOT NULL DEFAULT false,
	`volumeLabel` varchar(100),
	`ghlSourceMapping` varchar(255),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `kpi_sources_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `kpi_spend` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`sourceId` int NOT NULL,
	`marketId` int NOT NULL,
	`month` varchar(7) NOT NULL,
	`amount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `kpi_spend_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `kpi_volume` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`sourceId` int NOT NULL,
	`marketId` int NOT NULL,
	`month` varchar(7) NOT NULL,
	`count` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `kpi_volume_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `daily_kpi_entries` ADD `propertyId` int;--> statement-breakpoint
ALTER TABLE `daily_kpi_entries` ADD `teamMemberId` int;--> statement-breakpoint
ALTER TABLE `daily_kpi_entries` ADD `detectionType` enum('auto','manual','am_direct') DEFAULT 'manual';--> statement-breakpoint
ALTER TABLE `daily_kpi_entries` ADD `sourceCallId` int;--> statement-breakpoint
ALTER TABLE `dispo_properties` ADD `acceptedOffer` int;--> statement-breakpoint
ALTER TABLE `dispo_properties` ADD `marketId` int;--> statement-breakpoint
ALTER TABLE `dispo_properties` ADD `sourceId` int;--> statement-breakpoint
ALTER TABLE `dispo_properties` ADD `contactedAt` timestamp;--> statement-breakpoint
ALTER TABLE `dispo_properties` ADD `aptSetAt` timestamp;--> statement-breakpoint
ALTER TABLE `dispo_properties` ADD `offerMadeAt` timestamp;--> statement-breakpoint
ALTER TABLE `dispo_properties` ADD `closedAt` timestamp;--> statement-breakpoint
ALTER TABLE `kpi_markets` ADD `zipCodes` json DEFAULT ('[]');--> statement-breakpoint
ALTER TABLE `kpi_markets` ADD `isGlobal` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `kpi_sources` ADD CONSTRAINT `kpi_sources_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `kpi_spend` ADD CONSTRAINT `kpi_spend_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `kpi_spend` ADD CONSTRAINT `kpi_spend_sourceId_kpi_sources_id_fk` FOREIGN KEY (`sourceId`) REFERENCES `kpi_sources`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `kpi_spend` ADD CONSTRAINT `kpi_spend_marketId_kpi_markets_id_fk` FOREIGN KEY (`marketId`) REFERENCES `kpi_markets`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `kpi_volume` ADD CONSTRAINT `kpi_volume_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `kpi_volume` ADD CONSTRAINT `kpi_volume_sourceId_kpi_sources_id_fk` FOREIGN KEY (`sourceId`) REFERENCES `kpi_sources`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `kpi_volume` ADD CONSTRAINT `kpi_volume_marketId_kpi_markets_id_fk` FOREIGN KEY (`marketId`) REFERENCES `kpi_markets`(`id`) ON DELETE no action ON UPDATE no action;