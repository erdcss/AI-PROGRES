import { useEffect } from "react";
import { Linking, PermissionsAndroid, Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { registerPushDevice } from "../api/tracking";

const CHANNEL_ID = "tracking_alerts";

export type NotificationPermissionStatus = "granted" | "denied" | "undetermined";

/** Expo Go (SDK 53+) does not support remote push. Standalone/dev builds do. */
export function isExpoGoRuntime(): boolean {
  const ownership = Constants.appOwnership;
  const execution = String(
    (Constants as { executionEnvironment?: string }).executionEnvironment || "",
  );
  return ownership === "expo" || execution === "storeClient";
}

export function isRemotePushAvailable(): boolean {
  if (isExpoGoRuntime()) return false;
  if (!Device.isDevice) return false;
  return true;
}

try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: false,
      shouldShowBanner: false,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
} catch (err) {
  console.warn("[push] setNotificationHandler skipped", err);
}

export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Bildirimler",
      description: "Fiyat, stok ve varyant uyarıları",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FFFFFF",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      enableVibrate: true,
      showBadge: true,
    });
  } catch (err) {
    console.warn("[push] notification channel skipped", err);
  }
}

function mapStatus(status?: string | null): NotificationPermissionStatus {
  if (status === "granted") return "granted";
  if (status === "denied") return "denied";
  return "undetermined";
}

export async function getNotificationPermissionStatus(): Promise<NotificationPermissionStatus> {
  try {
    const current = await Notifications.getPermissionsAsync();
    return mapStatus(current.status);
  } catch (err) {
    console.warn("[push] get permission skipped", err);
    return "undetermined";
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  try {
    await ensureAndroidChannel();

    if (Platform.OS === "android") {
      const perm = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
      if (perm && Number(Platform.Version) >= 33) {
        const androidResult = await PermissionsAndroid.request(perm);
        if (androidResult === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
          await openNotificationSettings();
        }
        if (androidResult === PermissionsAndroid.RESULTS.GRANTED) {
          const current = await Notifications.getPermissionsAsync().catch(() => null);
          if (current?.status === "granted") return true;
        }
      }
    }

    const { status } = await Notifications.requestPermissionsAsync();
    return status === "granted";
  } catch (err) {
    console.warn("[push] permission skipped", err);
    return false;
  }
}

export async function openNotificationSettings(): Promise<void> {
  try {
    await Linking.openSettings();
  } catch (err) {
    console.warn("[push] openSettings skipped", err);
  }
}

function stableDeviceId(): string {
  return (
    [Device.osInternalBuildId, Device.modelId, Device.modelName, Platform.OS]
      .filter(Boolean)
      .join("-") || `android-${Device.modelName || "device"}`
  );
}

export async function registerForPushAsync(): Promise<string | null> {
  if (!isRemotePushAvailable()) {
    console.log("[push] skip remote token (Expo Go or emulator)");
    return null;
  }
  await ensureAndroidChannel();
  const granted = (await getNotificationPermissionStatus()) === "granted";
  if (!granted) return null;

  const projectId =
    Constants.easConfig?.projectId ||
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } })?.eas?.projectId;

  if (!projectId || projectId === "replace-with-eas-project-id") {
    console.warn("[push] skip token — EAS projectId placeholder");
    return null;
  }

  try {
    const tokenRes = await Notifications.getExpoPushTokenAsync({ projectId });
    if (tokenRes.data) return tokenRes.data;
  } catch (err) {
    console.warn("[push] expo token failed", err);
  }
  try {
    const device = await Notifications.getDevicePushTokenAsync();
    if (device?.data) return String(device.data);
  } catch (err) {
    console.warn("[push] device token failed", err);
  }
  return null;
}

export type RegisterPushResult = {
  ok: boolean;
  error?: string;
};

export async function registerPushIfAllowed(): Promise<RegisterPushResult> {
  try {
    if (isExpoGoRuntime()) {
      return {
        ok: false,
        error: "Expo Go uzak bildirim kaydetmez. Kurulu APK kullanın.",
      };
    }
    if (!Device.isDevice) {
      return { ok: false, error: "Kayıt için fiziksel cihaz gerekli." };
    }
    if ((await getNotificationPermissionStatus()) !== "granted") {
      return { ok: false, error: "Önce sistem bildirim iznini verin." };
    }
    const deviceId = stableDeviceId();
    let token: string | null = null;
    try {
      token = await registerForPushAsync();
    } catch (err) {
      console.warn("[push] token fetch failed", err);
    }
    await registerPushDevice({
      deviceId,
      platform: "android",
      pushToken: token || `local:${deviceId}`,
      appVersion: Constants.expoConfig?.version || "1.0.0",
    });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[push] register failed", message);
    return { ok: false, error: message };
  }
}

export function usePushRegistration(): void {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const status = await getNotificationPermissionStatus();
      if (cancelled || status !== "granted") return;
      await registerPushIfAllowed();
    })();
    return () => {
      cancelled = true;
    };
  }, []);
}
