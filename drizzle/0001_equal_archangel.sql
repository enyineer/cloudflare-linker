ALTER TABLE `clicks` ADD `utm_source` text;--> statement-breakpoint
ALTER TABLE `clicks` ADD `utm_medium` text;--> statement-breakpoint
ALTER TABLE `clicks` ADD `utm_campaign` text;--> statement-breakpoint
ALTER TABLE `clicks` ADD `utm_term` text;--> statement-breakpoint
ALTER TABLE `clicks` ADD `utm_content` text;--> statement-breakpoint
ALTER TABLE `links` ADD `forward_query` integer DEFAULT false NOT NULL;