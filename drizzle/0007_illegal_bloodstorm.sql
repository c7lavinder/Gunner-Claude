CREATE TABLE `brand_assets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`assetType` enum('logo','color_palette','font','style_guide','image','video','document','other') NOT NULL,
	`fileUrl` text,
	`fileKey` varchar(512),
	`mimeType` varchar(128),
	`fileSize` int,
	`metadata` text,
	`isActive` enum('true','false') DEFAULT 'true',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `brand_assets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `content_ideas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(500) NOT NULL,
	`description` text,
	`category` varchar(255),
	`targetPlatform` enum('x_twitter','blog','meta','any') DEFAULT 'any',
	`status` enum('new','in_progress','used','archived') DEFAULT 'new',
	`usedInPostId` int,
	`isAiGenerated` enum('true','false') DEFAULT 'false',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `content_ideas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `social_posts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contentType` enum('brand','creator') NOT NULL,
	`platform` enum('blog','meta_facebook','meta_instagram','google_business','x_twitter','linkedin','other') NOT NULL,
	`title` varchar(500),
	`content` text NOT NULL,
	`excerpt` text,
	`slug` varchar(255),
	`mediaUrls` text,
	`hashtags` text,
	`mentions` text,
	`status` enum('draft','scheduled','published','failed') DEFAULT 'draft',
	`scheduledAt` timestamp,
	`publishedAt` timestamp,
	`externalPostId` varchar(255),
	`isAiGenerated` enum('true','false') DEFAULT 'false',
	`aiPrompt` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `social_posts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `content_ideas` ADD CONSTRAINT `content_ideas_usedInPostId_social_posts_id_fk` FOREIGN KEY (`usedInPostId`) REFERENCES `social_posts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `social_posts` ADD CONSTRAINT `social_posts_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;