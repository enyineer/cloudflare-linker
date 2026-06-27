CREATE TABLE `campaigns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`utm_source` text,
	`utm_medium` text,
	`utm_campaign` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaigns_slug_unique` ON `campaigns` (`slug`);--> statement-breakpoint
CREATE TABLE `clicks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`link_id` integer,
	`campaign_id` integer,
	`ts` integer DEFAULT (unixepoch()) NOT NULL,
	`hostname` text NOT NULL,
	`path` text NOT NULL,
	`country` text,
	`region` text,
	`device_category` text DEFAULT 'unknown' NOT NULL,
	`browser_family` text,
	`referer_origin` text,
	`redirect_type` integer NOT NULL,
	FOREIGN KEY (`link_id`) REFERENCES `links`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `clicks_ts_idx` ON `clicks` (`ts`);--> statement-breakpoint
CREATE INDEX `clicks_link_idx` ON `clicks` (`link_id`);--> statement-breakpoint
CREATE INDEX `clicks_campaign_idx` ON `clicks` (`campaign_id`);--> statement-breakpoint
CREATE TABLE `domains` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`hostname` text NOT NULL,
	`kind` text DEFAULT 'subdomain' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `domains_hostname_unique` ON `domains` (`hostname`);--> statement-breakpoint
CREATE TABLE `links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`domain_id` integer NOT NULL,
	`path` text NOT NULL,
	`target_url` text NOT NULL,
	`redirect_type` integer DEFAULT 301 NOT NULL,
	`query_params` text DEFAULT '[]' NOT NULL,
	`campaign_id` integer,
	`enabled` integer DEFAULT true NOT NULL,
	`fallback_url` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`domain_id`) REFERENCES `domains`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "links_redirect_type_valid" CHECK("links"."redirect_type" in (301, 302, 307, 308))
);
--> statement-breakpoint
CREATE INDEX `links_campaign_idx` ON `links` (`campaign_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `links_domain_path_unique` ON `links` (`domain_id`,`path`);--> statement-breakpoint
CREATE TABLE `users` (
	`email` text PRIMARY KEY NOT NULL,
	`role` text DEFAULT 'viewer' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
