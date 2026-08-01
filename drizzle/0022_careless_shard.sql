ALTER TABLE "event_map" ADD COLUMN "tile_version" text;--> statement-breakpoint
ALTER TABLE "event_map" ADD COLUMN "tile_min_zoom" integer;--> statement-breakpoint
ALTER TABLE "event_map" ADD COLUMN "tile_max_zoom" integer;--> statement-breakpoint
ALTER TABLE "event_map_version" ADD COLUMN "tile_version" text;--> statement-breakpoint
ALTER TABLE "event_map_version" ADD COLUMN "tile_min_zoom" integer;--> statement-breakpoint
ALTER TABLE "event_map_version" ADD COLUMN "tile_max_zoom" integer;