import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  bigint,
  doublePrecision,
  uuid,
  index,
  uniqueIndex,
  jsonb,
} from "drizzle-orm/pg-core";

/** "members_only" (default, current behavior): requires an eventMember row or org-admin.
 * "public_anonymous": anyone with the link, no login/name needed. "public_named": anyone
 * with the link, but must type a name first — the name is a client-side-only entry gate
 * (never sent to the server), see `components/visitor-name-gate.tsx`. Public visitors never
 * get live-ops features (live location, incidents, broadcasts) regardless of mode — those
 * stay staff-only. */
export const publicAccessModeValues = ["members_only", "public_anonymous", "public_named"] as const;
export type PublicAccessMode = (typeof publicAccessModeValues)[number];

export const event = pgTable("event", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  publicAccessMode: text("public_access_mode").$type<PublicAccessMode>().notNull().default("members_only"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  archivedAt: timestamp("archived_at"),
});

export const eventMap = pgTable("event_map", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id")
    .notNull()
    .unique()
    .references(() => event.id, { onDelete: "cascade" }),
  imageUrl: text("image_url").notNull(),
  imageWidth: integer("image_width").notNull(),
  imageHeight: integer("image_height").notNull(),
  cornerTlLat: doublePrecision("corner_tl_lat").notNull(),
  cornerTlLng: doublePrecision("corner_tl_lng").notNull(),
  cornerTrLat: doublePrecision("corner_tr_lat").notNull(),
  cornerTrLng: doublePrecision("corner_tr_lng").notNull(),
  cornerBrLat: doublePrecision("corner_br_lat").notNull(),
  cornerBrLng: doublePrecision("corner_br_lng").notNull(),
  cornerBlLat: doublePrecision("corner_bl_lat").notNull(),
  cornerBlLng: doublePrecision("corner_bl_lng").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// A snapshot of `eventMap`'s previous values, saved right before it's overwritten — lets an
// admin undo an accidental re-upload or a botched corner-placement without redoing the
// original setup from scratch. Intentionally has no unique constraint on eventId: an event
// accumulates one row per past replacement.
export const eventMapVersion = pgTable(
  "event_map_version",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    imageUrl: text("image_url").notNull(),
    imageWidth: integer("image_width").notNull(),
    imageHeight: integer("image_height").notNull(),
    cornerTlLat: doublePrecision("corner_tl_lat").notNull(),
    cornerTlLng: doublePrecision("corner_tl_lng").notNull(),
    cornerTrLat: doublePrecision("corner_tr_lat").notNull(),
    cornerTrLng: doublePrecision("corner_tr_lng").notNull(),
    cornerBrLat: doublePrecision("corner_br_lat").notNull(),
    cornerBrLng: doublePrecision("corner_br_lng").notNull(),
    cornerBlLat: doublePrecision("corner_bl_lat").notNull(),
    cornerBlLng: doublePrecision("corner_bl_lng").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("event_map_version_event_idx").on(table.eventId, table.createdAt)],
);

