ALTER TABLE `opportunities` ADD `dismissReason` enum('false_positive','not_a_deal','already_handled','duplicate','other');--> statement-breakpoint
ALTER TABLE `opportunities` ADD `dismissNote` text;