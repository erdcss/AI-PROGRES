import { AppState, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { fetchPushInbox, type PushInboxItem } from "../api/tracking";
import {
  CHANNEL_ID,
  WATCHDOG_CHANNEL_ID,
  WATCHDOG_NOTIFICATION_ID,
  ensureAndroidChannel,
} from "../hooks/usePush";

const WATCHDOG_SECONDS = 90;
const AFTER_ID_KEY = "orvian_inbox_after_id";
const PRESENTED_IDS_KEY = "orvian_inbox_presented_ids";

const presentedMemory = new Set<number>();
let pollInFlight: Promise<PushInboxItem[]> | null = null;

export async function getInboxAfterId(): Promise<number> {
  try {
    const raw = await SecureStore.getItemAsync(AFTER_ID_KEY);
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export async function setInboxAfterId(id: number): Promise<void> {
  if (!Number.isFinite(id) || id <= 0) return;
  try {
    await SecureStore.setItemAsync(AFTER_ID_KEY, String(id));
  } catch (err) {
    console.warn("[push] persist afterId skipped", err);
  }
}

async function loadPresentedIds(): Promise<Set<number>> {
  if (presentedMemory.size > 0) return presentedMemory;
  try {
    const raw = await SecureStore.getItemAsync(PRESENTED_IDS_KEY);
    if (raw) {
      const arr = JSON.parse(raw) as number[];
      for (const id of arr) {
        if (Number.isFinite(id)) presentedMemory.add(Number(id));
      }
    }
  } catch {
    /* ignore */
  }
  return presentedMemory;
}

async function markPresented(ids: number[]): Promise<void> {
  if (!ids.length) return;
  for (const id of ids) presentedMemory.add(id);
  const keep = [...presentedMemory].sort((a, b) => b - a).slice(0, 200);
  presentedMemory.clear();
  for (const id of keep) presentedMemory.add(id);
  try {
    await SecureStore.setItemAsync(PRESENTED_IDS_KEY, JSON.stringify(keep));
  } catch {
    /* ignore */
  }
}

export async function presentSystemNotification(item: PushInboxItem): Promise<void> {
  try {
    await ensureAndroidChannel();
    await Notifications.scheduleNotificationAsync({
      identifier: `orvian-inbox-${item.id}`,
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
          inboxId: String(item.id),
        },
      },
      trigger: null,
    });
  } catch (err) {
    console.warn("[push] system alert skipped", err);
  }
}

/** Uygulama kapalıyken OS alarmı JS'i uyandırır; kanal MIN olduğu için kullanıcıya gösterilmez. */
export async function ensureWatchdogScheduled(): Promise<void> {
  try {
    await ensureAndroidChannel();
    await Notifications.cancelScheduledNotificationAsync(WATCHDOG_NOTIFICATION_ID).catch(() => undefined);
    await Notifications.scheduleNotificationAsync({
      identifier: WATCHDOG_NOTIFICATION_ID,
      content: {
        title: "ORVIAN",
        body: " ",
        sound: undefined,
        channelId: WATCHDOG_CHANNEL_ID,
        priority: Notifications.AndroidNotificationPriority.MIN,
        data: { type: "HEARTBEAT" },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: WATCHDOG_SECONDS,
        repeats: true,
        channelId: WATCHDOG_CHANNEL_ID,
      },
    });
  } catch (err) {
    console.warn("[push] watchdog schedule skipped", err);
  }
}

export function isAppInForeground(): boolean {
  return AppState.currentState === "active";
}

/**
 * Yeni inbox kayıtlarını bir kez sunar.
 * Ön planda: yalnızca uygulama içi banner (OS tepsi yok).
 * Arka planda: yalnızca OS tepsi.
 * Aynı inbox id asla ikinci kez gösterilmez.
 */
export async function pollInboxAndPresent(): Promise<PushInboxItem[]> {
  if (pollInFlight) return pollInFlight;

  pollInFlight = (async () => {
    const afterId = await getInboxAfterId();
    const presented = await loadPresentedIds();
    const data = await fetchPushInbox(afterId);
    const list = data.items || [];
    if (!list.length) return [];

    const maxId = list.reduce((m, item) => Math.max(m, item.id), afterId);

    if (afterId <= 0) {
      await setInboxAfterId(maxId);
      await markPresented(list.map((i) => i.id));
      return [];
    }

    const fresh = list.filter((item) => item.id > afterId && !presented.has(item.id));
    if (maxId > afterId) await setInboxAfterId(maxId);
    if (!fresh.length) return [];

    const foreground = isAppInForeground();
    if (!foreground) {
      for (const item of fresh) {
        await presentSystemNotification(item);
      }
    }
    await markPresented(fresh.map((i) => i.id));
    // Ön planda banner useLocalChangeAlerts'te gösterilir; OS tepsi basılmaz
    return fresh;
  })();

  try {
    return await pollInFlight;
  } finally {
    pollInFlight = null;
  }
}
