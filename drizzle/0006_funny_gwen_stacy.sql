ALTER TABLE `team_training_items` ADD `isAiGenerated` enum('true','false') DEFAULT 'false';--> statement-breakpoint
ALTER TABLE `team_training_items` ADD `sourceCallIds` text;