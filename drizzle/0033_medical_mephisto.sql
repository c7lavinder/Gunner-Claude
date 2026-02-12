CREATE TABLE `coach_action_edits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`userId` int NOT NULL,
	`actionLogId` int NOT NULL,
	`category` enum('sms','note','task') NOT NULL,
	`draftContent` text NOT NULL,
	`finalContent` text NOT NULL,
	`wasEdited` enum('true','false') NOT NULL DEFAULT 'false',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `coach_action_edits_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `ai_coach_preferences` MODIFY COLUMN `userId` int;--> statement-breakpoint
ALTER TABLE `ai_coach_preferences` ADD `pref_category` enum('sms_style','note_style','task_style') NOT NULL;--> statement-breakpoint
ALTER TABLE `coach_action_edits` ADD CONSTRAINT `coach_action_edits_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coach_action_edits` ADD CONSTRAINT `coach_action_edits_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coach_action_edits` ADD CONSTRAINT `coach_action_edits_actionLogId_coach_action_log_id_fk` FOREIGN KEY (`actionLogId`) REFERENCES `coach_action_log`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ai_coach_preferences` DROP COLUMN `category`;