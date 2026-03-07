ALTER TABLE `contact_cache` ADD `buyerTier` varchar(50);--> statement-breakpoint
ALTER TABLE `contact_cache` ADD `responseSpeed` varchar(50);--> statement-breakpoint
ALTER TABLE `contact_cache` ADD `verifiedFunding` varchar(10);--> statement-breakpoint
ALTER TABLE `contact_cache` ADD `hasPurchasedBefore` varchar(10);--> statement-breakpoint
ALTER TABLE `contact_cache` ADD `secondaryMarket` varchar(255);--> statement-breakpoint
ALTER TABLE `contact_cache` ADD `buyerNotes` text;--> statement-breakpoint
ALTER TABLE `contact_cache` ADD `lastContactDate` timestamp;--> statement-breakpoint
ALTER TABLE `contact_cache` ADD `email` varchar(255);