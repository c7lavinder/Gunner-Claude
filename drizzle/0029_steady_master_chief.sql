ALTER TABLE `user_badges` ADD `badgeCode` varchar(64) NOT NULL;--> statement-breakpoint
ALTER TABLE `user_badges` ADD `progress` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `user_badges` ADD `triggerCallId` int;--> statement-breakpoint
ALTER TABLE `user_badges` ADD `isViewed` enum('true','false') DEFAULT 'false';--> statement-breakpoint
ALTER TABLE `user_badges` ADD CONSTRAINT `user_badges_triggerCallId_calls_id_fk` FOREIGN KEY (`triggerCallId`) REFERENCES `calls`(`id`) ON DELETE no action ON UPDATE no action;