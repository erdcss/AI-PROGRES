import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { useQueryClient } from "@tanstack/react-query";
import { fetchPushInbox, type PushInboxItem } from "../api/tracking";
import {
  CHANNEL_ID,
  ensureAndroidChannel,
  getNotificationPermissionStatus,
  isAppInForeground,
} from "./usePush";
import { useInAppBanner } from "../components/InAppBanner";

async function presentSystemNotification(item: PushInboxItem): Promise<void> {
  try {
    await ensureAndroidChannel();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: item.title,
        body: item.body,
        sound: "default",
        channelId: CHANNEL_ID,
        priority: Notifications.AndroidNotificationPriority.MAX,
        vibrate: Platform.OS === "android" ? [0, 250, 250, 250] : undefined,
        data: {
          type: item.data?.type || "",
          productId: item.data?.productId || "",
          changeId: item.data?.changeId || "",
        },
      },
      trigger: null,
    });
  } catch (err) {
    console.warn("[push] system alert skipped", err);
  }
}

/** Test + programlı bildirimler her zaman telefon tepsisine gider; uygulama açıkken kart da gösterilir. */
export function useLocalChangeAlerts(): void {
  const { showBanner } = useInAppBanner();
  const qc = useQueryClient();
  const primed = useRef(false);
  const seen = useRef(new Set<number>());
  const afterId = useRef(0);
  const showBannerRef = useRef(showBanner);
  showBannerRef.current = showBanner;

  useEffect(() => {
    void getNotificationPermissionStatus();
    void ensureAndroidChannel();
  }, []);

  useEffect(() => {
    let stopped = false;

    const tick = async () => {
      if (stopped) return;
      try {
        const data = await fetchPushInbox(afterId.current);
        const list = data.items || [];
        if (!primed.current) {
          for (const item of list) seen.current.add(item.id);
          afterId.current = list.reduce((m, item) => Math.max(m, item.id), afterId.current);
          primed.current = true;
          void qc.invalidateQueries({ queryKey: ["push-inbox-recent"] });
          return;
        }
        const fresh: PushInboxItem[] = [];
        for (const item of list) {
          if (seen.current.has(item.id)) continue;
          seen.current.add(item.id);
          afterId.current = Math.max(afterId.current, item.id);
          fresh.push(item);
        }
        if (!fresh.length) return;
        for (const item of fresh) {
          await presentSystemNotification(item);
          if (isAppInForeground()) {
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
    const sub = AppState.addEventListener("change", () => {
      void tick();
    });

    return () => {
      stopped = true;
      clearInterval(timer);
      sub.remove();
    };
  }, [qc]);
}
