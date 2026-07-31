CREATE INDEX "map_area_event_idx" ON "map_area" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "poi_event_idx" ON "poi" USING btree ("event_id");