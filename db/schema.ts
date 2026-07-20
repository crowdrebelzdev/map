import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  doublePrecision,
  uuid,
  index,
} from "drizzle-orm/pg-core";

export const event = pgTable("event", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
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
  lineColor: text("line_color").notNull().default("#111827"),
  lineWidth: doublePrecision("line_width").notNull().default(3),
  casingColor: text("casing_color").notNull().default("#ffffff"),
  casingWidth: doublePrecision("casing_width").notNull().default(2),
});

/** "column-row": code = column-letter + row-number (e.g. "C2"). "row-column": code = row-letter + column-number (e.g. "B3"). */
export const gridLabelOrientationValues = ["column-row", "row-column"] as const;
export type GridLabelOrientation = (typeof gridLabelOrientationValues)[number];

export const poiCategoryValues = [
  "security",
  "medical",
  "toilet",
  "stage",
  "other",
] as const;
export type PoiCategory = (typeof poiCategoryValues)[number];

export const poi = pgTable("poi", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id")
    .notNull()
    .references(() => event.id, { onDelete: "cascade" }),
  category: text("category").$type<PoiCategory>().notNull(),
  name: text("name").notNull(),
  description: text("description"),
  pixelX: doublePrecision("pixel_x").notNull(),
  pixelY: doublePrecision("pixel_y").notNull(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

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