export const gridConfig = pgTable("grid_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id")
    .notNull()
    .unique()
    .references(() => event.id, { onDelete: "cascade" }),
  // The grid is its own independently placed/rotated/scaled quad — not tied to the map
  // image's pixel space — so it can be nudged into alignment separately from the plattegrond.
  cornerTlLat: doublePrecision("corner_tl_lat").notNull(),
  cornerTlLng: doublePrecision("corner_tl_lng").notNull(),
  cornerTrLat: doublePrecision("corner_tr_lat").notNull(),
  cornerTrLng: doublePrecision("corner_tr_lng").notNull(),
  cornerBrLat: doublePrecision("corner_br_lat").notNull(),
  cornerBrLng: doublePrecision("corner_br_lng").notNull(),
  cornerBlLat: doublePrecision("corner_bl_lat").notNull(),
  cornerBlLng: doublePrecision("corner_bl_lng").notNull(),
  columns: integer("columns").notNull(),
  rows: integer("rows").notNull(),
  labelOrientation: text("label_orientation")
    .$type<GridLabelOrientation>()
    .notNull()
    .default("row-column"),
  // Lets a grid that only covers part of a venue's larger, pre-printed grid line up with
  // it: e.g. a plattegrond labelled "10E1".."10E3" needs labelPrefix "10" and
  // labelLetterStart pointing at "E" instead of "A", even though this grid itself only has
  // one row. Defaults reproduce the old always-starts-at-A1 behavior exactly.
  labelPrefix: text("label_prefix").notNull().default(""),
  labelLetterStart: integer("label_letter_start").notNull().default(0),
  labelNumberStart: integer("label_number_start").notNull().default(1),
  // 0 = off (flat "{letter}{number}" codes, as above). >0 subdivides the letter axis into
  // groups of this size, producing "{number}{letter}{subnumber}" codes (e.g. "10E1".."10E4",
  // then "10F1"..) — matches how large venues print their own master grid.
  labelLetterGroupSize: integer("label_letter_group_size").notNull().default(0),
  lineColor: text("line_color").notNull().default("#111827"),
  lineWidth: doublePrecision("line_width").notNull().default(3),
  casingColor: text("casing_color").notNull().default("#ffffff"),
  casingWidth: doublePrecision("casing_width").notNull().default(2),
});

/** "column-row": code = column-letter + row-number (e.g. "C2"). "row-column": code = row-letter + column-number (e.g. "B3"). */
export const gridLabelOrientationValues = ["column-row", "row-column"] as const;
export type GridLabelOrientation = (typeof gridLabelOrientationValues)[number];

export const poiCategoryShapeValues = ["circle", "square", "pin", "diamond", "triangle"] as const;
export type PoiCategoryShape = (typeof poiCategoryShapeValues)[number];

export const poiExtraFieldTypeValues = ["text", "url", "phone"] as const;
export type PoiExtraFieldType = (typeof poiExtraFieldTypeValues)[number];
export type PoiExtraFieldDef = { key: string; label: string; type: PoiExtraFieldType };

/** A single labeled info row on a POI — carries its own label so it renders correctly
 * whether it came from a category template field or was added freely on the POI itself. */
export type PoiExtraFieldValue = { key: string; label: string; value: string };

export const poiCategory = pgTable(
  "poi_category",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    color: text("color").notNull(),
    // Lucide icon name (see lib/poi-icons.ts) — null renders the marker without an icon.
    icon: text("icon"),
    shape: text("shape").$type<PoiCategoryShape>().notNull().default("circle"),
    // Category-defined custom fields (e.g. "Telefoon" for a first-aid post); POIs in
    // this category store values for these under poi.extraFieldValues.
    extraFields: jsonb("extra_fields").$type<PoiExtraFieldDef[]>().notNull().default([]),
    // Opt-in auto-naming for new POIs in this category: "{prefix}{autoNumberNext}{suffix}",
    // suggested (still overridable) on create, then autoNumberNext advances by 1.
    autoNumberEnabled: boolean("auto_number_enabled").notNull().default(false),
    autoNumberPrefix: text("auto_number_prefix").notNull().default(""),
    autoNumberSuffix: text("auto_number_suffix").notNull().default(""),
    autoNumberNext: integer("auto_number_next").notNull().default(1),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("poi_category_event_key_idx").on(table.eventId, table.key),
    index("poi_category_event_idx").on(table.eventId),
  ],
);

export const eventDay = pgTable(
  "event_day",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    label: text("label"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("event_day_event_idx").on(table.eventId)],
);

export const poiSizeValues = ["small", "medium", "large"] as const;
export type PoiSize = (typeof poiSizeValues)[number];

