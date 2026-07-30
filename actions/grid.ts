"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { gridConfig, type GridLabelOrientation } from "@/db/schema";
import { requireEventPermission } from "@/lib/event-access";
import { logActivity } from "@/lib/activity-log";
import type { CornerSet } from "@/lib/geo";

export async function saveGridConfig(input: {
  eventId: string;
  eventSlug: string;
  corners: CornerSet;
  columns: number;
  rows: number;
  labelOrientation: GridLabelOrientation;
  labelPrefix: string;
  labelLetterStart: number;
  labelNumberStart: number;
  labelLetterGroupSize: number;
  lineColor: string;
  lineWidth: number;
  casingColor: string;
  casingWidth: number;
}) {
  const { session } = await requireEventPermission(input.eventId, "edit_map");

  if (input.columns <= 0 || input.rows <= 0) {
    throw new Error("Rijen/kolommen moeten groter dan 0 zijn.");
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(input.lineColor) || !/^#[0-9a-fA-F]{6}$/.test(input.casingColor)) {
    throw new Error("Ongeldige kleur.");
  }
  if (input.lineWidth <= 0 || input.casingWidth < 0) {
    throw new Error("Lijndikte moet groter dan 0 zijn.");
  }
  if (input.labelPrefix.length > 12) {
    throw new Error("Label-prefix mag maximaal 12 tekens zijn.");
  }
  if (!Number.isInteger(input.labelLetterStart) || input.labelLetterStart < 0) {
    throw new Error("Startletter is ongeldig.");
  }
  if (!Number.isInteger(input.labelNumberStart)) {
    throw new Error("Startnummer is ongeldig.");
  }
  if (!Number.isInteger(input.labelLetterGroupSize) || input.labelLetterGroupSize < 0) {
    throw new Error("Subcellen per letter is ongeldig.");
  }

  const { corners } = input;

  const values = {
    eventId: input.eventId,
    cornerTlLat: corners.tl.lat,
    cornerTlLng: corners.tl.lng,
    cornerTrLat: corners.tr.lat,
    cornerTrLng: corners.tr.lng,
    cornerBrLat: corners.br.lat,
    cornerBrLng: corners.br.lng,
    cornerBlLat: corners.bl.lat,
    cornerBlLng: corners.bl.lng,
    columns: input.columns,
    rows: input.rows,
    labelOrientation: input.labelOrientation,
    labelPrefix: input.labelPrefix,
    labelLetterStart: input.labelLetterStart,
    labelNumberStart: input.labelNumberStart,
    labelLetterGroupSize: input.labelLetterGroupSize,
    lineColor: input.lineColor,
    lineWidth: input.lineWidth,
    casingColor: input.casingColor,
    casingWidth: input.casingWidth,
  };

  const existing = await db.query.gridConfig.findFirst({
    where: eq(gridConfig.eventId, input.eventId),
  });

  if (existing) {
    await db
      .update(gridConfig)
      .set(values)
      .where(eq(gridConfig.eventId, input.eventId));
  } else {
    await db.insert(gridConfig).values(values);
  }

  logActivity(input.eventId, session.user.id, "grid.update", `${session.user.name} heeft het grid aangepast.`);

  revalidatePath(`/admin/events/${input.eventSlug}/map`);
  revalidatePath(`/events/${input.eventSlug}/map`);
}
