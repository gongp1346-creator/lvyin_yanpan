CREATE TABLE `predictions` (
	`id` text PRIMARY KEY NOT NULL,
	`prediction_key` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`kickoff` text,
	`match_date` text NOT NULL,
	`competition` text NOT NULL,
	`home_team` text NOT NULL,
	`away_team` text NOT NULL,
	`home_key` text NOT NULL,
	`away_key` text NOT NULL,
	`recommendation` text NOT NULL,
	`predicted_outcome` text,
	`probability_home` real,
	`probability_draw` real,
	`probability_away` real,
	`odds_home` real,
	`odds_draw` real,
	`odds_away` real,
	`model_version` text NOT NULL,
	`status` text NOT NULL,
	`actual_result` text,
	`correct` integer,
	`profit` real,
	`settled_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `predictions_key_unique` ON `predictions` (`prediction_key`);
--> statement-breakpoint
CREATE INDEX `predictions_status_date_idx` ON `predictions` (`status`,`match_date`);
--> statement-breakpoint
CREATE INDEX `predictions_match_idx` ON `predictions` (`competition`,`match_date`,`home_key`,`away_key`);