export const poi = pgTable("poi", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id")
    .notNull()
    .references(() => event.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id")
    .notNull()
    .references(() => poiCategory.id, { onDelete: "restrict" }),
  // Nullable: a POI without a day is visible on every day of a multi-day event. Set,
  // it's only visible on that specific day. Single-day events never set this at all.
  eventDayId: uuid("event_day_id").references(() => eventDay.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description"),
  // Per-POI overrides — null falls back to the category's icon/color/default border.
  icon: text("icon"),
  fillColor: text("fill_color"),
  borderColor: text("border_color"),
  owner: text("owner"),
  size: text("size").$type<PoiSize>().notNull().default("medium"),
  // Optional "HH:MM" time-of-day window (both set or both null) — combines with
  // eventDayId so a POI can be e.g. "Saturday only" AND "12:00-16:00 only".
  startTime: text("start_time"),
  endTime: text("end_time"),
  // Labeled info rows — from the category's extraFields template and/or added freely
  // on this POI directly. Each row carries its own label (see PoiExtraFieldValue).
  extraFieldValues: jsonb("extra_field_values").$type<PoiExtraFieldValue[]>().notNull().default([]),
  pixelX: doublePrecision("pixel_x").notNull(),
  pixelY: doublePrecision("pixel_y").notNull(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const areaCategory = pgTable(
  "area_category",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    color: text("color").notNull(),
    // Category-defined custom fields, same idea as poiCategory.extraFields — areas in
    // this category store values for these under mapArea.extraFieldValues.
    extraFields: jsonb("extra_fields").$type<PoiExtraFieldDef[]>().notNull().default([]),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("area_category_event_key_idx").on(table.eventId, table.key),
    index("area_category_event_idx").on(table.eventId),
  ],
);

/** A single lat/lng vertex of a free-form area outline. */
export type AreaVertex = { lat: number; lng: number };

export const mapArea = pgTable("map_area", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id")
    .notNull()
    .references(() => event.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id")
    .notNull()
    .references(() => areaCategory.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  // Free-form polygon outline — at least 3 points, drawn/edited by dragging each vertex.
  vertices: jsonb("vertices").$type<AreaVertex[]>().notNull().default([]),
  extraFieldValues: jsonb("extra_field_values").$type<PoiExtraFieldValue[]>().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const searchLogTypeValues = ["grid", "poi"] as const;
export type SearchLogType = (typeof searchLogTypeValues)[number];

export const searchLog = pgTable(
  "search_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    type: text("type").$type<SearchLogType>().notNull(),
    term: text("term").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("search_log_event_idx").on(table.eventId)],
);

// --- Incident reports (staff-reported, includes one-tap SOS) --------------------------

export const incidentTypeValues = ["incident", "sos"] as const;
export type IncidentType = (typeof incidentTypeValues)[number];
export const incidentStatusValues = ["open", "resolved"] as const;
export type IncidentStatus = (typeof incidentStatusValues)[number];

export const incident = pgTable(
  "incident",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    reporterId: text("reporter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type").$type<IncidentType>().notNull(),
    category: text("category"),
    description: text("description"),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    status: text("status").$type<IncidentStatus>().notNull().default("open"),
    resolvedAt: timestamp("resolved_at"),
    resolvedBy: text("resolved_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("incident_event_idx").on(table.eventId),
    index("incident_event_status_idx").on(table.eventId, table.status),
  ],
);

// --- Broadcast messages (command center -> everyone, or one specific staff member) ----

export const broadcast = pgTable(
  "broadcast",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    senderId: text("sender_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Null = sent to everyone on the operational map. Set = only that one staff member
    // sees/receives it — still stored in the same table since it's the same feature
    // (a message from command center), just addressed differently.
    recipientId: text("recipient_id").references(() => user.id, { onDelete: "cascade" }),
    message: text("message").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("broadcast_event_created_idx").on(table.eventId, table.createdAt),
    index("broadcast_recipient_idx").on(table.recipientId),
  ],
);

// --- Event templates (POI category sets an org can reuse across recurring events) -----

export const eventTemplate = pgTable(
  "event_template",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("event_template_org_idx").on(table.organizationId)],
);

export const eventTemplateCategory = pgTable(
  "event_template_category",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => eventTemplate.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    color: text("color").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [index("event_template_category_template_idx").on(table.templateId)],
);

// --- Activity log (per-event audit trail for configuration changes) -------------------

export const activityLog = pgTable(
  "activity_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    // Nullable + set-null on delete: the log entry should outlive the actor's account.
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    summary: text("summary").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("activity_log_event_created_idx").on(table.eventId, table.createdAt)],
);

// --- Better Auth tables (generated via `npx @better-auth/cli generate`, keep in sync with lib/auth.ts) ---

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  role: text("role"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    impersonatedBy: text("impersonated_by"),
    activeOrganizationId: text("active_organization_id"),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

// Better Auth's own rate-limit storage (`rateLimit: { storage: "database" }` in
// lib/auth.ts) — keeping this in the database rather than in-memory is what makes login
// and password-reset throttling actually hold up on a serverless/multi-instance deploy.
export const rateLimit = pgTable(
  "rate_limit",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull(),
    count: integer("count").notNull(),
    lastRequest: bigint("last_request", { mode: "number" }).notNull(),
  },
  (table) => [index("rate_limit_key_idx").on(table.key)],
);

// Our own lightweight rate limiter for anonymous/public traffic (the public map page,
// public search logging) — same database-backed fixed-window pattern as Better Auth's
// `rateLimit` above (same reason: serverless, no shared in-memory state), kept as a
// separate table so this feature stays independent of Better Auth's internals. See
// `lib/rate-limit.ts`.
export const publicRateLimit = pgTable("public_rate_limit", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

// Single-row platform-wide configuration, managed from /admin/settings — see
// lib/platform-settings.ts. `id` is always the fixed string "platform"; there is
// deliberately no multi-row support here.
export const platformSettings = pgTable("platform_settings", {
  id: text("id").primaryKey(),
  maintenanceMode: boolean("maintenance_mode").notNull().default(false),
  maintenanceMessage: text("maintenance_message"),
  allowOrgSelfRegistration: boolean("allow_org_self_registration").notNull().default(false),
  defaultEventAccessMode: text("default_event_access_mode").$type<PublicAccessMode>().notNull().default("members_only"),
  platformName: text("platform_name").notNull().default("Eventkaart"),
  logoInitial: text("logo_initial").notNull().default("K"),
  brandColor: text("brand_color").notNull().default("#2563eb"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

// --- Organizations (multi-tenancy — one company/client per organization) --------------

export const organization = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const member = pgTable(
  "member",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("member_organization_user_idx").on(table.organizationId, table.userId),
    index("member_user_idx").on(table.userId),
  ],
);

export const invitation = pgTable("invitation", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role").notNull(),
  status: text("status").notNull().default("pending"),
  inviterId: text("inviter_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

// --- Per-event permissions (for the "user" role — admins bypass this entirely) --------

export const eventMemberPermissionValues = [
  "edit_map",
  "manage_pois",
  "manage_categories",
  "view_live_locations",
  // Bundles the "live ops" write actions: resolving incident reports and sending
  // broadcasts. Reporting incidents/SOS stays available to any event member, same as
  // live-location sharing.
  "manage_incidents",
] as const;
export type EventMemberPermission = (typeof eventMemberPermissionValues)[number];

export const eventMember = pgTable(
  "event_member",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Being a member at all (even with zero permissions here) already grants baseline
    // access to the operational map for this event — these unlock specific backoffice
    // capabilities on top of that.
    permissions: text("permissions")
      .array()
      .$type<EventMemberPermission[]>()
      .notNull()
      .default([]),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("event_member_event_user_idx").on(table.eventId, table.userId),
    index("event_member_user_idx").on(table.userId),
  ],
);

// --- Live locations (upserted while a user has the operational map open) --------------

export const liveLocation = pgTable(
  "live_location",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    accuracy: doublePrecision("accuracy"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("live_location_event_user_idx").on(table.eventId, table.userId)],
);

// --- Web Push subscriptions (per event, so opting in on one event's map doesn't push
// notifications for every other event a user happens to be a member of) -----------------

export const pushSubscription = pgTable(
  "push_subscription",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("push_subscription_event_idx").on(table.eventId),
    index("push_subscription_user_idx").on(table.userId),
  ],
);
