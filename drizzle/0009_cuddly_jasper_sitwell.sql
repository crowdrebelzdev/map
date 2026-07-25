ALTER TABLE "broadcast" ADD COLUMN "recipient_id" text;--> statement-breakpoint
ALTER TABLE "broadcast" ADD CONSTRAINT "broadcast_recipient_id_user_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "broadcast_recipient_idx" ON "broadcast" USING btree ("recipient_id");