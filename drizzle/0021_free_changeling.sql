CREATE TABLE `emails_sent` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`emailId` varchar(100) NOT NULL,
	`sentAt` timestamp NOT NULL DEFAULT (now()),
	`loopsEventId` varchar(255),
	`status` enum('sent','failed','bounced') DEFAULT 'sent',
	CONSTRAINT `emails_sent_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `emails_sent` ADD CONSTRAINT `emails_sent_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;