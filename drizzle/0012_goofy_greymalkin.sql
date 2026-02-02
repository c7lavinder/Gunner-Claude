CREATE TABLE `team_assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`leadManagerId` int NOT NULL,
	`acquisitionManagerId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `team_assignments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `team_assignments` ADD CONSTRAINT `team_assignments_leadManagerId_team_members_id_fk` FOREIGN KEY (`leadManagerId`) REFERENCES `team_members`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `team_assignments` ADD CONSTRAINT `team_assignments_acquisitionManagerId_team_members_id_fk` FOREIGN KEY (`acquisitionManagerId`) REFERENCES `team_members`(`id`) ON DELETE no action ON UPDATE no action;