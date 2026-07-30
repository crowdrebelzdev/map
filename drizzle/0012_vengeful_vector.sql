ALTER TABLE "poi" ADD COLUMN "size" text DEFAULT 'medium' NOT NULL;--> statement-breakpoint
ALTER TABLE "poi" ADD COLUMN "start_time" text;--> statement-breakpoint
ALTER TABLE "poi" ADD COLUMN "end_time" text;--> statement-breakpoint
ALTER TABLE "poi" ADD COLUMN "extra_field_values" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "poi_category" ADD COLUMN "icon" text;--> statement-breakpoint
ALTER TABLE "poi_category" ADD COLUMN "shape" text DEFAULT 'circle' NOT NULL;--> statement-breakpoint
ALTER TABLE "poi_category" ADD COLUMN "extra_fields" jsonb DEFAULT '[]'::jsonb NOT NULL;