import { useEffect } from "react";
import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { registerPushDevice } from "../api/tracking";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const CHANNEL_ID = "tracking_alerts";

export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "Tracking Alerts",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#FFFFFF",
  });
}

export async function registerForPushAsync(): Promise<string | null> {
  if (!Device.isDevice) return null;
  await ensureAndroidChannel();

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") return null;

  const projectId =
    Constants.easConfig?.projectId ||
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } })?.eas?.projectId;

  const tokenRes = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined,
  );
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
          Constants.sessionId ||
          Device.modelId ||
          Device.modelName ||
          `android-${Date.now()}`;
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
