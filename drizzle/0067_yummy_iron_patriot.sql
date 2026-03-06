CREATE TABLE `dispo_daily_kpis` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`userId` int NOT NULL,
	`entryDate` varchar(10) NOT NULL,
	`kpiType` enum('properties_sent','showings_scheduled','offers_received','deals_assigned','contracts_closed') NOT NULL,
	`value` int NOT NULL DEFAULT 1,
	`propertyId` int,
	`notes` text,
	`kpi_source` enum('auto','manual') NOT NULL DEFAULT 'manual',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `dispo_daily_kpis_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `dispo_properties` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`address` varchar(500) NOT NULL,
	`city` varchar(100) NOT NULL,
	`state` varchar(50) NOT NULL,
	`zip` varchar(20) NOT NULL,
	`propertyType` enum('house','lot','land','multi_family','commercial','other') NOT NULL DEFAULT 'house',
	`beds` int,
	`baths` varchar(10),
	`sqft` int,
	`yearBuilt` int,
	`contractPrice` int,
	`askingPrice` int,
	`assignmentFee` int,
	`arv` int,
	`estRepairs` int,
	`lockboxCode` varchar(50),
	`occupancyStatus` enum('vacant','occupied','tenant','unknown') DEFAULT 'unknown',
	`status` varchar(50) NOT NULL DEFAULT 'lead',
	`mediaLink` text,
	`description` text,
	`notes` text,
	`addedByUserId` int,
	`assignedToUserId` int,
	`ghlContactId` varchar(255),
	`sellerName` varchar(255),
	`sellerPhone` varchar(50),
	`leadSource` varchar(100),
	`leadSourceDetail` varchar(255),
	`assignedAmUserId` int,
	`assignedLmUserId` int,
	`ourOfferAmount` int,
	`offerDate` timestamp,
	`counterOfferAmount` int,
	`contractDate` timestamp,
	`closingDate` timestamp,
	`actualCloseDate` timestamp,
	`assignmentAmount` int,
	`buyerGhlContactId` varchar(255),
	`buyerName` varchar(255),
	`buyerCompany` varchar(255),
	`expectedCloseDate` timestamp,
	`stageChangedAt` timestamp,
	`aptEverSet` boolean DEFAULT false,
	`offerEverMade` boolean DEFAULT false,
	`everUnderContract` boolean DEFAULT false,
	`everClosed` boolean DEFAULT false,
	`ghlOpportunityId` varchar(255),
	`ghlPipelineId` varchar(255),
	`ghlPipelineStageId` varchar(255),
	`market` varchar(100),
	`lotSize` varchar(50),
	`photos` text,
	`dispoAskingPrice` int,
	`opportunitySource` varchar(255),
	`projectType` enum('wholesale','novation','creative_finance','fix_and_flip','buy_and_hold','other'),
	`marketedAt` timestamp,
	`underContractAt` timestamp,
	`soldAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `dispo_properties_id` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_tenant_address` UNIQUE(`tenantId`,`address`)
);
--> statement-breakpoint
CREATE TABLE `dispo_property_offers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`propertyId` int NOT NULL,
	`buyerName` varchar(255) NOT NULL,
	`buyerPhone` varchar(50),
	`buyerEmail` varchar(255),
	`buyerCompany` varchar(255),
	`ghlContactId` varchar(255),
	`offerAmount` int NOT NULL,
	`status` enum('pending','accepted','rejected','countered','expired') NOT NULL DEFAULT 'pending',
	`notes` text,
	`offeredAt` timestamp NOT NULL DEFAULT (now()),
	`respondedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `dispo_property_offers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `dispo_property_sends` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`propertyId` int NOT NULL,
	`channel` enum('sms','email','facebook','investor_base','other') NOT NULL,
	`buyerGroup` varchar(255),
	`recipientCount` int DEFAULT 0,
	`notes` text,
	`sentByUserId` int,
	`sentAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `dispo_property_sends_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `dispo_property_showings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`propertyId` int NOT NULL,
	`buyerName` varchar(255) NOT NULL,
	`buyerPhone` varchar(50),
	`buyerCompany` varchar(255),
	`ghlContactId` varchar(255),
	`showingDate` varchar(10) NOT NULL,
	`showingTime` varchar(10),
	`status` enum('scheduled','completed','cancelled','no_show') NOT NULL DEFAULT 'scheduled',
	`feedback` text,
	`interestLevel` enum('hot','warm','cold','none'),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `dispo_property_showings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `property_activity_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`propertyId` int NOT NULL,
	`eventType` enum('created','status_change','price_change','send','offer_received','offer_accepted','offer_rejected','showing_scheduled','showing_completed','buyer_matched','note_added','call_linked','document_generated','closing_scheduled','closed','field_updated') NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`buyerName` varchar(255),
	`buyerActivityId` int,
	`offerId` int,
	`showingId` int,
	`sendId` int,
	`callId` int,
	`metadata` text,
	`performedByUserId` int,
	`performedByName` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `property_activity_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `property_buyer_activity` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`propertyId` int NOT NULL,
	`buyerName` varchar(255) NOT NULL,
	`buyerPhone` varchar(50),
	`buyerEmail` varchar(255),
	`buyerCompany` varchar(255),
	`ghlContactId` varchar(255),
	`buyerMarkets` text,
	`buyerBudgetMin` int,
	`buyerBudgetMax` int,
	`buyerPropertyTypes` text,
	`buyerStrategy` varchar(100),
	`isVip` enum('true','false') DEFAULT 'false',
	`sendCount` int NOT NULL DEFAULT 0,
	`lastSentAt` timestamp,
	`lastSentChannel` varchar(50),
	`offerCount` int NOT NULL DEFAULT 0,
	`lastOfferAmount` int,
	`lastOfferAt` timestamp,
	`buyerStatus` enum('matched','sent','interested','offered','passed','accepted','skipped') NOT NULL DEFAULT 'matched',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `property_buyer_activity_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `property_stage_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`propertyId` int NOT NULL,
	`fromStatus` varchar(50),
	`toStatus` varchar(50) NOT NULL,
	`changedByUserId` int,
	`source` varchar(50) DEFAULT 'manual',
	`notes` text,
	`changedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `property_stage_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sync_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`syncType` enum('ghl_property_poll','ghl_property_import','ghl_call_poll','batchdialer_poll','batchleads_poll','webhook') NOT NULL,
	`syncStatus` enum('started','completed','failed') NOT NULL,
	`totalProcessed` int DEFAULT 0,
	`imported` int DEFAULT 0,
	`updated` int DEFAULT 0,
	`skipped` int DEFAULT 0,
	`errors` int DEFAULT 0,
	`errorMessages` text,
	`durationMs` int,
	`triggeredBy` varchar(50),
	`notes` text,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sync_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `badges` MODIFY COLUMN `category` enum('universal','lead_manager','acquisition_manager','lead_generator','dispo_manager') NOT NULL;--> statement-breakpoint
