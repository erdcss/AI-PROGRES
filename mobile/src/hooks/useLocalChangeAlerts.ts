import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import * as Notifications from "expo-notifications";
import { useQueryClient } from "@tanstack/react-query";
import { fetchPushInbox, type PushInboxItem } from "../api/tracking";
import {
  ensureAndroidChannel,
  getNotificationPermissionStatus,
  hasRemotePushToken,
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
        sound: true,
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

function presentItems(
  items: PushInboxItem[],
  showBanner: (title: string, body?: string) => void,
): void {
  const inApp = isAppInForeground();
  for (const item of items) {
    if (inApp) {
      showBanner(item.title, item.body);
      continue;
    }
    if (!hasRemotePushToken()) {
      void presentSystemNotification(item);
    }
  }
}

/** Test + programlı bildirimler: içeride uygulama içi, dışarıda sistem bildirimi. */
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
        presentItems(fresh, showBannerRef.current);
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
      if (state !== "active") void tick();
    });

    return () => {
      stopped = true;
      clearInterval(timer);
      sub.remove();
    };
  }, [qc]);
}
