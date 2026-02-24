CREATE TABLE `call_next_steps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`callId` int NOT NULL,
	`tenantId` int,
	`actionType` varchar(50) NOT NULL,
	`reason` text NOT NULL,
	`suggested` varchar(5) NOT NULL DEFAULT 'true',
	`payload` json NOT NULL,
	`status` enum('pending','pushed','skipped','failed') DEFAULT 'pending',
	`result` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `call_next_steps_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `call_next_steps` ADD CONSTRAINT `call_next_steps_callId_calls_id_fk` FOREIGN KEY (`callId`) REFERENCES `calls`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `call_next_steps` ADD CONSTRAINT `call_next_steps_tenantId_tenants_id_fk` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;