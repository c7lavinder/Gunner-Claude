ALTER TABLE `dispo_properties` MODIFY COLUMN `projectType` varchar(255);--> statement-breakpoint
ALTER TABLE `dispo_properties` ADD `lastContactedAt` timestamp;--> statement-breakpoint
ALTER TABLE `dispo_properties` ADD `lastConversationAt` timestamp;