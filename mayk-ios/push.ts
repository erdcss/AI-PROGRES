import Constants from "expo-constants";
import * as Notifications from "expo-notifications";

const PROJECT_ID = "904c797e-7ddc-46a6-b5ed-e081f1c39bd3";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function getMaykPushToken(requestPermission: boolean): Promise<string | null> {
  const current = await Notifications.getPermissionsAsync();
  const hasPermission =
    current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  const permission = hasPermission
    ? current
    : requestPermission ? await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
      }) : current;
  const allowed =
    permission.granted || permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  if (!allowed) return null;
  const projectId =
    Constants.easConfig?.projectId ||
    Constants.expoConfig?.extra?.eas?.projectId ||
    PROJECT_ID;
  const result = await Notifications.getExpoPushTokenAsync({ projectId });
  if (!/^(ExponentPushToken|ExpoPushToken)\[/.test(result.data)) {
    throw new Error("Push token alınamadı");
  }
  return result.data;
}

export function onMaykNotificationTap(callback: (path: string) => void) {
  return Notifications.addNotificationResponseReceivedListener(response => {
    const data = response.notification.request.content.data as Record<string,unknown>;
    const route = data?.path === "/urun-takip" ? "/urun-takip" : "/urun-takip";
    callback(route);
  });
}

export async function getLastMaykNotificationPath(): Promise<string | null> {
  const response = await Notifications.getLastNotificationResponseAsync();
  if (!response) return null;
  return "/urun-takip";
}
