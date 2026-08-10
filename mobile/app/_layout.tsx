import React, { useEffect } from "react";
import { Stack, useRouter } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { colors } from "../src/theme/colors";
import { usePushRegistration } from "../src/hooks/usePush";
import { useAllMobileRealtime } from "../src/hooks/useRealtime";
import { parseDeepLink } from "../src/lib/format";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 15_000,
    },
  },
});

function DeepLinkHandler() {
  const router = useRouter();
  usePushRegistration();
  useAllMobileRealtime();

  useEffect(() => {
    const open = (url: string | null) => {
      if (!url) return;
      const parsed = parseDeepLink(url);
      if (!parsed) return;
      if (parsed.kind === "product") router.push(`/product/${parsed.id}`);
      if (parsed.kind === "change") router.push(`/change/${parsed.id}`);
    };

    Linking.getInitialURL().then(open);
    const sub = Linking.addEventListener("url", (e) => open(e.url));

    const notifSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as {
        productId?: string;
        changeId?: string;
      };
      if (data?.changeId) router.push(`/change/${data.changeId}`);
      else if (data?.productId) router.push(`/product/tracked-${data.productId}`);
    });

    return () => {
      sub.remove();
      notifSub.remove();
    };
  }, [router]);

  return null;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" backgroundColor={colors.bg} />
        <DeepLinkHandler />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.bg },
            headerTintColor: colors.text,
            headerShadowVisible: false,
            headerTitleStyle: { fontWeight: "600", fontSize: 16 },
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="product/[id]" options={{ title: "Ürün Detayı" }} />
          <Stack.Screen name="change/[id]" options={{ title: "Değişiklik" }} />
        </Stack>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
