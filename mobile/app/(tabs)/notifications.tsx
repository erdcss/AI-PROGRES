import React, { useMemo, useState, useCallback, memo } from "react";
import { View, StyleSheet, FlatList, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { colors } from "../../src/theme/colors";
import { fetchChanges, fetchNotifications, type ChangeRow } from "../../src/api/tracking";
import {
  changeTypeLabel,
  formatChangeValue,
  formatRelativeTime,
  isImportantChangeType,
} from "../../src/lib/format";
import {
  EmptyState,
  ErrorState,
  FilterTabs,
  NotificationRow,
  OfflineBanner,
  ScreenHeader,
  SkeletonList,
} from "../../src/components/Ui";
import { useOnline } from "../../src/hooks/useOnline";

const FILTERS = ["Tümü", "Okunmamış", "Önemli"];

const Row = memo(function Row({
  item,
  onPress,
}: {
  item: ChangeRow;
  onPress: (id: number) => void;
}) {
  const title = `${changeTypeLabel(item.changeType)} değişikliği`;
  const name = item.productTitle || `Ürün #${item.trackedProductId}`;
  const body = `${name} ürününün değeri ${formatChangeValue(item.oldValue)} → ${formatChangeValue(item.newValue)}.`;
  return (
    <NotificationRow
      title={title}
      body={body}
      time={formatRelativeTime(item.createdAt)}
      unread={!item.seenAt}
      onPress={() => onPress(item.id)}
    />
  );
});

export default function NotificationsScreen() {
  const online = useOnline();
  const router = useRouter();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState("Tümü");

  const notif = useQuery({ queryKey: ["notifications"], queryFn: fetchNotifications });
  const changes = useQuery({
    queryKey: ["changes-actionable"],
    queryFn: () => fetchChanges(),
  });

  const items = useMemo(() => {
    let list: ChangeRow[] = changes.data?.changes?.length
      ? changes.data.changes
      : notif.data?.lastChanges || [];

    if (filter === "Okunmamış") list = list.filter((c) => !c.seenAt);
    if (filter === "Önemli") list = list.filter((c) => isImportantChangeType(c.changeType));
    return list;
  }, [changes.data, notif.data, filter]);

  const onPress = useCallback(
    (id: number) => router.push(`/change/${id}`),
    [router],
  );

  const loading = changes.isLoading && notif.isLoading;
  const error = changes.isError && notif.isError;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <OfflineBanner online={online} />
      <View style={styles.pad}>
        <ScreenHeader title="Bildirimler" />
        <FilterTabs options={FILTERS} value={filter} onChange={setFilter} />
      </View>

      {loading ? (
        <View style={styles.pad}>
          <SkeletonList rows={8} />
        </View>
      ) : error ? (
        <ErrorState
          message="Veriler alınamadı"
          onRetry={() => {
            changes.refetch();
            notif.refetch();
          }}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          initialNumToRender={16}
          windowSize={9}
          removeClippedSubviews
          refreshControl={
            <RefreshControl
              refreshing={(changes.isFetching || notif.isFetching) && !loading}
              onRefresh={() => {
                changes.refetch();
                notif.refetch();
                qc.invalidateQueries({ queryKey: ["notifications-badge"] });
              }}
              tintColor={colors.text}
            />
          }
          renderItem={({ item }) => <Row item={item} onPress={onPress} />}
          ListEmptyComponent={<EmptyState message="Yeni bildiriminiz yok." />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  pad: { paddingHorizontal: 16, paddingTop: 8 },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
});
