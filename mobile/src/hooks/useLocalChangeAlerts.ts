import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import * as Notifications from "expo-notifications";
import { useQueryClient } from "@tanstack/react-query";
import {
  WATCHDOG_NOTIFICATION_ID,
  ensureAndroidChannel,
  getNotificationPermissionStatus,
} from "./usePush";
import { useInAppBanner } from "../components/InAppBanner";
import { isAppInForeground, pollInboxAndPresent } from "../lib/inbox-alerts";
import { registerInboxBackgroundTask } from "../background/inbox-task";

const bannerShownIds = new Set<number>();

/** Inbox → tek kanal: ön planda banner, arka planda OS. Yinelenmez. */
export function useLocalChangeAlerts(): void {
  const { showBanner } = useInAppBanner();
  const qc = useQueryClient();
  const showBannerRef = useRef(showBanner);
  showBannerRef.current = showBanner;

  useEffect(() => {
    void getNotificationPermissionStatus();
    void ensureAndroidChannel();
    void registerInboxBackgroundTask();
  }, []);

  useEffect(() => {
    let stopped = false;
    let activeSince = isAppInForeground() ? Date.now() : 0;

    const tick = async () => {
      if (stopped) return;
      try {
        const fresh = await pollInboxAndPresent();
        if (!fresh.length) return;

        const syncTypes = new Set([
          "NEW_PRODUCT",
          "SCRAPE_SUCCESS",
          "SCRAPE_FAILED",
          "PRODUCT_TRANSFERRED",
          "UPLOAD_FAILED",
          "UPLOAD_BATCH",
          "PRICE_CHANGED",
          "STOCK_CHANGED",
          "OUT_OF_STOCK",
          "BACK_IN_STOCK",
          "VARIANT_CHANGED",
          "PRODUCT_REMOVED",
        ]);
        const shouldSyncCatalog = fresh.some((item) =>
          syncTypes.has(String(item.data?.type || "").toUpperCase()),
        );
        if (shouldSyncCatalog) {
          void qc.invalidateQueries({ queryKey: ["scraped-products"] });
          void qc.invalidateQueries({ queryKey: ["memory-products"] });
          void qc.invalidateQueries({ queryKey: ["tracked-products"] });
          void qc.invalidateQueries({ queryKey: ["dashboard"] });
          void qc.invalidateQueries({ queryKey: ["webo-products"] });
          void qc.invalidateQueries({ queryKey: ["changes-all"] });
        }

        const alreadyOpen =
          isAppInForeground() && activeSince > 0 && Date.now() - activeSince > 1200;
        if (alreadyOpen) {
          for (const item of fresh.slice(0, 2)) {
            if (bannerShownIds.has(item.id)) continue;
            bannerShownIds.add(item.id);
            const type = String(item.data?.type || "").toUpperCase();
            const isError = type.includes("FAILED") || type.includes("ERROR");
            showBannerRef.current(item.title, item.body, isError ? "error" : "default");
          }
        }
        void qc.invalidateQueries({ queryKey: ["push-inbox-recent"] });
        void qc.invalidateQueries({ queryKey: ["notifications-badge"] });
      } catch (err) {
        console.warn("[push] inbox poll skipped", err);
      }
    };

    void tick();
    // Program hareketleri uygulama açıkken yaklaşık 1 saniye içinde yansısın.
    const timer = setInterval(() => {
      void tick();
    }, 1000);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        activeSince = Date.now();
        void tick();
      } else if (state === "background") {
        activeSince = 0;
        void tick();
      }
    });
    const received = Notifications.addNotificationReceivedListener((notification) => {
      const id = String(notification.request.identifier || "");
      const type = String(notification.request.content.data?.type || "");
      if (id === WATCHDOG_NOTIFICATION_ID || type === "HEARTBEAT") {
        void tick();
        return;
      }
      const inboxId = Number(notification.request.content.data?.inboxId || 0);
      if (inboxId > 0) bannerShownIds.add(inboxId);
    });

    return () => {
      stopped = true;
      clearInterval(timer);
      sub.remove();
      received.remove();
    };
  }, [qc]);
}
