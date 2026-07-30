ALTER TABLE "grid_config" ADD COLUMN "label_prefix" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "grid_config" ADD COLUMN "label_letter_start" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "grid_config" ADD COLUMN "label_number_start" integer DEFAULT 1 NOT NULL;