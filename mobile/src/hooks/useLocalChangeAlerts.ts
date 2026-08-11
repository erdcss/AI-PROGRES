import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import { useQuery } from "@tanstack/react-query";
import { fetchAllChanges, type ChangeRow } from "../api/tracking";
import {
  changeStatusLabel,
  changeTypeLabel,
  formatChangeValue,
} from "../lib/format";
import { parseWatchTag, shouldNotifyForWatchTag, watchTagLabel } from "../lib/watch-tag";
import { ensureAndroidChannel, requestNotificationPermission } from "./usePush";

async function presentLocal(change: ChangeRow): Promise<void> {
  try {
    await ensureAndroidChannel();
    const tag = parseWatchTag(change.watchTag);
    const tagPrefix = watchTagLabel(tag);
    const title = `${tagPrefix ? `${tagPrefix} · ` : ""}${changeTypeLabel(change.changeType)} · ${changeStatusLabel(change.status)}`;
    const body = `${change.productTitle || `Ürün #${change.trackedProductId}`}: ${formatChangeValue(change.oldValue)} → ${formatChangeValue(change.newValue)}`;
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
        data: {
          changeId: String(change.id),
          productId: String(change.trackedProductId),
        },
      },
      trigger: null,
    });
  } catch (err) {
    console.warn("[push] local alert skipped", err);
  }
}

/** Yeni takip durumlarını her durumda cihaz bildirimi olarak gösterir (Expo Go dahil yerel). */
export function useLocalChangeAlerts(): void {
  const primed = useRef(false);
  const seen = useRef(new Set<number>());
  const lastNotify = useRef(new Map<string, number>());
  const q = useQuery({
    queryKey: ["changes-all"],
    queryFn: () => fetchAllChanges(),
    refetchInterval: 25_000,
  });

  useEffect(() => {
    void requestNotificationPermission();
  }, []);

  useEffect(() => {
    if (!q.isSuccess) return;
    const list = q.data?.changes || [];
    if (!primed.current) {
      for (const c of list) seen.current.add(c.id);
      primed.current = true;
      return;
    }
    for (const c of list) {
      if (seen.current.has(c.id)) continue;
      seen.current.add(c.id);
      const tag = parseWatchTag(c.watchTag);
      const key = `${c.trackedProductId}:${c.changeType}`;
      if (!shouldNotifyForWatchTag(tag, c.changeType, lastNotify.current.get(key))) continue;
      lastNotify.current.set(key, Date.now());
      void presentLocal(c);
    }
  }, [q.isSuccess, q.data]);
}
