import React from "react";
import { Tabs } from "expo-router";
import { Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { colors } from "../../src/theme/colors";
import { fetchNotifications } from "../../src/api/tracking";
import { badgeCountFromNotifications } from "../../src/lib/format";

function TabIcon({ glyph, focused }: { glyph: string; focused: boolean }) {
  return (
    <Text style={{ color: focused ? colors.text : colors.textMuted, fontSize: 16, marginBottom: 2 }}>
      {glyph}
    </Text>
  );
}

function TabLabel({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text
      style={{
        color: focused ? colors.text : colors.textMuted,
        fontSize: 10,
        fontWeight: focused ? "600" : "400",
      }}
    >
      {label}
    </Text>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { data } = useQuery({
    queryKey: ["notifications-badge"],
    queryFn: fetchNotifications,
    refetchInterval: 60_000,
  });
  const badge = data ? badgeCountFromNotifications(data) : 0;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 56 + Math.max(insets.bottom, 8),
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 6,
        },
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarItemStyle: { paddingTop: 2 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Ana Sayfa",
          tabBarIcon: ({ focused }) => <TabIcon glyph="⌂" focused={focused} />,
          tabBarLabel: ({ focused }) => <TabLabel label="Ana Sayfa" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="products"
        options={{
          title: "Ürünler",
          tabBarIcon: ({ focused }) => <TabIcon glyph="▣" focused={focused} />,
          tabBarLabel: ({ focused }) => <TabLabel label="Ürünler" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="tracking"
        options={{
          title: "Takip",
          tabBarIcon: ({ focused }) => <TabIcon glyph="◎" focused={focused} />,
          tabBarLabel: ({ focused }) => <TabLabel label="Takip" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: "Bildirimler",
          tabBarBadge: badge > 0 ? badge : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.surfaceElevated,
            color: colors.text,
            fontSize: 10,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.border,
          },
          tabBarIcon: ({ focused }) => <TabIcon glyph="◉" focused={focused} />,
          tabBarLabel: ({ focused }) => <TabLabel label="Bildirimler" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Ayarlar",
          tabBarIcon: ({ focused }) => <TabIcon glyph="⚙" focused={focused} />,
          tabBarLabel: ({ focused }) => <TabLabel label="Ayarlar" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
