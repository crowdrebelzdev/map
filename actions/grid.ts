"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { gridConfig, type GridLabelOrientation, type GridLabelOrder } from "@/db/schema";
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
  labelOrder: GridLabelOrder;
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
  const t = await getTranslations("actionErrors");

  if (input.columns <= 0 || input.rows <= 0) {
    throw new Error(t("rowsColumnsPositive"));
  }
  if (input.labelOrder !== "letter-number" && input.labelOrder !== "number-letter") {
    throw new Error(t("invalidLabelOrder"));
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(input.lineColor) || !/^#[0-9a-fA-F]{6}$/.test(input.casingColor)) {
    throw new Error(t("invalidColor"));
  }
  if (input.lineWidth <= 0 || input.casingWidth < 0) {
    throw new Error(t("lineWidthPositive"));
  }
  if (input.labelPrefix.length > 12) {
    throw new Error(t("labelPrefixMaxLength"));
  }
  if (!Number.isInteger(input.labelLetterStart) || input.labelLetterStart < 0) {
    throw new Error(t("invalidStartLetter"));
  }
  if (!Number.isInteger(input.labelNumberStart)) {
    throw new Error(t("invalidStartNumberGrid"));
  }
  if (!Number.isInteger(input.labelLetterGroupSize) || input.labelLetterGroupSize < 0) {
    throw new Error(t("invalidSubcellsPerLetter"));
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
    labelOrder: input.labelOrder,
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

  revalidatePath(`/org/events/${input.eventSlug}/map`);
  revalidatePath(`/events/${input.eventSlug}/map`);
}
