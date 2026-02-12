ALTER TABLE `opportunities` ADD `ghlOpportunityId` varchar(255);--> statement-breakpoint
ALTER TABLE `opportunities` ADD `ghlPipelineStageId` varchar(255);--> statement-breakpoint
ALTER TABLE `opportunities` ADD `ghlPipelineStageName` varchar(255);--> statement-breakpoint
ALTER TABLE `opportunities` ADD `detectionSource` enum('pipeline','conversation','transcript','hybrid') DEFAULT 'pipeline' NOT NULL;--> statement-breakpoint
ALTER TABLE `opportunities` ADD `assignedTo` varchar(255);--> statement-breakpoint
ALTER TABLE `opportunities` ADD `lastActivityAt` timestamp;--> statement-breakpoint
ALTER TABLE `opportunities` ADD `lastStageChangeAt` timestamp;