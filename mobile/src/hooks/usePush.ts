import { useEffect } from "react";
import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { registerPushDevice } from "../api/tracking";

const CHANNEL_ID = "tracking_alerts";

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
      shouldShowAlert: true,
      shouldShowBanner: true,
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
      name: "Tracking Alerts",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FFFFFF",
    });
  } catch (err) {
    console.warn("[push] notification channel skipped", err);
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    return finalStatus === "granted";
  } catch (err) {
    console.warn("[push] permission skipped", err);
    return false;
  }
}

export async function registerForPushAsync(): Promise<string | null> {
  if (!isRemotePushAvailable()) {
    console.log("[push] skip remote token (Expo Go or emulator)");
    return null;
  }
  await ensureAndroidChannel();
  const granted = await requestNotificationPermission();
  if (!granted) return null;

  const projectId =
    Constants.easConfig?.projectId ||
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } })?.eas?.projectId;

  if (!projectId || projectId === "replace-with-eas-project-id") {
    console.warn("[push] skip token — EAS projectId placeholder");
    return null;
  }

  const tokenRes = await Notifications.getExpoPushTokenAsync({ projectId });
  return tokenRes.data || null;
}

export function usePushRegistration(): void {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await registerForPushAsync();
        if (!token || cancelled) return;
        const deviceId =
          [Device.osInternalBuildId, Device.modelId, Device.modelName, Platform.OS]
            .filter(Boolean)
            .join("-") || `android-${Device.modelName || "device"}`;
        await registerPushDevice({
          deviceId: String(deviceId),
          platform: "android",
          pushToken: token,
          appVersion: Constants.expoConfig?.version || "1.0.0",
        });
      } catch (err) {
        console.warn("[push] register failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
}
