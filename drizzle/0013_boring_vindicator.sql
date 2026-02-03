CREATE TABLE `badge_progress` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teamMemberId` int NOT NULL,
	`badgeCode` varchar(50) NOT NULL,
	`currentCount` int NOT NULL DEFAULT 0,
	`lastUpdated` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `badge_progress_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `badges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(50) NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`icon` varchar(10),
	`category` enum('universal','lead_manager','acquisition_manager') NOT NULL,
	`tier` enum('bronze','silver','gold') NOT NULL,
	`target` int NOT NULL,
	`criteriaType` varchar(50) NOT NULL,
	`criteriaConfig` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `badges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `deals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ghlOpportunityId` varchar(255) NOT NULL,
	`ghlContactId` varchar(255),
	`teamMemberId` int,
	`callId` int,
	`dealValue` int,
	`closedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `deals_id` PRIMARY KEY(`id`),
	CONSTRAINT `deals_ghlOpportunityId_unique` UNIQUE(`ghlOpportunityId`)
);
--> statement-breakpoint
CREATE TABLE `reward_views` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teamMemberId` int NOT NULL,
	`callId` int NOT NULL,
	`xpAwarded` int NOT NULL DEFAULT 0,
	`viewedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reward_views_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_badges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teamMemberId` int NOT NULL,
	`badgeId` int NOT NULL,
	`earnedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_badges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_streaks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teamMemberId` int NOT NULL,
	`hotStreakCurrent` int NOT NULL DEFAULT 0,
	`hotStreakBest` int NOT NULL DEFAULT 0,
	`hotStreakLastCallId` int,
	`consistencyStreakCurrent` int NOT NULL DEFAULT 0,
	`consistencyStreakBest` int NOT NULL DEFAULT 0,
	`consistencyLastDate` varchar(10),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_streaks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_xp` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teamMemberId` int NOT NULL,
	`totalXp` int NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_xp_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `xp_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teamMemberId` int NOT NULL,
	`amount` int NOT NULL,
	`reason` varchar(100) NOT NULL,
	`callId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `xp_transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `badge_progress` ADD CONSTRAINT `badge_progress_teamMemberId_team_members_id_fk` FOREIGN KEY (`teamMemberId`) REFERENCES `team_members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `deals` ADD CONSTRAINT `deals_teamMemberId_team_members_id_fk` FOREIGN KEY (`teamMemberId`) REFERENCES `team_members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `deals` ADD CONSTRAINT `deals_callId_calls_id_fk` FOREIGN KEY (`callId`) REFERENCES `calls`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reward_views` ADD CONSTRAINT `reward_views_teamMemberId_team_members_id_fk` FOREIGN KEY (`teamMemberId`) REFERENCES `team_members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reward_views` ADD CONSTRAINT `reward_views_callId_calls_id_fk` FOREIGN KEY (`callId`) REFERENCES `calls`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_badges` ADD CONSTRAINT `user_badges_teamMemberId_team_members_id_fk` FOREIGN KEY (`teamMemberId`) REFERENCES `team_members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_badges` ADD CONSTRAINT `user_badges_badgeId_badges_id_fk` FOREIGN KEY (`badgeId`) REFERENCES `badges`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_streaks` ADD CONSTRAINT `user_streaks_teamMemberId_team_members_id_fk` FOREIGN KEY (`teamMemberId`) REFERENCES `team_members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_xp` ADD CONSTRAINT `user_xp_teamMemberId_team_members_id_fk` FOREIGN KEY (`teamMemberId`) REFERENCES `team_members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `xp_transactions` ADD CONSTRAINT `xp_transactions_teamMemberId_team_members_id_fk` FOREIGN KEY (`teamMemberId`) REFERENCES `team_members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `xp_transactions` ADD CONSTRAINT `xp_transactions_callId_calls_id_fk` FOREIGN KEY (`callId`) REFERENCES `calls`(`id`) ON DELETE no action ON UPDATE no action;