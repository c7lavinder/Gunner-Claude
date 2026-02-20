CREATE TABLE `user_instructions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`instruction` text NOT NULL,
	`category` varchar(50) NOT NULL DEFAULT 'general',
	`isActive` varchar(5) NOT NULL DEFAULT 'true',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_instructions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `user_instructions` ADD CONSTRAINT `user_instructions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;