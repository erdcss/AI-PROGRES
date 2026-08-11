import { AppState, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { fetchPushInbox, type PushInboxItem } from "../api/tracking";
import { CHANNEL_ID, ensureAndroidChannel } from "../hooks/usePush";

const AFTER_ID_KEY = "orvian_inbox_after_id";

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

export async function presentSystemNotification(item: PushInboxItem): Promise<void> {
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

export function isAppInForeground(): boolean {
  return AppState.currentState === "active";
}

/** Uygulama açık/kapalı fark etmez: yeni inbox kayıtlarını cihaz tepsisine basar. */
export async function pollInboxAndPresent(): Promise<PushInboxItem[]> {
  const afterId = await getInboxAfterId();
  const data = await fetchPushInbox(afterId);
  const list = data.items || [];
  if (!list.length) return [];

  const maxId = list.reduce((m, item) => Math.max(m, item.id), afterId);

  if (afterId <= 0) {
    await setInboxAfterId(maxId);
    return [];
  }

  const fresh = list.filter((item) => item.id > afterId);
  if (maxId > afterId) await setInboxAfterId(maxId);
  for (const item of fresh) {
    await presentSystemNotification(item);
  }
  return fresh;
}
