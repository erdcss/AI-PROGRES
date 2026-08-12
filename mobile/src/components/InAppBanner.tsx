import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type InAppBannerItem = {
  id: string;
  title: string;
  body?: string;
};

type Ctx = {
  showBanner: (title: string, body?: string) => void;
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
        { top, opacity, transform: [{ translateX: x }] },
      ]}
    >
      <Pressable onPress={() => onDone(item.id)} style={styles.inner}>
        <Text style={styles.title} numberOfLines={1}>
          {item.title}
        </Text>
        {item.body ? (
          <Text style={styles.body} numberOfLines={1}>
            {item.body}
          </Text>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

export function InAppBannerProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<InAppBannerItem[]>([]);

  const showBanner = useCallback((title: string, body?: string) => {
    const fingerprint = `${title}\n${body || ""}`;
    setItems((prev) => {
      if (prev.some((x) => `${x.title}\n${x.body || ""}` === fingerprint)) return prev;
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      return [{ id, title, body }, ...prev].slice(0, 2);
    });
  }, []);

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
    width: "62%",
    maxWidth: 240,
    borderRadius: 8,
    backgroundColor: "#111111",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#3F3F46",
  },
  inner: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  title: { color: "#FAFAFA", fontSize: 11, fontWeight: "700" },
  body: { color: "#A1A1AA", fontSize: 10, marginTop: 1, lineHeight: 13 },
});
