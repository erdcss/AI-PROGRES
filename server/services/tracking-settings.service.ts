import { db } from "../db";
import { trackingSettings } from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  ensureProductTrackingTablesReady,
  tableExists,
} from "../migrations/run-product-tracking-migration";

export type TrackingSettingsDto = {
  id: number;
  trackingEnabled: boolean;
  schedulerEnabled: boolean;
  autoShopifySyncEnabled: boolean;
  checkIntervalMinutes: number;
  batchSize: number;
  requestDelayMs: number;
  maxErrorsBeforePause: number;
  updatedAt: Date | null;
};

const DEFAULTS = {
  trackingEnabled: true,
  schedulerEnabled: true,
  autoShopifySyncEnabled: false,
  checkIntervalMinutes: 60,
  batchSize: 5,
  requestDelayMs: 1500,
  maxErrorsBeforePause: 5,
};

export async function isTrackingSettingsTableReady(): Promise<boolean> {
  return tableExists("tracking_settings");
}

export async function ensureTrackingSettings(): Promise<TrackingSettingsDto> {
  const ready = await ensureProductTrackingTablesReady();
  if (!ready || !(await isTrackingSettingsTableReady())) {
    throw new Error("tracking_settings tablosu hazır değil — migration çalışmalı");
  }

  const rows = await db.select().from(trackingSettings).limit(1);
  if (rows[0]) return rows[0] as TrackingSettingsDto;

  const [created] = await db.insert(trackingSettings).values(DEFAULTS).returning();
  console.log("✅ tracking_settings varsayılan kayıt oluşturuldu");
  return created as TrackingSettingsDto;
}

export async function getTrackingSettings(): Promise<TrackingSettingsDto> {
  return ensureTrackingSettings();
}

export async function updateTrackingSettings(
  patch: Partial<Omit<TrackingSettingsDto, "id" | "updatedAt">>,
): Promise<TrackingSettingsDto> {
  const current = await ensureTrackingSettings();
  const [updated] = await db
    .update(trackingSettings)
    .set({
      ...patch,
      autoShopifySyncEnabled: false,
      updatedAt: new Date(),
    })
    .where(eq(trackingSettings.id, current.id))
    .returning();
  return updated as TrackingSettingsDto;
}

export async function isTrackingSystemEnabled(): Promise<boolean> {
  try {
    const s = await getTrackingSettings();
    return s.trackingEnabled;
  } catch {
    return false;
  }
}
