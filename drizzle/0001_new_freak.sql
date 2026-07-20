CREATE TABLE `brand_profiles` (
	`id` varchar(36) NOT NULL,
	`businessId` varchar(36) NOT NULL,
	`userId` int NOT NULL,
	`brandSummary` text NOT NULL,
	`brandVoice` text NOT NULL,
	`toneKeywords` json NOT NULL,
	`brandColors` json NOT NULL,
	`messagingThemes` json NOT NULL,
	`audienceInsights` text NOT NULL,
	`audienceSegments` json NOT NULL,
	`services` json NOT NULL,
	`keywords` json NOT NULL,
	`keyDifferentiators` json NOT NULL,
	`visualStyle` text NOT NULL,
	`imageGuidance` text NOT NULL,
	`contentPillars` json NOT NULL,
	`avoidTopics` json NOT NULL,
	`confidenceScore` int NOT NULL DEFAULT 0,
	`isConfirmed` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `brand_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `brand_profiles_business_unique` UNIQUE(`businessId`)
);
--> statement-breakpoint
CREATE TABLE `businesses` (
	`id` varchar(36) NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(200) NOT NULL,
	`websiteUrl` varchar(2048) NOT NULL,
	`industry` varchar(160) NOT NULL,
	`tonePreference` varchar(160),
	`keyDifferentiators` json NOT NULL,
	`city` varchar(120),
	`state` varchar(120),
	`country` varchar(120) NOT NULL DEFAULT 'United States',
	`status` enum('draft','analyzing','ready','error') NOT NULL DEFAULT 'draft',
	`lastAnalyzedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `businesses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `generated_posts` (
	`id` varchar(36) NOT NULL,
	`businessId` varchar(36) NOT NULL,
	`userId` int NOT NULL,
	`generationRunId` varchar(36),
	`title` varchar(160) NOT NULL,
	`caption` text NOT NULL,
	`hashtags` json NOT NULL,
	`callToAction` varchar(320) NOT NULL,
	`topic` varchar(200) NOT NULL,
	`tone` varchar(160) NOT NULL,
	`audienceAngle` text NOT NULL,
	`imagePrompt` text NOT NULL,
	`imageAltText` text NOT NULL,
	`imageUrl` varchar(2048),
	`imageStorageKey` varchar(1024),
	`imageStatus` enum('pending','generating','ready','failed') NOT NULL DEFAULT 'pending',
	`imageError` text,
	`status` enum('draft','approved','scheduled','rejected') NOT NULL DEFAULT 'draft',
	`scheduledAt` timestamp,
	`position` int NOT NULL DEFAULT 0,
	`rejectionReason` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `generated_posts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `generation_runs` (
	`id` varchar(36) NOT NULL,
	`businessId` varchar(36) NOT NULL,
	`userId` int NOT NULL,
	`calendarMonth` varchar(7) NOT NULL,
	`targetPostCount` int NOT NULL,
	`generatedPostCount` int NOT NULL DEFAULT 0,
	`progressPercent` int NOT NULL DEFAULT 0,
	`status` enum('queued','analyzing','generating','completed','failed') NOT NULL DEFAULT 'queued',
	`generationModel` varchar(80) NOT NULL,
	`errorMessage` text,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `generation_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `website_analyses` (
	`id` varchar(36) NOT NULL,
	`businessId` varchar(36) NOT NULL,
	`userId` int NOT NULL,
	`sourceUrl` varchar(2048) NOT NULL,
	`sourceTitle` varchar(500),
	`scrapedText` text NOT NULL,
	`sourceMetadata` json NOT NULL,
	`analysisResult` json NOT NULL,
	`analysisModel` varchar(80) NOT NULL,
	`status` enum('completed','failed') NOT NULL,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `website_analyses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `brand_profiles` ADD CONSTRAINT `brand_profiles_businessId_businesses_id_fk` FOREIGN KEY (`businessId`) REFERENCES `businesses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `brand_profiles` ADD CONSTRAINT `brand_profiles_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `businesses` ADD CONSTRAINT `businesses_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `generated_posts` ADD CONSTRAINT `generated_posts_businessId_businesses_id_fk` FOREIGN KEY (`businessId`) REFERENCES `businesses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `generated_posts` ADD CONSTRAINT `generated_posts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `generated_posts` ADD CONSTRAINT `generated_posts_generationRunId_generation_runs_id_fk` FOREIGN KEY (`generationRunId`) REFERENCES `generation_runs`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `generation_runs` ADD CONSTRAINT `generation_runs_businessId_businesses_id_fk` FOREIGN KEY (`businessId`) REFERENCES `businesses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `generation_runs` ADD CONSTRAINT `generation_runs_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `website_analyses` ADD CONSTRAINT `website_analyses_businessId_businesses_id_fk` FOREIGN KEY (`businessId`) REFERENCES `businesses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `website_analyses` ADD CONSTRAINT `website_analyses_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `brand_profiles_owner_idx` ON `brand_profiles` (`userId`);--> statement-breakpoint
CREATE INDEX `businesses_owner_idx` ON `businesses` (`userId`);--> statement-breakpoint
CREATE INDEX `businesses_owner_status_idx` ON `businesses` (`userId`,`status`);--> statement-breakpoint
CREATE INDEX `generated_posts_owner_schedule_idx` ON `generated_posts` (`userId`,`scheduledAt`);--> statement-breakpoint
CREATE INDEX `generated_posts_business_schedule_idx` ON `generated_posts` (`businessId`,`scheduledAt`);--> statement-breakpoint
CREATE INDEX `generated_posts_run_idx` ON `generated_posts` (`generationRunId`);--> statement-breakpoint
CREATE INDEX `generated_posts_owner_status_idx` ON `generated_posts` (`userId`,`status`);--> statement-breakpoint
CREATE INDEX `generation_runs_owner_month_idx` ON `generation_runs` (`userId`,`calendarMonth`);--> statement-breakpoint
CREATE INDEX `generation_runs_business_month_idx` ON `generation_runs` (`businessId`,`calendarMonth`);--> statement-breakpoint
CREATE INDEX `website_analyses_business_created_idx` ON `website_analyses` (`businessId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `website_analyses_owner_idx` ON `website_analyses` (`userId`);