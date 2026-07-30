import { syncLogs } from "@shared/schema";
import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { ensureLocalTrackingAutoStart } from "./tracking-sync.service";
import { getTrackingSettings } from "./tracking-settings.service";
import { isTrackingSchedulerRunning } from "./tracking.scheduler";
import {
  hardDeleteTrackedProductsMissingFromShopify,
  verifyHardDeleteRemoval,
} from "./tracking-ignored-cleanup.service";
import { verifyOpenDetectedChanges } from "./tracking-change-verify.service";
import { trackingService } from "./tracking.service";

export type StartupNotification = {
  id: string;
  level: "info" | "success" | "warning" | "error";
  title: string;
  body: string;
};

export type StartupAuditResult = {
  success: boolean;
  running: boolean;
  trackingEnabled: boolean;
  schedulerRunning: boolean;
  shopifyChecked: number;
  shopifyLive: number;
  shopifySkipped: number;
  deleted: number;
  deletedProductIds: number[];
  deletedShopifyIds: string[];
  verifyPassed: boolean;
  verifyFailures: Array<{ kind: string; id: string }>;
  abortedBySafety: boolean;
  changeVerify?: {
    checkedProducts: number;
    confirmed: number;
    rejected: number;
    corrected: number;
  };
  notifications: StartupNotification[];
  message: string;
  startedAt: string;
  completedAt: string | null;
  error?: string;
};

const STARTUP_ACTION = "startup_shopify_audit";

let lastResult: StartupAuditResult | null = null;
let runningPromise: Promise<StartupAuditResult> | null = null;

export function getLastStartupAuditResult(): StartupAuditResult | null {
  return lastResult;
}

export function isStartupAuditRunning(): boolean {
  return runningPromise !== null;
}

async function persistNotifications(
  notifications: StartupNotification[],
  meta: Record<string, unknown>,
  overallStatus: "success" | "warning" | "error",
) {
  for (const n of notifications) {
    const status =
      n.level === "error" ? "error" : n.level === "warning" ? "warning" : overallStatus;
    await trackingService.writeSyncLog({
      action: STARTUP_ACTION,
      status,
      message: `${n.title}: ${n.body}`,
      meta: {
        ...meta,
        notificationId: n.id,
        level: n.level,
        title: n.title,
        body: n.body,
      },
    });
  }
}

export async function listRecentStartupNotifications(limit = 20): Promise<
  Array<{
    id: number;
    level: string;
    title: string;
    body: string;
    status: string;
    createdAt: Date;
    meta: Record<string, unknown>;
  }>
> {
  const rows = await db
    .select()
    .from(syncLogs)
    .where(eq(syncLogs.action, STARTUP_ACTION))
    .orderBy(desc(syncLogs.createdAt))
    .limit(limit);

  return rows.map((row) => {
    const meta = (row.meta ?? {}) as Record<string, unknown>;
    return {
      id: row.id,
      level: String(meta.level ?? row.status),
      title: String(meta.title ?? "Açılış denetimi"),
      body: String(meta.body ?? row.message),
      status: row.status,
      createdAt: row.createdAt,
      meta,
    };
  });
}

