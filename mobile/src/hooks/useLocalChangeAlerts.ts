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

/** Test + programlı bildirimler cihaz tepsisine gider; uygulama açıkken kart da gösterilir. */
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
        const alreadyOpen = isAppInForeground() && activeSince > 0 && Date.now() - activeSince > 2000;
        if (alreadyOpen) {
          for (const item of fresh.slice(0, 2)) {
            showBannerRef.current(item.title, item.body);
          }
        }
        void qc.invalidateQueries({ queryKey: ["push-inbox-recent"] });
        void qc.invalidateQueries({ queryKey: ["notifications-badge"] });
      } catch (err) {
        console.warn("[push] inbox poll skipped", err);
      }
    };

    void tick();
    const timer = setInterval(() => {
      void tick();
    }, 4000);
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
      }
    });

    return () => {
      stopped = true;
      clearInterval(timer);
      sub.remove();
      received.remove();
    };
  }, [qc]);
}
