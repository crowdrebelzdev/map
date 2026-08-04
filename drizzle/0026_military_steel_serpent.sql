ALTER TABLE "event_map" ADD COLUMN "bearing" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "event_map_version" ADD COLUMN "bearing" double precision DEFAULT 0 NOT NULL;