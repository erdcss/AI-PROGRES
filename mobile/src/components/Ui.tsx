import React, { memo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { colors } from "../theme/colors";
import {
  changeTypeLabel,
  formatChangeValue,
  formatRelativeTime,
  isPriceChangeType,
  isStockChangeType,
  priceDeltaDirection,
} from "../lib/format";
import type { ChangeRow } from "../api/tracking";

export function OfflineBanner({ online }: { online: boolean }) {
  if (online) return null;
  return (
    <View style={styles.offline}>
      <Text style={styles.offlineText}>Bağlantı yok</Text>
    </View>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <View style={styles.centerBox}>
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.centerBox}>
      <Text style={styles.emptyText}>{message || "Veriler alınamadı"}</Text>
      {onRetry ? (
        <TouchableOpacity onPress={onRetry} style={styles.retryBtn} activeOpacity={0.7}>
          <Text style={styles.retryText}>Tekrar Dene</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function SkeletonBlock({
  height = 14,
  width = "100%",
  style,
}: {
  height?: number;
  width?: number | `${number}%`;
  style?: object;
}) {
  return (
    <View
      style={[
        {
          height,
          width: width as number | `${number}%`,
          backgroundColor: colors.skeletonHighlight,
          borderRadius: 6,
        },
        style,
      ]}
    />
  );
}

export function SkeletonList({ rows = 6 }: { rows?: number }) {
  return (
    <View style={{ gap: 10, paddingVertical: 8 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={styles.skeletonRow}>
          <SkeletonBlock height={60} width={60} style={{ borderRadius: 8 }} />
          <View style={{ flex: 1, gap: 8 }}>
            <SkeletonBlock height={12} width="78%" />
            <SkeletonBlock height={10} width="42%" />
            <SkeletonBlock height={10} width="28%" />
          </View>
        </View>
      ))}
    </View>
  );
}

export function ScreenHeader({
  title,
  subtitle,
  caption,
  right,
}: {
  title: string;
  subtitle?: string;
  caption?: string;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.headerRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.headerTitle}>{title}</Text>
        {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
        {caption ? <Text style={styles.headerCaption}>{caption}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function StatusBadge({
  ok,
  labelOk = "Sistem Aktif",
  labelBad = "Sistem Beklemede",
}: {
  ok: boolean;
  labelOk?: string;
  labelBad?: string;
}) {
  return (
    <View style={styles.badge}>
      <View style={[styles.dot, { backgroundColor: ok ? colors.positive : colors.warning }]} />
      <Text style={styles.badgeText}>{ok ? labelOk : labelBad}</Text>
    </View>
  );
}

export function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon?: string;
}) {
  return (
    <View style={styles.stat}>
      <View style={styles.statTop}>
        <Text style={styles.statLabel}>{label}</Text>
        {icon ? <Text style={styles.statIcon}>{icon}</Text> : null}
      </View>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

export function FilterTabs({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={styles.filterRow}>
      {options.map((opt) => {
        const on = opt === value;
        return (
          <TouchableOpacity
            key={opt}
            onPress={() => onChange(opt)}
            style={[styles.filterTab, on && styles.filterTabOn]}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterText, on && styles.filterTextOn]}>{opt}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function ChangeDeltaMark({ item }: { item: ChangeRow }) {
  if (isPriceChangeType(item.changeType)) {
    const dir = priceDeltaDirection(item.oldValue, item.newValue);
    if (dir === "down") return <Text style={{ color: colors.positive, fontSize: 13 }}>↓</Text>;
    if (dir === "up") return <Text style={{ color: colors.negative, fontSize: 13 }}>↑</Text>;
  }
  if (isStockChangeType(item.changeType)) {
    return <Text style={{ color: colors.textSecondary, fontSize: 11 }}>●</Text>;
  }
  return null;
}

export const ChangeRowItem = memo(function ChangeRowItem({
  item,
  onPress,
  compact,
}: {
  item: ChangeRow;
  onPress?: () => void;
  compact?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.changeRow, compact && { paddingVertical: 10 }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      {item.productImageUrl ? (
        <Image source={{ uri: item.productImageUrl }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.thumbEmpty]} />
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.changeTitleRow}>
          <Text style={styles.changeTitle} numberOfLines={1}>
            {item.productTitle || `Ürün #${item.trackedProductId}`}
          </Text>
          <ChangeDeltaMark item={item} />
        </View>
        <Text style={styles.changeMeta}>{changeTypeLabel(item.changeType)}</Text>
        <Text style={styles.changeValues} numberOfLines={1}>
          {formatChangeValue(item.oldValue)} → {formatChangeValue(item.newValue)}
        </Text>
        <Text style={styles.changeTime}>{formatRelativeTime(item.createdAt)}</Text>
      </View>
    </TouchableOpacity>
  );
});

/** @deprecated alias */
export const ChangeCard = ChangeRowItem;

export function NotificationRow({
  title,
  body,
  time,
  unread,
  onPress,
}: {
  title: string;
  body: string;
  time: string;
  unread?: boolean;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity style={styles.notifRow} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.notifIconWrap}>
        {unread ? <View style={styles.unreadDot} /> : <View style={styles.readDot} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.notifTitle}>{title}</Text>
        <Text style={styles.notifBody} numberOfLines={3}>
          {body}
        </Text>
        <Text style={styles.changeTime}>{time}</Text>
      </View>
    </TouchableOpacity>
  );
}

export function ProductRow({
  title,
  subtitle,
  price,
  imageUrl,
  delta,
  onPress,
}: {
  title: string;
  subtitle: string;
  price: string;
  imageUrl?: string | null;
  delta?: "up" | "down" | null;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity style={styles.productRow} onPress={onPress} activeOpacity={0.75}>
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.productThumb} />
      ) : (
        <View style={[styles.productThumb, styles.thumbEmpty]} />
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.changeTitle} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.changeMeta} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <View style={styles.productRight}>
        <Text style={styles.productPrice}>{price}</Text>
        {delta === "down" ? (
          <Text style={{ color: colors.positive, fontSize: 12 }}>↓</Text>
        ) : delta === "up" ? (
          <Text style={{ color: colors.negative, fontSize: 12 }}>↑</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

export function LoadingInline() {
  return (
    <View style={styles.centerBox}>
      <ActivityIndicator color={colors.textMuted} />
    </View>
  );
}

export function MetaLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaLine}>
      <Text style={styles.metaLineLabel}>{label}</Text>
      <Text style={styles.metaLineValue}>{value}</Text>
    </View>
  );
}

export function SettingRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
}) {
  if (onPress) {
    return (
      <TouchableOpacity style={styles.settingRow} onPress={onPress} activeOpacity={0.7}>
        <Text style={styles.settingLabel}>{label}</Text>
        {value ? <Text style={styles.settingValue}>{value}</Text> : null}
      </TouchableOpacity>
    );
  }
  return (
    <View style={styles.settingRow}>
      <Text style={styles.settingLabel}>{label}</Text>
      {value ? <Text style={styles.settingValue}>{value}</Text> : null}
    </View>
  );
}

export function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

const styles = StyleSheet.create({
  offline: {
    backgroundColor: colors.surfaceElevated,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  offlineText: { color: colors.warning, textAlign: "center", fontSize: 12, fontWeight: "600" },
  centerBox: { paddingVertical: 48, paddingHorizontal: 24, alignItems: "center" },
  emptyText: { color: colors.textSecondary, fontSize: 14, textAlign: "center" },
  retryBtn: {
    marginTop: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.surface,
  },
  retryText: { color: colors.text, fontSize: 13, fontWeight: "600" },
  skeletonRow: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
  },
  headerRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 16 },
  headerTitle: { color: colors.text, fontSize: 22, fontWeight: "700", letterSpacing: 0.5 },
  headerSubtitle: { color: colors.text, fontSize: 15, fontWeight: "600", marginTop: 6 },
  headerCaption: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.surface,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { color: colors.textSecondary, fontSize: 11 },
  stat: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 14,
    width: "48%",
    marginBottom: 10,
  },
  statTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statLabel: { color: colors.textSecondary, fontSize: 11 },
  statIcon: { color: colors.textMuted, fontSize: 12 },
  statValue: { color: colors.text, fontSize: 24, fontWeight: "700", marginTop: 10 },
  filterRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  filterTab: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: colors.surface,
  },
  filterTabOn: { borderColor: colors.textMuted },
  filterText: { color: colors.textMuted, fontSize: 12 },
  filterTextOn: { color: colors.text, fontWeight: "600" },
  changeRow: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  thumb: { width: 52, height: 52, borderRadius: 8, backgroundColor: "#000" },
  thumbEmpty: { backgroundColor: colors.skeletonHighlight },
  changeTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  changeTitle: { color: colors.text, fontWeight: "600", fontSize: 14, flex: 1 },
  changeMeta: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  changeValues: { color: colors.text, fontSize: 13, marginTop: 4 },
  changeTime: { color: colors.textMuted, fontSize: 11, marginTop: 4 },
  notifRow: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  notifIconWrap: { width: 16, paddingTop: 4, alignItems: "center" },
  unreadDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.text },
  readDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.textMuted },
  notifTitle: { color: colors.text, fontWeight: "600", fontSize: 14 },
  notifBody: { color: colors.textSecondary, fontSize: 13, marginTop: 4, lineHeight: 18 },
  productRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingVertical: 12,
  },
  productThumb: { width: 60, height: 60, borderRadius: 8, backgroundColor: "#000" },
  productRight: { alignItems: "flex-end", gap: 4, minWidth: 72 },
  productPrice: { color: colors.text, fontWeight: "600", fontSize: 13 },
  metaLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  metaLineLabel: { color: colors.textSecondary, fontSize: 13 },
  metaLineValue: { color: colors.text, fontSize: 13, flexShrink: 1, textAlign: "right" },
  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 8,
  },
  settingLabel: { color: colors.text, fontSize: 14 },
  settingValue: { color: colors.textSecondary, fontSize: 13 },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    marginTop: 18,
    marginBottom: 8,
  },
});
