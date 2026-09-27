CREATE TABLE `onboarding_profiles` (
	`session_id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`agent_name` text DEFAULT '' NOT NULL,
	`user_name` text DEFAULT '' NOT NULL,
	`primary_need` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `voice_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`device_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_voice_messages_session_created` ON `voice_messages` (`session_id`,`created_at`);