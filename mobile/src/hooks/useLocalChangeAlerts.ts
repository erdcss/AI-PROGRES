import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import { useQuery } from "@tanstack/react-query";
import { fetchPushInbox, type PushInboxItem } from "../api/tracking";
import { ensureAndroidChannel, getNotificationPermissionStatus } from "./usePush";
import { useInAppBanner } from "../components/InAppBanner";

async function presentInbox(item: PushInboxItem): Promise<void> {
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
    console.warn("[push] inbox local alert skipped", err);
  }
}

/** Sunucu kuyruğundaki test + programlı bildirimleri cihazda gösterir (FCM olmasa da). */
export function useLocalChangeAlerts(): void {
  const { showBanner } = useInAppBanner();
  const primed = useRef(false);
  const seen = useRef(new Set<number>());
  const afterId = useRef(0);

  const q = useQuery({
    queryKey: ["push-inbox"],
    queryFn: () => fetchPushInbox(afterId.current),
    refetchInterval: 12_000,
  });

  useEffect(() => {
    void getNotificationPermissionStatus();
  }, []);

  useEffect(() => {
    if (!q.isSuccess) return;
    const list = q.data?.items || [];
    if (!primed.current) {
      for (const item of list) seen.current.add(item.id);
      const maxId = list.reduce((m, item) => Math.max(m, item.id), afterId.current);
      afterId.current = maxId;
      primed.current = true;
      return;
    }
    for (const item of list) {
      if (seen.current.has(item.id)) continue;
      seen.current.add(item.id);
      afterId.current = Math.max(afterId.current, item.id);
      showBanner(item.title, item.body);
      void presentInbox(item);
    }
  }, [q.isSuccess, q.data, showBanner]);
}
