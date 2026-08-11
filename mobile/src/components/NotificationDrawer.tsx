import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { fetchAllChanges, fetchNotifications, type ChangeRow } from "../api/tracking";
import {
  badgeCountFromNotifications,
  changeStatusLabel,
  changeTypeLabel,
  formatChangeValue,
  formatRelativeTime,
} from "../lib/format";
import { EmptyState } from "./Ui";

type Ctx = {
  openDrawer: () => void;
  closeDrawer: () => void;
  unread: number;
};

const NotificationDrawerContext = createContext<Ctx | null>(null);

export function useNotificationDrawer(): Ctx {
  const ctx = useContext(NotificationDrawerContext);
  if (!ctx) {
    return { openDrawer: () => undefined, closeDrawer: () => undefined, unread: 0 };
  }
  return ctx;
}

export function NotificationBell() {
  const { openDrawer, unread } = useNotificationDrawer();
  return (
    <TouchableOpacity onPress={openDrawer} activeOpacity={0.7} style={styles.bellBtn}>
      <Ionicons name="notifications-outline" size={22} color={colors.text} />
      {unread > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unread > 99 ? "99+" : unread}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

export function NotificationDrawerProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();

  const notif = useQuery({
    queryKey: ["notifications"],
    queryFn: fetchNotifications,
    refetchInterval: 30_000,
  });
  const changes = useQuery({
    queryKey: ["changes-all"],
    queryFn: () => fetchAllChanges(),
    refetchInterval: 30_000,
  });

  const unread = notif.data ? badgeCountFromNotifications(notif.data) : 0;
  const items = useMemo(() => changes.data?.changes || notif.data?.lastChanges || [], [changes.data, notif.data]);

  const openDrawer = useCallback(() => setOpen(true), []);
  const closeDrawer = useCallback(() => setOpen(false), []);

  const onPress = useCallback(
    (item: ChangeRow) => {
      setOpen(false);
      router.push(`/change/${item.id}`);
    },
    [router],
  );

  return (
    <NotificationDrawerContext.Provider value={{ openDrawer, closeDrawer, unread }}>
      {children}
      <Modal visible={open} animationType="slide" transparent onRequestClose={closeDrawer}>
        <View style={styles.overlay}>
          <Pressable style={styles.backdrop} onPress={closeDrawer} />
          <View style={[styles.drawer, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }]}>
            <View style={styles.head}>
              <Text style={styles.title}>Bildirimler</Text>
              <TouchableOpacity onPress={closeDrawer} activeOpacity={0.7}>
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={items}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={styles.list}
              onRefresh={() => {
                changes.refetch();
                notif.refetch();
                qc.invalidateQueries({ queryKey: ["notifications-badge"] });
              }}
              refreshing={changes.isFetching || notif.isFetching}
              ListEmptyComponent={<EmptyState message="Bildirim yok." />}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => onPress(item)}
                  activeOpacity={0.75}
                >
                  <View style={styles.rowTop}>
                    <Text style={styles.rowTitle}>
                      {item.watchTag === "red"
                        ? "Kırmızı · "
                        : item.watchTag === "green"
                          ? "Yeşil · "
                          : ""}
                      {changeTypeLabel(item.changeType)} · {changeStatusLabel(item.status)}
                    </Text>
                    {!item.seenAt ? <View style={styles.unread} /> : null}
                  </View>
                  <Text style={styles.rowBody} numberOfLines={3}>
                    {item.productTitle || `Ürün #${item.trackedProductId}`} ·{" "}
                    {formatChangeValue(item.oldValue)} → {formatChangeValue(item.newValue)}
                  </Text>
                  <Text style={styles.rowTime}>{formatRelativeTime(item.createdAt)}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </NotificationDrawerContext.Provider>
  );
}

const styles = StyleSheet.create({
  bellBtn: { padding: 6, position: "relative" },
  badge: {
    position: "absolute",
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.negative,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: { color: colors.text, fontSize: 9, fontWeight: "700" },
  overlay: { flex: 1, flexDirection: "row", justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  backdrop: { flex: 1 },
  drawer: {
    width: "86%",
    maxWidth: 420,
    backgroundColor: colors.bg,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.border,
  },
  head: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  title: { color: colors.text, fontSize: 18, fontWeight: "700" },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  row: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowTitle: { color: colors.text, fontWeight: "600", fontSize: 13, flex: 1 },
  unread: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.text },
  rowBody: { color: colors.textSecondary, fontSize: 13, marginTop: 6, lineHeight: 18 },
  rowTime: { color: colors.textMuted, fontSize: 11, marginTop: 6 },
});
