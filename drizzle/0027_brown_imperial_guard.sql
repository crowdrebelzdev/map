CREATE TABLE "visitor_live_location" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"visitor_id" text NOT NULL,
	"name" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"accuracy" double precision,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "live_location_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "visitor_live_location" ADD CONSTRAINT "visitor_live_location_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "visitor_live_location_event_visitor_idx" ON "visitor_live_location" USING btree ("event_id","visitor_id");