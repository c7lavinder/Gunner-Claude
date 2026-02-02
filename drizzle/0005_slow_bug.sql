CREATE TABLE `team_training_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`itemType` enum('skill','issue','win','agenda') NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`targetBehavior` text,
	`callReference` int,
	`sortOrder` int DEFAULT 0,
	`priority` enum('low','medium','high','urgent') DEFAULT 'medium',
	`teamMemberId` int,
	`teamMemberName` varchar(255),
	`status` enum('active','in_progress','completed','archived') DEFAULT 'active',
	`meetingDate` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `team_training_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `team_training_items` ADD CONSTRAINT `team_training_items_callReference_calls_id_fk` FOREIGN KEY (`callReference`) REFERENCES `calls`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `team_training_items` ADD CONSTRAINT `team_training_items_teamMemberId_team_members_id_fk` FOREIGN KEY (`teamMemberId`) REFERENCES `team_members`(`id`) ON DELETE no action ON UPDATE no action;