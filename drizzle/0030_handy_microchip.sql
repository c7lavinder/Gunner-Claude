CREATE TABLE `coach_action_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`requestedBy` int NOT NULL,
	`requestedByName` varchar(255),
	`actionType` enum('add_note_contact','add_note_opportunity','change_pipeline_stage','send_sms','create_task','add_tag','remove_tag','update_field') NOT NULL,
	`requestText` text NOT NULL,
	`targetContactId` varchar(255),
	`targetContactName` varchar(255),
	`targetOpportunityId` varchar(255),
	`payload` json,
	`status` enum('pending','confirmed','executed','failed','cancelled') NOT NULL DEFAULT 'pending',
	`error` text,
	`confirmedAt` timestamp,
	`executedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `coach_action_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `opportunities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`contactName` varchar(255),
	`contactPhone` varchar(50),
	`propertyAddress` text,
	`ghlContactId` varchar(255),
	`tier` enum('missed','warning','possible') NOT NULL,
	`priorityScore` int NOT NULL DEFAULT 0,
	`triggerRules` json NOT NULL,
	`reason` text NOT NULL,
	`suggestion` text NOT NULL,
	`relatedCallId` int,
	`teamMemberId` int,
	`teamMemberName` varchar(255),
	`status` enum('active','handled','dismissed') NOT NULL DEFAULT 'active',
	`resolvedBy` int,
	`resolvedAt` timestamp,
	`flaggedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `opportunities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `coach_action_log` ADD CONSTRAINT `coach_action_log_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coach_action_log` ADD CONSTRAINT `coach_action_log_requestedBy_users_id_fk` FOREIGN KEY (`requestedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `opportunities` ADD CONSTRAINT `opportunities_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `opportunities` ADD CONSTRAINT `opportunities_relatedCallId_calls_id_fk` FOREIGN KEY (`relatedCallId`) REFERENCES `calls`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `opportunities` ADD CONSTRAINT `opportunities_teamMemberId_team_members_id_fk` FOREIGN KEY (`teamMemberId`) REFERENCES `team_members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `opportunities` ADD CONSTRAINT `opportunities_resolvedBy_users_id_fk` FOREIGN KEY (`resolvedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;