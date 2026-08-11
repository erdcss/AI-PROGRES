import React from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme/colors";
import type { ChangeRow, ProductSnapshot } from "../api/tracking";
import {
  changeStatusLabel,
  changeTypeLabel,
  formatChangeValue,
  formatDateTime,
  formatMoney,
  isPriceChangeType,
  priceDeltaDirection,
} from "../lib/format";

export function PriceMovementDrawer({
  visible,
  onClose,
  price,
  stock,
  snapshots,
  changes,
}: {
  visible: boolean;
  onClose: () => void;
  price?: string | number | null;
  stock?: string | number | null;
  snapshots: ProductSnapshot[];
  changes: ChangeRow[];
}) {
  const insets = useSafeAreaInsets();
  const priceMoves = changes.filter((c) => isPriceChangeType(c.changeType));
  const otherMoves = changes.filter((c) => !isPriceChangeType(c.changeType));

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.handle} />
          <View style={styles.head}>
            <Text style={styles.title}>Fiyat ve hareketler</Text>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.close}>Kapat</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.body}>
            <View style={styles.priceBox}>
              <Text style={styles.priceLabel}>Güncel fiyat</Text>
              <Text style={styles.priceValue}>{formatMoney(price)}</Text>
              <Text style={styles.stock}>
                Stok {stock != null && stock !== "" ? String(stock) : "—"}
              </Text>
            </View>

            <Text style={styles.section}>Fiyat geçmişi</Text>
            {snapshots.length === 0 ? (
              <Text style={styles.empty}>Kayıtlı fiyat geçmişi yok.</Text>
            ) : (
              snapshots.map((s) => (
                <View key={s.id} style={styles.row}>
                  <Text style={styles.rowMain}>{formatMoney(s.price)}</Text>
                  <Text style={styles.rowMeta}>
                    {formatDateTime(s.createdAt)}
                    {s.stock != null ? ` · stok ${s.stock}` : ""}
                  </Text>
                </View>
              ))
            )}

            <Text style={styles.section}>Fiyat hareketleri</Text>
            {priceMoves.length === 0 ? (
              <Text style={styles.empty}>Fiyat değişikliği yok.</Text>
            ) : (
              priceMoves.map((c) => {
                const dir = priceDeltaDirection(c.oldValue, c.newValue);
                return (
                  <View key={c.id} style={styles.row}>
                    <Text style={styles.rowMain}>
                      {formatChangeValue(c.oldValue)} → {formatChangeValue(c.newValue)}
                      {dir === "down" ? "  ↓" : dir === "up" ? "  ↑" : ""}
                    </Text>
                    <Text style={styles.rowMeta}>
                      {changeStatusLabel(c.status)} · {formatDateTime(c.createdAt)}
                    </Text>
                  </View>
                );
              })
            )}

            <Text style={styles.section}>Diğer hareketler</Text>
            {otherMoves.length === 0 ? (
              <Text style={styles.empty}>Başka hareket yok.</Text>
            ) : (
              otherMoves.map((c) => (
                <View key={c.id} style={styles.row}>
                  <Text style={styles.rowMain}>{changeTypeLabel(c.changeType)}</Text>
                  <Text style={styles.rowMeta}>
                    {formatChangeValue(c.oldValue)} → {formatChangeValue(c.newValue)}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {changeStatusLabel(c.status)} · {formatDateTime(c.createdAt)}
                  </Text>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" },
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    maxHeight: "86%",
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.textMuted,
    marginBottom: 10,
  },
  head: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  title: { color: colors.text, fontSize: 17, fontWeight: "700" },
  close: { color: colors.textSecondary, fontSize: 14 },
  body: { paddingBottom: 24 },
  priceBox: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 8,
  },
  priceLabel: { color: colors.textSecondary, fontSize: 12 },
  priceValue: { color: colors.text, fontSize: 28, fontWeight: "700", marginTop: 4 },
  stock: { color: colors.textSecondary, fontSize: 13, marginTop: 6 },
  section: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 14,
    marginTop: 18,
    marginBottom: 8,
  },
  empty: { color: colors.textMuted, fontSize: 13, marginBottom: 6 },
  row: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowMain: { color: colors.text, fontSize: 14, fontWeight: "600" },
  rowMeta: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
});
