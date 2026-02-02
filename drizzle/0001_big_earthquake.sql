CREATE TABLE `call_grades` (
	`id` int AUTO_INCREMENT NOT NULL,
	`callId` int NOT NULL,
	`overallScore` decimal(5,2),
	`overallGrade` enum('A','B','C','D','F'),
	`criteriaScores` json,
	`strengths` json,
	`improvements` json,
	`coachingTips` json,
	`redFlags` json,
	`summary` text,
	`rubricType` enum('lead_manager','acquisition_manager') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `call_grades_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `calls` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ghlCallId` varchar(255),
	`ghlContactId` varchar(255),
	`ghlLocationId` varchar(255),
	`contactName` varchar(255),
	`contactPhone` varchar(50),
	`propertyAddress` text,
	`recordingUrl` text,
	`duration` int,
	`callDirection` enum('inbound','outbound') DEFAULT 'outbound',
	`teamMemberId` int,
	`teamMemberName` varchar(255),
	`callType` enum('qualification','offer') DEFAULT 'qualification',
	`status` enum('pending','transcribing','grading','completed','failed') DEFAULT 'pending',
	`transcript` text,
	`callTimestamp` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `calls_id` PRIMARY KEY(`id`),
	CONSTRAINT `calls_ghlCallId_unique` UNIQUE(`ghlCallId`)
);
--> statement-breakpoint
CREATE TABLE `performance_metrics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teamMemberId` int NOT NULL,
	`periodType` enum('daily','weekly','monthly','all_time') NOT NULL,
	`periodStart` timestamp NOT NULL,
	`periodEnd` timestamp NOT NULL,
	`totalCalls` int DEFAULT 0,
	`averageScore` decimal(5,2),
	`aGradeCount` int DEFAULT 0,
	`bGradeCount` int DEFAULT 0,
	`cGradeCount` int DEFAULT 0,
	`dGradeCount` int DEFAULT 0,
	`fGradeCount` int DEFAULT 0,
	`scoreChange` decimal(5,2),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `performance_metrics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `team_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`teamRole` enum('admin','lead_manager','acquisition_manager') NOT NULL,
	`userId` int,
	`ghlUserId` varchar(255),
	`isActive` enum('true','false') DEFAULT 'true',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `team_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `teamRole` enum('admin','lead_manager','acquisition_manager') DEFAULT 'lead_manager';--> statement-breakpoint
ALTER TABLE `call_grades` ADD CONSTRAINT `call_grades_callId_calls_id_fk` FOREIGN KEY (`callId`) REFERENCES `calls`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `calls` ADD CONSTRAINT `calls_teamMemberId_team_members_id_fk` FOREIGN KEY (`teamMemberId`) REFERENCES `team_members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `performance_metrics` ADD CONSTRAINT `performance_metrics_teamMemberId_team_members_id_fk` FOREIGN KEY (`teamMemberId`) REFERENCES `team_members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `team_members` ADD CONSTRAINT `team_members_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;