/** Program açılışında: takip açık + Shopify eksik ürün hard-delete + silme doğrulaması */
export async function runStartupTrackingAndShopifyAudit(): Promise<StartupAuditResult> {
  if (runningPromise) return runningPromise;

  runningPromise = (async () => {
    const startedAt = new Date().toISOString();
    lastResult = {
      success: false,
      running: true,
      trackingEnabled: false,
      schedulerRunning: isTrackingSchedulerRunning(),
      shopifyChecked: 0,
      shopifyLive: 0,
      shopifySkipped: 0,
      deleted: 0,
      deletedProductIds: [],
      deletedShopifyIds: [],
      verifyPassed: true,
      verifyFailures: [],
      abortedBySafety: false,
      notifications: [
        {
          id: "startup-begin",
          level: "info",
          title: "Açılış denetimi başladı",
          body: "Takip sistemi ve Shopify ürün kontrolü çalışıyor.",
        },
      ],
      message: "Çalışıyor",
      startedAt,
      completedAt: null,
    };

    try {
      await ensureLocalTrackingAutoStart();
      const settings = await getTrackingSettings();
      const notifications: StartupNotification[] = [...lastResult.notifications];

      notifications.push({
        id: "tracking-status",
        level: settings.trackingEnabled ? "success" : "warning",
        title: "Takip sistemi",
        body: settings.trackingEnabled
          ? "Takip sistemi açık; zamanlayıcı kontrol ediliyor."
          : "Takip sistemi kapalı — yerel ortamda otomatik açma denenmiş olabilir.",
      });

      const deleteResult = await hardDeleteTrackedProductsMissingFromShopify();
      const verify = await verifyHardDeleteRemoval({
        deletedProductIds: deleteResult.deletedProductIds,
        deletedShopifyIds: deleteResult.deletedShopifyIds,
      });

      if (deleteResult.abortedBySafety) {
        notifications.push({
          id: "shopify-safety",
          level: "error",
          title: "Shopify kontrolü iptal",
          body: `${deleteResult.checked} ürünün tamamı eksik göründü; güvenlik nedeniyle silme yapılmadı.`,
        });
      } else {
        notifications.push({
          id: "shopify-check",
          level: "info",
          title: "Shopify ürün kontrolü",
          body: `${deleteResult.checked} ürün kontrol edildi; ${deleteResult.live} canlı, ${deleteResult.skipped} atlandı.`,
        });

        if (deleteResult.deleted > 0) {
          notifications.push({
            id: "shopify-deleted",
            level: "warning",
            title: "Shopify'da olmayan ürünler silindi",
            body: `${deleteResult.deleted} ürün takip, aktarım ve hafızadan tamamen çıkarıldı.`,
          });
        } else {
          notifications.push({
            id: "shopify-clean",
            level: "success",
            title: "Shopify eşlemesi temiz",
            body: "Sistemde Shopify'da olmayan takip ürünü bulunamadı.",
          });
        }
      }

      if (deleteResult.deleted > 0) {
        notifications.push({
          id: "delete-verify",
          level: verify.passed ? "success" : "error",
          title: "Silme doğrulaması",
          body: verify.passed
            ? `${deleteResult.deleted} ürünün sistemden tamamen çıkarıldığı doğrulandı.`
            : `Doğrulama başarısız: ${verify.failures.length} kalıntı bulundu.`,
        });
      }

      // Açık fiyat tespitlerini canlı kaynakla teyit et
      let changeVerify: StartupAuditResult["changeVerify"];
      try {
        const cv = await verifyOpenDetectedChanges({ limitProducts: 35, delayMs: 300 });
        changeVerify = {
          checkedProducts: cv.checkedProducts,
          confirmed: cv.confirmed,
          rejected: cv.rejected,
          corrected: cv.corrected,
        };
        notifications.push({
          id: "change-verify",
          level: cv.rejected > 0 ? "warning" : "success",
          title: "Değişiklik teyidi",
          body: cv.message,
        });
      } catch (err) {
        notifications.push({
          id: "change-verify-error",
          level: "warning",
          title: "Değişiklik teyidi atlandı",
          body: (err as Error).message,
        });
      }

      const schedulerRunning = isTrackingSchedulerRunning();
      notifications.push({
        id: "scheduler-status",
        level: schedulerRunning ? "success" : "warning",
        title: "Takip zamanlayıcısı",
        body: schedulerRunning
          ? "Zamanlayıcı çalışıyor; periyodik kontroller aktif."
          : "Zamanlayıcı henüz çalışmıyor.",
      });

      const success =
        !deleteResult.abortedBySafety &&
        verify.passed &&
        settings.trackingEnabled;

      const message = [
        `Kontrol: ${deleteResult.checked}`,
        `Canlı: ${deleteResult.live}`,
        `Silinen: ${deleteResult.deleted}`,
        `Doğrulama: ${verify.passed ? "OK" : "HATA"}`,
        changeVerify
          ? `Teyit: ${changeVerify.confirmed} OK / ${changeVerify.rejected} hatalı`
          : null,
      ]
        .filter(Boolean)
        .join(" · ");

      const result: StartupAuditResult = {
        success,
        running: false,
        trackingEnabled: settings.trackingEnabled,
        schedulerRunning,
        shopifyChecked: deleteResult.checked,
        shopifyLive: deleteResult.live,
        shopifySkipped: deleteResult.skipped,
        deleted: deleteResult.deleted,
        deletedProductIds: deleteResult.deletedProductIds,
        deletedShopifyIds: deleteResult.deletedShopifyIds,
        verifyPassed: verify.passed,
        verifyFailures: verify.failures,
        abortedBySafety: deleteResult.abortedBySafety,
        changeVerify,
        notifications,
        message,
        startedAt,
        completedAt: new Date().toISOString(),
        error: verify.passed
          ? undefined
          : `Kalıntı: ${verify.failures.map((f) => `${f.kind}:${f.id}`).join(", ")}`,
      };

      await persistNotifications(
        notifications,
        {
          shopifyChecked: result.shopifyChecked,
          shopifyLive: result.shopifyLive,
          deleted: result.deleted,
          deletedShopifyIds: result.deletedShopifyIds,
          verifyPassed: result.verifyPassed,
          verifyFailures: result.verifyFailures,
          abortedBySafety: result.abortedBySafety,
          changeVerify: result.changeVerify,
        },
        success ? "success" : deleteResult.abortedBySafety || !verify.passed ? "error" : "warning",
      );

      lastResult = result;
      console.info(`[startup-audit] ${message}`);
      return result;
    } catch (err) {
      const error = (err as Error).message;
      const result: StartupAuditResult = {
        success: false,
        running: false,
        trackingEnabled: false,
        schedulerRunning: isTrackingSchedulerRunning(),
        shopifyChecked: 0,
        shopifyLive: 0,
        shopifySkipped: 0,
        deleted: 0,
        deletedProductIds: [],
        deletedShopifyIds: [],
        verifyPassed: false,
        verifyFailures: [],
        abortedBySafety: false,
        notifications: [
          {
            id: "startup-error",
            level: "error",
            title: "Açılış denetimi başarısız",
            body: error,
          },
        ],
        message: error,
        startedAt,
        completedAt: new Date().toISOString(),
        error,
      };
      try {
        await persistNotifications(result.notifications, { error }, "error");
      } catch {
        /* ignore log failure */
      }
      lastResult = result;
      console.warn("[startup-audit] hata:", error);
      return result;
    } finally {
      runningPromise = null;
    }
  })();

  return runningPromise;
}
