CREATE TABLE `deal_content_edits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`distributionId` int NOT NULL,
	`contentType` enum('sms','email_subject','email_body') NOT NULL,
	`originalContent` text NOT NULL,
	`editedContent` text NOT NULL,
	`editBuyerTier` enum('priority','qualified','jv_partner','unqualified') NOT NULL,
	`editedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `deal_content_edits_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `deal_distributions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`propertyId` int NOT NULL,
	`buyerTier` enum('priority','qualified','jv_partner','unqualified') NOT NULL,
	`smsContent` text,
	`emailSubject` varchar(500),
	`emailBody` text,
	`pdfUrl` text,
	`pdfFileKey` varchar(512),
	`editedSmsContent` text,
	`editedEmailSubject` varchar(500),
	`editedEmailBody` text,
	`distStatus` enum('draft','reviewed','sent') NOT NULL DEFAULT 'draft',
	`generatedByUserId` int,
	`reviewedByUserId` int,
	`reviewedAt` timestamp,
	`sentAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `deal_distributions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `property_buyer_activity` ADD `buyerTier` enum('priority','qualified','jv_partner','unqualified','halted') DEFAULT 'qualified';--> statement-breakpoint
ALTER TABLE `deal_content_edits` ADD CONSTRAINT `deal_content_edits_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `deal_content_edits` ADD CONSTRAINT `deal_content_edits_distributionId_deal_distributions_id_fk` FOREIGN KEY (`distributionId`) REFERENCES `deal_distributions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `deal_content_edits` ADD CONSTRAINT `deal_content_edits_editedByUserId_users_id_fk` FOREIGN KEY (`editedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `deal_distributions` ADD CONSTRAINT `deal_distributions_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `deal_distributions` ADD CONSTRAINT `deal_distributions_propertyId_dispo_properties_id_fk` FOREIGN KEY (`propertyId`) REFERENCES `dispo_properties`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `deal_distributions` ADD CONSTRAINT `deal_distributions_generatedByUserId_users_id_fk` FOREIGN KEY (`generatedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `deal_distributions` ADD CONSTRAINT `deal_distributions_reviewedByUserId_users_id_fk` FOREIGN KEY (`reviewedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;