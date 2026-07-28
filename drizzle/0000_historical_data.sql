CREATE TABLE `import_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`file_name` text NOT NULL,
	`season` text NOT NULL,
	`status` text NOT NULL,
	`rows_total` integer NOT NULL,
	`rows_imported` integer NOT NULL,
	`rows_skipped` integer NOT NULL,
	`rows_invalid` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `import_jobs_created_at_idx` ON `import_jobs` (`created_at`);
--> statement-breakpoint
CREATE TABLE `matches` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`source_key` text NOT NULL,
	`file_name` text,
	`competition` text NOT NULL,
	`season` text NOT NULL,
	`match_date` text NOT NULL,
	`kickoff` text,
	`home_team` text NOT NULL,
	`away_team` text NOT NULL,
	`home_key` text NOT NULL,
	`away_key` text NOT NULL,
	`home_goals` integer,
	`away_goals` integer,
	`result` text,
	`referee` text,
	`home_shots` integer,
	`away_shots` integer,
	`home_shots_target` integer,
	`away_shots_target` integer,
	`home_corners` integer,
	`away_corners` integer,
	`home_yellow` integer,
	`away_yellow` integer,
	`home_red` integer,
	`away_red` integer,
	`odds_home` real,
	`odds_draw` real,
	`odds_away` real,
	`imported_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `matches_source_key_unique` ON `matches` (`source_key`);
--> statement-breakpoint
CREATE INDEX `matches_date_idx` ON `matches` (`match_date`);
--> statement-breakpoint
CREATE INDEX `matches_home_key_idx` ON `matches` (`home_key`);
--> statement-breakpoint
CREATE INDEX `matches_away_key_idx` ON `matches` (`away_key`);
--> statement-breakpoint
CREATE INDEX `matches_competition_season_idx` ON `matches` (`competition`,`season`);
