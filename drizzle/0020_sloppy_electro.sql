CREATE TABLE "platform_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"maintenance_mode" boolean DEFAULT false NOT NULL,
	"maintenance_message" text,
	"allow_org_self_registration" boolean DEFAULT false NOT NULL,
	"default_event_access_mode" text DEFAULT 'members_only' NOT NULL,
	"platform_name" text DEFAULT 'Eventkaart' NOT NULL,
	"logo_initial" text DEFAULT 'K' NOT NULL,
	"brand_color" text DEFAULT '#2563eb' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
