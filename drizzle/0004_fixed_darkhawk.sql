CREATE TABLE "event_day" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"date" text NOT NULL,
	"label" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "poi" ADD COLUMN "event_day_id" uuid;--> statement-breakpoint
ALTER TABLE "event_day" ADD CONSTRAINT "event_day_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_day_event_idx" ON "event_day" USING btree ("event_id");--> statement-breakpoint
ALTER TABLE "poi" ADD CONSTRAINT "poi_event_day_id_event_day_id_fk" FOREIGN KEY ("event_day_id") REFERENCES "public"."event_day"("id") ON DELETE set null ON UPDATE no action;