"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { gridConfig, type GridLabelOrientation } from "@/db/schema";
import { requireAdminSession } from "@/lib/get-session";
import type { CornerSet } from "@/lib/geo";

export async function saveGridConfig(input: {
  eventId: string;
  corners: CornerSet;
  columns: number;
  rows: number;
  labelOrientation: GridLabelOrientation;
  lineColor: string;
  lineWidth: number;
  casingColor: string;
  casingWidth: number;
}) {
  await requireAdminSession();

  if (input.columns <= 0 || input.rows <= 0) {
    throw new Error("Rijen/kolommen moeten groter dan 0 zijn.");
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(input.lineColor) || !/^#[0-9a-fA-F]{6}$/.test(input.casingColor)) {
    throw new Error("Ongeldige kleur.");
  }
  if (input.lineWidth <= 0 || input.casingWidth < 0) {
    throw new Error("Lijndikte moet groter dan 0 zijn.");
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

  revalidatePath(`/admin/events/${input.eventId}/map`);
  revalidatePath(`/events/${input.eventId}/map`);
}
