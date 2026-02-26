CREATE TABLE `ghl_oauth_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`locationId` varchar(255) NOT NULL,
	`companyId` varchar(255),
	`ghlUserId` varchar(255),
	`accessToken` text NOT NULL,
	`refreshToken` text NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`scopes` text,
	`userType` varchar(50) DEFAULT 'Location',
	`isActive` enum('true','false') DEFAULT 'true',
	`lastRefreshedAt` timestamp,
	`lastError` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ghl_oauth_tokens_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `ghl_oauth_tokens` ADD CONSTRAINT `ghl_oauth_tokens_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;