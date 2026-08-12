import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { colors } from "../theme/colors";

/** Shopify marka yeşili — aktarım vurgusu */
export const SHOPIFY_BRAND = "#95BF47";

export const SHOPIFY_LOGO_URIS = [
  "https://cdn.shopify.com/shopify-marketing_assets/static/shopify-favicon.png",
  "https://logo.clearbit.com/shopify.com",
];

function ShopifyLogo({ size }: { size: number }) {
  const [idx, setIdx] = useState(0);
  const uri = SHOPIFY_LOGO_URIS[idx] || SHOPIFY_LOGO_URIS[0];
  return (
    <Image
      source={{ uri }}
      style={{ width: size, height: size, borderRadius: 3, backgroundColor: SHOPIFY_BRAND }}
      resizeMode="contain"
      onError={() => {
        if (idx < SHOPIFY_LOGO_URIS.length - 1) setIdx(idx + 1);
      }}
    />
  );
}

type ShopifyTransferButtonProps = {
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  compact?: boolean;
  boxed?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function ShopifyTransferButton({
  onPress,
  disabled,
  loading,
  compact,
  boxed,
  style,
}: ShopifyTransferButtonProps) {
  return (
    <View style={[boxed ? styles.boxWrap : null, style]}>
      <TouchableOpacity
        style={[
          compact ? styles.btnCompact : styles.btnFull,
          boxed && styles.btnBoxed,
          disabled && styles.btnDisabled,
        ]}
        disabled={disabled || loading}
        onPress={onPress}
        activeOpacity={0.8}
      >
        {loading ? (
          <ActivityIndicator color={colors.text} size="small" />
        ) : (
          <View style={styles.btnInner}>
            <ShopifyLogo size={compact ? 18 : 20} />
            <Text style={compact ? styles.labelCompact : styles.labelFull} numberOfLines={1}>
              Shopify'a aktar
            </Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

type ThemedConfirmModalProps = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ThemedConfirmModal({
  visible,
  title,
  message,
  confirmLabel = "Aktar",
  cancelLabel = "Vazgeç",
  loading,
  onConfirm,
  onCancel,
}: ThemedConfirmModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.overlay} onPress={onCancel}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHeader}>
            <ShopifyLogo size={28} />
            <Text style={styles.sheetTitle}>{title}</Text>
          </View>
          <Text style={styles.sheetMessage}>{message}</Text>
          <View style={styles.sheetActions}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onCancel}
              disabled={loading}
              activeOpacity={0.75}
            >
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, loading && styles.btnDisabled]}
              onPress={onConfirm}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color={colors.text} size="small" />
              ) : (
                <Text style={styles.confirmText}>{confirmLabel}</Text>
              )}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  boxWrap: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 10,
    padding: 6,
    alignSelf: "stretch",
    minWidth: 124,
    maxWidth: 136,
  },
  btnCompact: {
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 110,
  },
  btnBoxed: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SHOPIFY_BRAND,
  },
  btnFull: {
    marginTop: 8,
    backgroundColor: colors.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  btnDisabled: { opacity: 0.55 },
  btnInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  labelCompact: {
    color: colors.text,
    fontSize: 11,
    fontWeight: "700",
    flexShrink: 1,
  },
  labelFull: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 18,
    gap: 12,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sheetTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 17,
    fontWeight: "700",
  },
  sheetMessage: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  sheetActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: colors.bg,
  },
  cancelText: { color: colors.textSecondary, fontSize: 14, fontWeight: "600" },
  confirmBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: colors.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SHOPIFY_BRAND,
  },
  confirmText: { color: colors.text, fontSize: 14, fontWeight: "700" },
});
