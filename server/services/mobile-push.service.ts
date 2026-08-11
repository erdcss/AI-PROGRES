/**
 * ORVIAN Monitor — FCM push (izole).
 * Tracking / scrape / Shopify hatalarını ASLA yukarı fırlatmaz.
 */
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { mobilePushDevices, trackedProducts, type DetectedChange } from "@shared/schema";
import { runMobilePushMigration } from "../migrations/run-mobile-push-migration";
import {
  parseWatchTag,
  shouldNotifyForWatchTag,
  watchTagLabel,
  type WatchTag,
} from "@shared/watch-tag";

const lastNotifyAt = new Map<string, number>();

export type MobilePushEventType =
  | "PRICE_CHANGED"
  | "STOCK_CHANGED"
  | "OUT_OF_STOCK"
  | "BACK_IN_STOCK"
  | "VARIANT_CHANGED"
  | "PRODUCT_REMOVED"
  | "TRACKING_ERROR"
  | "SHOPIFY_SYNC_ERROR"
  | "TITLE_CHANGED";

export type RegisterMobilePushInput = {
  deviceId: string;
  platform?: string;
  pushToken: string;
  appVersion?: string;
};

export type MobilePushPayload = {
  title: string;
  body: string;
  data: {
    type: MobilePushEventType;
    productId: string;
    changeId: string;
  };
};

type FcmSendResult = { ok: boolean; invalidToken?: boolean; error?: string };

/** Testlerde mock edilebilir */
let fcmSender: ((token: string, payload: MobilePushPayload) => Promise<FcmSendResult>) | null =
  null;

export function setMobilePushFcmSender(
  sender: typeof fcmSender,
): void {
  fcmSender = sender;
}

