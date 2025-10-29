CREATE TABLE `entries` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text DEFAULT 'Untitled' NOT NULL,
	`markdown` text NOT NULL,
	`html` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
