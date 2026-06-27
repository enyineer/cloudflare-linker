CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ts` integer DEFAULT (unixepoch()) NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`summary` text NOT NULL
);
