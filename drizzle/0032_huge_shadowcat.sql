CREATE TABLE `ai_coach_preferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`userId` int NOT NULL,
	`category` enum('sms_style','note_style','task_style','coaching_tone','general') NOT NULL,
	`styleSummary` text NOT NULL,
	`recentExamples` text,
	`sampleCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ai_coach_preferences_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `ai_coach_preferences` ADD CONSTRAINT `ai_coach_preferences_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ai_coach_preferences` ADD CONSTRAINT `ai_coach_preferences_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;