CREATE TABLE `ai_feedback` (
	`id` int AUTO_INCREMENT NOT NULL,
	`callId` int,
	`callGradeId` int,
	`userId` int,
	`feedbackType` enum('score_too_high','score_too_low','wrong_criteria','missed_issue','incorrect_feedback','general_correction','praise') NOT NULL,
	`criteriaName` varchar(255),
	`originalScore` decimal(5,2),
	`originalGrade` enum('A','B','C','D','F'),
	`suggestedScore` decimal(5,2),
	`suggestedGrade` enum('A','B','C','D','F'),
	`explanation` text NOT NULL,
	`correctBehavior` text,
	`status` enum('pending','reviewed','incorporated','dismissed') DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ai_feedback_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `grading_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`ruleText` text NOT NULL,
	`priority` int DEFAULT 0,
	`applicableTo` enum('all','lead_manager','acquisition_manager') DEFAULT 'all',
	`isActive` enum('true','false') DEFAULT 'true',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `grading_rules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `training_materials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`content` text,
	`fileName` varchar(255),
	`fileUrl` text,
	`fileType` varchar(50),
	`category` enum('script','objection_handling','methodology','best_practices','examples','other') DEFAULT 'other',
	`applicableTo` enum('all','lead_manager','acquisition_manager') DEFAULT 'all',
	`isActive` enum('true','false') DEFAULT 'true',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `training_materials_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `ai_feedback` ADD CONSTRAINT `ai_feedback_callId_calls_id_fk` FOREIGN KEY (`callId`) REFERENCES `calls`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ai_feedback` ADD CONSTRAINT `ai_feedback_callGradeId_call_grades_id_fk` FOREIGN KEY (`callGradeId`) REFERENCES `call_grades`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ai_feedback` ADD CONSTRAINT `ai_feedback_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;