function formatValue(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (o.price != null) return String(o.price);
    if (o.value != null) return String(o.value);
    if (o.stock != null) return String(o.stock);
    if (o.available != null) return o.available ? "Stokta" : "Tükendi";
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

function asNumberish(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "object" && v) {
    const o = v as Record<string, unknown>;
    if (typeof o.stock === "number") return o.stock;
    if (typeof o.available === "boolean") return o.available ? 1 : 0;
    if (typeof o.value === "number") return o.value;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function mapChangeToPushEvent(
  change: Pick<DetectedChange, "changeType" | "oldValue" | "newValue">,
): MobilePushEventType {
  const t = String(change.changeType || "");
  if (t === "price_changed" || t === "variant_price_changed") return "PRICE_CHANGED";
  if (t === "title_changed") return "TITLE_CHANGED";
  if (t === "product_removed" || t === "removed") return "PRODUCT_REMOVED";
  if (t === "tracking_error") return "TRACKING_ERROR";
  if (t === "shopify_sync_error") return "SHOPIFY_SYNC_ERROR";

  if (t === "stock_changed" || t === "variant_stock_changed") {
    const oldN = asNumberish(change.oldValue);
    const newN = asNumberish(change.newValue);
    if (oldN != null && newN != null) {
      if (oldN > 0 && newN <= 0) return "OUT_OF_STOCK";
      if (oldN <= 0 && newN > 0) return "BACK_IN_STOCK";
    }
    const oldAvail =
      typeof change.oldValue === "object" && change.oldValue
        ? (change.oldValue as { available?: boolean }).available
        : undefined;
    const newAvail =
      typeof change.newValue === "object" && change.newValue
        ? (change.newValue as { available?: boolean }).available
        : undefined;
    if (oldAvail === true && newAvail === false) return "OUT_OF_STOCK";
    if (oldAvail === false && newAvail === true) return "BACK_IN_STOCK";
    return "STOCK_CHANGED";
  }

  if (t.startsWith("variant_")) return "VARIANT_CHANGED";
  return "VARIANT_CHANGED";
}

export function buildPushPayload(
  change: DetectedChange,
  productTitle?: string | null,
  watchTag?: WatchTag | null,
): MobilePushPayload {
  const type = mapChangeToPushEvent(change);
  const titleMap: Record<MobilePushEventType, string> = {
    PRICE_CHANGED: "Fiyat değişti",
    STOCK_CHANGED: "Stok değişti",
    OUT_OF_STOCK: "Stok tükendi",
    BACK_IN_STOCK: "Stok geldi",
    VARIANT_CHANGED: "Varyant değişti",
    PRODUCT_REMOVED: "Ürün kaldırıldı",
    TRACKING_ERROR: "Takip hatası",
    SHOPIFY_SYNC_ERROR: "Shopify senkron hatası",
    TITLE_CHANGED: "Başlık değişti",
  };
  const tagPrefix = watchTagLabel(watchTag);
  const baseTitle = titleMap[type];
  const title = tagPrefix ? `${tagPrefix} · ${baseTitle}` : baseTitle;
  const name = (productTitle || "Ürün").trim() || "Ürün";
  const oldV = formatValue(change.oldValue);
  const newV = formatValue(change.newValue);
  let body = name;
  if (type === "PRICE_CHANGED" || type === "STOCK_CHANGED" || type === "TITLE_CHANGED") {
    body = `${name}\n${oldV} → ${newV}`;
  } else if (type === "OUT_OF_STOCK" || type === "BACK_IN_STOCK") {
    body = name;
  }

  return {
    title,
    body,
    data: {
      type,
      productId: String(change.trackedProductId),
      changeId: String(change.id),
    },
  };
}

async function ensureTable(): Promise<void> {
  try {
    await runMobilePushMigration(false);
  } catch {
    /* ignore */
  }
}

export async function registerMobilePushDevice(
  input: RegisterMobilePushInput,
): Promise<{ id: number; deviceId: string; pushToken: string }> {
  await ensureTable();
  const deviceId = String(input.deviceId || "").trim();
  const pushToken = String(input.pushToken || "").trim();
  const platform = String(input.platform || "android").trim() || "android";
  const appVersion = input.appVersion ? String(input.appVersion).trim() : null;

  if (!deviceId || !pushToken) {
    throw new Error("deviceId ve pushToken zorunlu");
  }

  const now = new Date();

  // Aynı token başka cihazda ise eski kaydı pasifleştir / token'ı taşı
  const byToken = await db
    .select()
    .from(mobilePushDevices)
    .where(eq(mobilePushDevices.pushToken, pushToken))
    .limit(1);

  if (byToken[0] && byToken[0].deviceId !== deviceId) {
    await db
      .update(mobilePushDevices)
      .set({
        deviceId,
        platform,
        enabled: true,
        appVersion,
        lastSeenAt: now,
        updatedAt: now,
      } as Partial<typeof mobilePushDevices.$inferInsert>)
      .where(eq(mobilePushDevices.id, byToken[0].id));
    return {
      id: byToken[0].id,
      deviceId,
      pushToken,
    };
  }

  const byDevice = await db
    .select()
    .from(mobilePushDevices)
    .where(eq(mobilePushDevices.deviceId, deviceId))
    .limit(1);

  if (byDevice[0]) {
    await db
      .update(mobilePushDevices)
      .set({
        pushToken,
        platform,
        enabled: true,
        appVersion,
        lastSeenAt: now,
        updatedAt: now,
      } as Partial<typeof mobilePushDevices.$inferInsert>)
      .where(eq(mobilePushDevices.id, byDevice[0].id));
    return {
      id: byDevice[0].id,
      deviceId,
      pushToken,
    };
  }

  const [row] = await db
    .insert(mobilePushDevices)
    .values({
      deviceId,
      platform,
      pushToken,
      enabled: true,
      appVersion,
      lastSeenAt: now,
      updatedAt: now,
    } as typeof mobilePushDevices.$inferInsert)
    .returning();

  return {
    id: row.id,
    deviceId: row.deviceId,
    pushToken: row.pushToken,
  };
}

export async function unregisterMobilePushDevice(input: {
  deviceId?: string;
  pushToken?: string;
}): Promise<{ removed: number }> {
  await ensureTable();
  const deviceId = input.deviceId ? String(input.deviceId).trim() : "";
  const pushToken = input.pushToken ? String(input.pushToken).trim() : "";
  if (!deviceId && !pushToken) {
    throw new Error("deviceId veya pushToken gerekli");
  }

  const now = new Date();
  const disableSet = {
    enabled: false,
    updatedAt: now,
  } as Partial<typeof mobilePushDevices.$inferInsert>;

  if (deviceId) {
    const updated = await db
      .update(mobilePushDevices)
      .set(disableSet)
      .where(eq(mobilePushDevices.deviceId, deviceId))
      .returning({ id: mobilePushDevices.id });
    return { removed: updated.length };
  }

  const updated = await db
    .update(mobilePushDevices)
    .set(disableSet)
    .where(eq(mobilePushDevices.pushToken, pushToken))
    .returning({ id: mobilePushDevices.id });
  return { removed: updated.length };
}

async function defaultFcmSend(
  token: string,
  payload: MobilePushPayload,
): Promise<FcmSendResult> {
  const projectId = process.env.FCM_PROJECT_ID?.trim();
  const clientEmail = process.env.FCM_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, "\n")?.trim();
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();

  if (!projectId && !credPath) {
    return { ok: false, error: "FCM not configured" };
  }

  try {
    const adminMod = await import("firebase-admin");
    const admin = adminMod as unknown as {
      apps: unknown[];
      initializeApp: (o: object) => void;
      credential: {
        applicationDefault: () => unknown;
        cert: (s: object) => unknown;
      };
      messaging: () => { send: (m: object) => Promise<unknown> };
    };
    if (!admin.apps?.length) {
      if (credPath) {
        admin.initializeApp({
          credential: admin.credential.applicationDefault(),
          projectId: projectId || undefined,
        });
      } else if (projectId && clientEmail && privateKey) {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey,
          }),
        });
      } else {
        return { ok: false, error: "FCM credentials incomplete" };
      }
    }

    await admin.messaging().send({
      token,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: {
        type: payload.data.type,
        productId: payload.data.productId,
        changeId: payload.data.changeId,
      },
      android: {
        priority: "high",
        notification: {
          channelId: "tracking_alerts",
          priority: "high",
        },
      },
    });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string })?.code || "";
    const invalid =
      /registration-token-not-registered|invalid-registration-token|messaging\/registration-token/i.test(
        `${code} ${msg}`,
      );
    return { ok: false, invalidToken: invalid, error: msg };
  }
}

