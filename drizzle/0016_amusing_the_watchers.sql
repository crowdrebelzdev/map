CREATE TABLE "event_map_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"image_url" text NOT NULL,
	"image_width" integer NOT NULL,
	"image_height" integer NOT NULL,
	"corner_tl_lat" double precision NOT NULL,
	"corner_tl_lng" double precision NOT NULL,
	"corner_tr_lat" double precision NOT NULL,
	"corner_tr_lng" double precision NOT NULL,
	"corner_br_lat" double precision NOT NULL,
	"corner_br_lng" double precision NOT NULL,
	"corner_bl_lat" double precision NOT NULL,
	"corner_bl_lng" double precision NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_map_version" ADD CONSTRAINT "event_map_version_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_map_version_event_idx" ON "event_map_version" USING btree ("event_id","created_at");