ALTER TABLE `call_grades` MODIFY COLUMN `rubricType` enum('lead_manager','acquisition_manager','lead_generator','follow_up','seller_callback','admin_callback','dispo_manager') NOT NULL;--> statement-breakpoint
ALTER TABLE `calls` MODIFY COLUMN `callType` enum('cold_call','qualification','follow_up','offer','seller_callback','admin_callback','dispo_buyer_pitch') DEFAULT 'qualification';--> statement-breakpoint
ALTER TABLE `daily_kpi_entries` MODIFY COLUMN `propertyAddress` text;--> statement-breakpoint
ALTER TABLE `grading_rules` MODIFY COLUMN `applicableTo` enum('all','lead_manager','acquisition_manager','lead_generator','dispo_manager') DEFAULT 'all';--> statement-breakpoint
ALTER TABLE `pending_invitations` MODIFY COLUMN `teamRole` enum('admin','lead_manager','acquisition_manager','lead_generator','dispo_manager') NOT NULL DEFAULT 'lead_manager';--> statement-breakpoint
ALTER TABLE `team_members` MODIFY COLUMN `teamRole` enum('admin','lead_manager','acquisition_manager','lead_generator','dispo_manager') NOT NULL;--> statement-breakpoint
ALTER TABLE `team_training_items` MODIFY COLUMN `teamRole` enum('lead_manager','acquisition_manager','lead_generator','dispo_manager');--> statement-breakpoint
ALTER TABLE `training_materials` MODIFY COLUMN `applicableTo` enum('all','lead_manager','acquisition_manager','lead_generator','dispo_manager') DEFAULT 'all';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `teamRole` enum('admin','lead_manager','acquisition_manager','lead_generator','dispo_manager') DEFAULT 'lead_manager';--> statement-breakpoint
ALTER TABLE `contact_cache` ADD `currentStage` varchar(100);--> statement-breakpoint
ALTER TABLE `contact_cache` ADD `source` varchar(100);--> statement-breakpoint
ALTER TABLE `contact_cache` ADD `market` varchar(100);--> statement-breakpoint
ALTER TABLE `contact_cache` ADD `buyBoxType` varchar(100);--> statement-breakpoint
ALTER TABLE `contact_cache` ADD `ghlOpportunityId` varchar(255);--> statement-breakpoint
ALTER TABLE `daily_kpi_entries` ADD `entryDate` varchar(10) NOT NULL;--> statement-breakpoint
ALTER TABLE `daily_kpi_entries` ADD `ghlReferenceId` varchar(255);--> statement-breakpoint
ALTER TABLE `daily_kpi_entries` ADD `kpi_source` enum('auto','manual') DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `dispo_daily_kpis` ADD CONSTRAINT `dispo_daily_kpis_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dispo_daily_kpis` ADD CONSTRAINT `dispo_daily_kpis_propertyId_dispo_properties_id_fk` FOREIGN KEY (`propertyId`) REFERENCES `dispo_properties`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dispo_properties` ADD CONSTRAINT `dispo_properties_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dispo_properties` ADD CONSTRAINT `dispo_properties_addedByUserId_users_id_fk` FOREIGN KEY (`addedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dispo_properties` ADD CONSTRAINT `dispo_properties_assignedToUserId_users_id_fk` FOREIGN KEY (`assignedToUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dispo_properties` ADD CONSTRAINT `dispo_properties_assignedAmUserId_users_id_fk` FOREIGN KEY (`assignedAmUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dispo_properties` ADD CONSTRAINT `dispo_properties_assignedLmUserId_users_id_fk` FOREIGN KEY (`assignedLmUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dispo_property_offers` ADD CONSTRAINT `dispo_property_offers_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dispo_property_offers` ADD CONSTRAINT `dispo_property_offers_propertyId_dispo_properties_id_fk` FOREIGN KEY (`propertyId`) REFERENCES `dispo_properties`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dispo_property_sends` ADD CONSTRAINT `dispo_property_sends_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dispo_property_sends` ADD CONSTRAINT `dispo_property_sends_propertyId_dispo_properties_id_fk` FOREIGN KEY (`propertyId`) REFERENCES `dispo_properties`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dispo_property_sends` ADD CONSTRAINT `dispo_property_sends_sentByUserId_users_id_fk` FOREIGN KEY (`sentByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dispo_property_showings` ADD CONSTRAINT `dispo_property_showings_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dispo_property_showings` ADD CONSTRAINT `dispo_property_showings_propertyId_dispo_properties_id_fk` FOREIGN KEY (`propertyId`) REFERENCES `dispo_properties`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `property_activity_log` ADD CONSTRAINT `property_activity_log_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `property_activity_log` ADD CONSTRAINT `property_activity_log_propertyId_dispo_properties_id_fk` FOREIGN KEY (`propertyId`) REFERENCES `dispo_properties`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `property_activity_log` ADD CONSTRAINT `property_activity_log_performedByUserId_users_id_fk` FOREIGN KEY (`performedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `property_buyer_activity` ADD CONSTRAINT `property_buyer_activity_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `property_buyer_activity` ADD CONSTRAINT `property_buyer_activity_propertyId_dispo_properties_id_fk` FOREIGN KEY (`propertyId`) REFERENCES `dispo_properties`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `property_stage_history` ADD CONSTRAINT `property_stage_history_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `property_stage_history` ADD CONSTRAINT `property_stage_history_propertyId_dispo_properties_id_fk` FOREIGN KEY (`propertyId`) REFERENCES `dispo_properties`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `property_stage_history` ADD CONSTRAINT `property_stage_history_changedByUserId_users_id_fk` FOREIGN KEY (`changedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contact_cache` DROP COLUMN `firstName`;--> statement-breakpoint
ALTER TABLE `contact_cache` DROP COLUMN `lastName`;--> statement-breakpoint
ALTER TABLE `contact_cache` DROP COLUMN `email`;--> statement-breakpoint
ALTER TABLE `contact_cache` DROP COLUMN `tags`;--> statement-breakpoint
ALTER TABLE `contact_cache` DROP COLUMN `address`;--> statement-breakpoint
ALTER TABLE `contact_cache` DROP COLUMN `companyName`;--> statement-breakpoint
ALTER TABLE `daily_kpi_entries` DROP COLUMN `date`;--> statement-breakpoint
ALTER TABLE `daily_kpi_entries` DROP COLUMN `source`;