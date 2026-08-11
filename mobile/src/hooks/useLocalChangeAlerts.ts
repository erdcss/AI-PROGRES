import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import {
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

    const tick = async () => {
      if (stopped) return;
      try {
        const fresh = await pollInboxAndPresent();
        if (!fresh.length) return;
        if (isAppInForeground()) {
          for (const item of fresh) {
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
      if (state === "active" || state === "background") {
        void tick();
      }
    });

    return () => {
      stopped = true;
      clearInterval(timer);
      sub.remove();
    };
  }, [qc]);
}
