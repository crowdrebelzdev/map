ALTER TABLE "poi" ADD COLUMN "icon" text;--> statement-breakpoint
ALTER TABLE "poi" ADD COLUMN "fill_color" text;--> statement-breakpoint
ALTER TABLE "poi" ADD COLUMN "border_color" text;--> statement-breakpoint
ALTER TABLE "poi" ADD COLUMN "owner" text;--> statement-breakpoint
ALTER TABLE "poi_category" ADD COLUMN "auto_number_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "poi_category" ADD COLUMN "auto_number_prefix" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "poi_category" ADD COLUMN "auto_number_suffix" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "poi_category" ADD COLUMN "auto_number_next" integer DEFAULT 1 NOT NULL;