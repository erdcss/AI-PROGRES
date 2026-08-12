import React, { useEffect, useState } from "react";
import { Stack, useRouter } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { colors } from "../src/theme/colors";
import { usePushRegistration } from "../src/hooks/usePush";
import { useAllMobileRealtime } from "../src/hooks/useRealtime";
import { useLocalChangeAlerts } from "../src/hooks/useLocalChangeAlerts";
import { parseDeepLink } from "../src/lib/format";
import { NotificationDrawerProvider } from "../src/components/NotificationDrawer";
import { NotificationPermissionGate } from "../src/components/NotificationPermissionGate";
import { InAppBannerProvider } from "../src/components/InAppBanner";
import { BootSplash } from "../src/components/BootSplash";
import { LoginGate } from "../src/components/LoginGate";
import { registerInboxBackgroundTask } from "../src/background/inbox-task";

void registerInboxBackgroundTask();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      placeholderData: (previousData: unknown) => previousData,
    },
  },
});

function DeepLinkHandler() {
  const router = useRouter();
  usePushRegistration();
  useAllMobileRealtime();
  useLocalChangeAlerts();

  useEffect(() => {
    const open = (url: string | null) => {
      if (!url) return;
      const parsed = parseDeepLink(url);
      if (!parsed) return;
      if (parsed.kind === "product") router.push(`/product/${parsed.id}`);
      if (parsed.kind === "change") router.push(`/change/${parsed.id}`);
    };

    Linking.getInitialURL().then(open).catch((err) => {
      console.warn("[deeplink] getInitialURL failed", err);
    });
    const sub = Linking.addEventListener("url", (e) => open(e.url));

    let notifSub: { remove: () => void } | null = null;
    try {
      notifSub = Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as {
          type?: string;
          productId?: string;
          changeId?: string;
        };
        if (data?.type === "TEST") return;
        if (data?.changeId) router.push(`/change/${data.changeId}`);
        else if (data?.productId) {
          const pid = String(data.productId);
          if (pid.startsWith("memory-") || pid.startsWith("tracked-") || pid.startsWith("scraped-")) {
            router.push(`/product/${pid}`);
          } else {
            router.push(`/product/tracked-${pid}`);
          }
        }
      });
    } catch (err) {
      console.warn("[push] notification response listener skipped", err);
    }

    return () => {
      sub.remove();
      notifSub?.remove();
    };
  }, [router]);

  return null;
}

export default function RootLayout() {
  const [splashDone, setSplashDone] = useState(false);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" backgroundColor={colors.bg} />
        <LoginGate>
        <NotificationPermissionGate ready={splashDone}>
        <InAppBannerProvider>
        <NotificationDrawerProvider>
        <DeepLinkHandler />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.bg },
            headerTintColor: colors.text,
            headerShadowVisible: false,
            headerTitleStyle: { fontWeight: "600", fontSize: 16 },
            contentStyle: { backgroundColor: colors.bg },
            animation: "fade_from_bottom",
            animationDuration: 280,
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="product/[id]" options={{ title: "Ürün Detayı" }} />
          <Stack.Screen name="change/[id]" options={{ title: "Değişiklik" }} />
          <Stack.Screen name="webo/[id]" options={{ title: "Webo Ürün" }} />
        </Stack>
        <BootSplash onDone={() => setSplashDone(true)} />
        </NotificationDrawerProvider>
        </InAppBannerProvider>
        </NotificationPermissionGate>
        </LoginGate>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
