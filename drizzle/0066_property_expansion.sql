-- Property Database Expansion: Add acquisition-stage fields, milestone flags, and stage history

-- Change status from ENUM to VARCHAR(50)
ALTER TABLE `dispo_properties` MODIFY COLUMN `status` varchar(50) NOT NULL DEFAULT 'lead';

-- Add acquisition-stage fields
ALTER TABLE `dispo_properties` ADD COLUMN `leadSource` varchar(100);
ALTER TABLE `dispo_properties` ADD COLUMN `leadSourceDetail` varchar(255);
ALTER TABLE `dispo_properties` ADD COLUMN `assignedAmUserId` int;
ALTER TABLE `dispo_properties` ADD COLUMN `assignedLmUserId` int;

-- Add offer tracking (acquisition side)
ALTER TABLE `dispo_properties` ADD COLUMN `ourOfferAmount` int;
ALTER TABLE `dispo_properties` ADD COLUMN `offerDate` timestamp NULL;
ALTER TABLE `dispo_properties` ADD COLUMN `counterOfferAmount` int;
ALTER TABLE `dispo_properties` ADD COLUMN `contractDate` timestamp NULL;

-- Add closing details
ALTER TABLE `dispo_properties` ADD COLUMN `closingDate` timestamp NULL;
ALTER TABLE `dispo_properties` ADD COLUMN `actualCloseDate` timestamp NULL;
ALTER TABLE `dispo_properties` ADD COLUMN `assignmentAmount` int;
ALTER TABLE `dispo_properties` ADD COLUMN `buyerGhlContactId` varchar(255);
ALTER TABLE `dispo_properties` ADD COLUMN `buyerName` varchar(255);
ALTER TABLE `dispo_properties` ADD COLUMN `buyerCompany` varchar(255);
ALTER TABLE `dispo_properties` ADD COLUMN `expectedCloseDate` timestamp NULL;

-- Add pipeline metadata
ALTER TABLE `dispo_properties` ADD COLUMN `stageChangedAt` timestamp NULL;

-- Add milestone flags
ALTER TABLE `dispo_properties` ADD COLUMN `aptEverSet` boolean DEFAULT false;
ALTER TABLE `dispo_properties` ADD COLUMN `offerEverMade` boolean DEFAULT false;
ALTER TABLE `dispo_properties` ADD COLUMN `everUnderContract` boolean DEFAULT false;
ALTER TABLE `dispo_properties` ADD COLUMN `everClosed` boolean DEFAULT false;

-- Add GHL opportunity tracking
ALTER TABLE `dispo_properties` ADD COLUMN `ghlOpportunityId` varchar(255);
ALTER TABLE `dispo_properties` ADD COLUMN `ghlPipelineId` varchar(255);
ALTER TABLE `dispo_properties` ADD COLUMN `ghlPipelineStageId` varchar(255);

-- Add foreign key constraints for new user references
ALTER TABLE `dispo_properties` ADD CONSTRAINT `dispo_properties_assignedAmUserId_users_id_fk` FOREIGN KEY (`assignedAmUserId`) REFERENCES `users`(`id`);
ALTER TABLE `dispo_properties` ADD CONSTRAINT `dispo_properties_assignedLmUserId_users_id_fk` FOREIGN KEY (`assignedLmUserId`) REFERENCES `users`(`id`);

-- Create property stage history table
CREATE TABLE IF NOT EXISTS `property_stage_history` (
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
ALTER TABLE `property_stage_history` ADD CONSTRAINT `property_stage_history_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`);
--> statement-breakpoint
ALTER TABLE `property_stage_history` ADD CONSTRAINT `property_stage_history_propertyId_dispo_properties_id_fk` FOREIGN KEY (`propertyId`) REFERENCES `dispo_properties`(`id`);
--> statement-breakpoint
ALTER TABLE `property_stage_history` ADD CONSTRAINT `property_stage_history_changedByUserId_users_id_fk` FOREIGN KEY (`changedByUserId`) REFERENCES `users`(`id`);

-- Add indexes for performance
CREATE INDEX `idx_props_tenant_status` ON `dispo_properties`(`tenantId`, `status`);
CREATE INDEX `idx_props_ghl_contact` ON `dispo_properties`(`tenantId`, `ghlContactId`);
CREATE INDEX `idx_props_assigned_am` ON `dispo_properties`(`tenantId`, `assignedAmUserId`);
CREATE INDEX `idx_props_ghl_opportunity` ON `dispo_properties`(`tenantId`, `ghlOpportunityId`);
CREATE INDEX `idx_stage_history_property` ON `property_stage_history`(`propertyId`, `changedAt`);

-- Migrate existing status values
UPDATE `dispo_properties` SET `status` = 'lead' WHERE `status` = 'new';
UPDATE `dispo_properties` SET `status` = 'closed' WHERE `status` = 'sold';
UPDATE `dispo_properties` SET `status` = 'buyer_negotiating' WHERE `status` = 'negotiating';

-- Backfill milestone flags based on current status
UPDATE `dispo_properties` SET `everClosed` = true, `everUnderContract` = true, `offerEverMade` = true WHERE `status` = 'closed';
UPDATE `dispo_properties` SET `everUnderContract` = true, `offerEverMade` = true WHERE `status` IN ('under_contract', 'marketing', 'buyer_negotiating', 'closing');
UPDATE `dispo_properties` SET `offerEverMade` = true WHERE `status` = 'offer_made';
