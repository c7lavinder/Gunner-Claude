ALTER TABLE `calls` ADD `transcriptUrl` text;--> statement-breakpoint
ALTER TABLE `calls` ADD `isArchived` enum('true','false') DEFAULT 'false';--> statement-breakpoint
ALTER TABLE `calls` ADD `archivedAt` timestamp;