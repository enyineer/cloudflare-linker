ALTER TABLE `clicks` ADD `is_bot` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `clicks_bot_ts_idx` ON `clicks` (`is_bot`,`ts`);--> statement-breakpoint
UPDATE `clicks` SET `is_bot` = 1 WHERE `device_category` = 'bot';