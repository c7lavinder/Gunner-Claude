CREATE TABLE `daily_kpi_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`userId` int NOT NULL,
	`date` varchar(10) NOT NULL,
	`kpiType` enum('call','conversation','appointment','offer','contract') NOT NULL,
	`contactId` varchar(255),
	`contactName` varchar(255),
	`propertyAddress` varchar(500),
	`notes` text,
	`source` enum('auto','manual') NOT NULL DEFAULT 'manual',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `daily_kpi_entries_id` PRIMARY KEY(`id`)
);
