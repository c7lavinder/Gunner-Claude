CREATE TABLE `coach_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`userId` int NOT NULL,
	`coach_msg_role` enum('user','assistant') NOT NULL,
	`content` text NOT NULL,
	`exchangeId` varchar(36) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `coach_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `coach_messages` ADD CONSTRAINT `coach_messages_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coach_messages` ADD CONSTRAINT `coach_messages_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;