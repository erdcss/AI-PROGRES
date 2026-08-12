import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Animated, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme/colors";
import { SHOPIFY_BRAND, SHOPIFY_LOGO_URIS } from "./ShopifyTransfer";

export type InAppBannerVariant = "default" | "shopify" | "error";

export type InAppBannerItem = {
  id: string;
  title: string;
  body?: string;
  variant?: InAppBannerVariant;
};

type Ctx = {
  showBanner: (title: string, body?: string, variant?: InAppBannerVariant) => void;
};

const BannerCtx = createContext<Ctx | null>(null);

export function useInAppBanner(): Ctx {
  const ctx = useContext(BannerCtx);
  if (!ctx) return { showBanner: () => undefined };
  return ctx;
}

function BannerCard({
  item,
  top,
  onDone,
}: {
  item: InAppBannerItem;
  top: number;
  onDone: (id: string) => void;
}) {
  const x = useRef(new Animated.Value(420)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(x, { toValue: 0, duration: 280, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
    const hold = setTimeout(() => {
      Animated.parallel([
        Animated.timing(x, { toValue: 420, duration: 240, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished) onDone(item.id);
      });
    }, 2400);
    return () => clearTimeout(hold);
  }, [item.id, onDone, opacity, x]);

  return (
    <Animated.View
      style={[
        styles.card,
        item.variant === "shopify" && styles.cardShopify,
        item.variant === "error" && styles.cardError,
        { top, opacity, transform: [{ translateX: x }] },
      ]}
    >
      <Pressable onPress={() => onDone(item.id)} style={styles.inner}>
        <View style={styles.row}>
          {item.variant === "shopify" ? (
            <Image source={{ uri: SHOPIFY_LOGO_URIS[0] }} style={styles.icon} resizeMode="contain" />
          ) : null}
          <View style={styles.textCol}>
            <Text style={styles.title} numberOfLines={1}>
              {item.title}
            </Text>
            {item.body ? (
              <Text style={styles.body} numberOfLines={2}>
                {item.body}
              </Text>
            ) : null}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function InAppBannerProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<InAppBannerItem[]>([]);

  const showBanner = useCallback(
    (title: string, body?: string, variant: InAppBannerVariant = "default") => {
      const fingerprint = `${variant}\n${title}\n${body || ""}`;
      setItems((prev) => {
        if (prev.some((x) => `${x.variant || "default"}\n${x.title}\n${x.body || ""}` === fingerprint)) {
          return prev;
        }
        const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        return [{ id, title, body, variant }, ...prev].slice(0, 2);
      });
    },
    [],
  );

  const onDone = useCallback((id: string) => {
    setItems((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const value = useMemo(() => ({ showBanner }), [showBanner]);
  const top = insets.top + 10;

  return (
    <BannerCtx.Provider value={value}>
      {children}
      <View pointerEvents="box-none" style={styles.host}>
        {items.map((item, i) => (
          <BannerCard key={item.id} item={item} top={top + i * 44} onDone={onDone} />
        ))}
      </View>
    </BannerCtx.Provider>
  );
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
  },
  card: {
    position: "absolute",
    right: 10,
    width: "72%",
    maxWidth: 280,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  cardShopify: {
    borderColor: SHOPIFY_BRAND,
    backgroundColor: colors.surfaceElevated,
  },
  cardError: {
    borderColor: colors.negative,
  },
  inner: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  icon: {
    width: 22,
    height: 22,
    borderRadius: 5,
    backgroundColor: SHOPIFY_BRAND,
  },
  textCol: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: 12, fontWeight: "700" },
  body: { color: colors.textSecondary, fontSize: 11, marginTop: 2, lineHeight: 15 },
});