async function disableToken(token: string): Promise<void> {
  try {
    await db
      .update(mobilePushDevices)
      .set({
        enabled: false,
        updatedAt: new Date(),
      } as Partial<typeof mobilePushDevices.$inferInsert>)
      .where(eq(mobilePushDevices.pushToken, token));
  } catch (err) {
    console.warn("[mobile-push] disableToken failed:", (err as Error).message);
  }
}

/**
 * Fire-and-forget güvenli giriş — asla throw etmez.
 */
export async function dispatchChangePush(change: DetectedChange): Promise<void> {
  try {
    await ensureTable();
    if (!change?.id || !change.trackedProductId) return;

    let productTitle: string | null = null;
    let watchTag: WatchTag | null = null;
    try {
      const [p] = await db
        .select({
          sourceTitle: trackedProducts.sourceTitle,
          watchTag: trackedProducts.watchTag,
        })
        .from(trackedProducts)
        .where(eq(trackedProducts.id, change.trackedProductId))
        .limit(1);
      productTitle = p?.sourceTitle ?? null;
      watchTag = parseWatchTag(p?.watchTag);
    } catch {
      /* title optional */
    }

    const notifyKey = `${change.trackedProductId}:${change.changeType}`;
    if (!shouldNotifyForWatchTag(watchTag, change.changeType, lastNotifyAt.get(notifyKey))) {
      return;
    }
    lastNotifyAt.set(notifyKey, Date.now());

    const payload = buildPushPayload(change, productTitle, watchTag);
    const devices = await db
      .select()
      .from(mobilePushDevices)
      .where(and(eq(mobilePushDevices.enabled, true), eq(mobilePushDevices.platform, "android")));

    if (!devices.length) {
      console.log("[mobile-push] no enabled devices — skip");
      return;
    }

    const send = fcmSender || defaultFcmSend;
    for (const device of devices) {
      try {
        const result = await send(device.pushToken, payload);
        if (!result.ok) {
          console.warn("[mobile-push] send failed:", result.error);
          if (result.invalidToken) await disableToken(device.pushToken);
        }
      } catch (err) {
        console.warn(
          "[mobile-push] send threw (isolated):",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  } catch (err) {
    console.warn(
      "[mobile-push] dispatchChangePush isolated failure:",
      err instanceof Error ? err.message : String(err),
    );
  }
}

/** persistDetectedChanges sonrası çağrı — promise reject etmez */
export function scheduleChangePush(change: DetectedChange): void {
  void dispatchChangePush(change).catch((err) => {
    console.warn("[mobile-push] scheduleChangePush:", err);
  });
}
