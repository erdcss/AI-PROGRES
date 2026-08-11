import React, { useState } from "react";
import {
  View,
  Image,
  FlatList,
  StyleSheet,
  Modal,
  Pressable,
  Text,
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StatusBar,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";

export function ImageGallery({
  urls,
  height = 320,
}: {
  urls: string[];
  height?: number;
}) {
  const [index, setIndex] = useState(0);
  const [width, setWidth] = useState(Dimensions.get("window").width - 32);
  const [open, setOpen] = useState(false);
  const fullW = Dimensions.get("window").width;
  const fullH = Dimensions.get("window").height;

  if (!urls.length) {
    return (
      <View style={[styles.slide, { width: "100%", height, backgroundColor: colors.skeletonHighlight }]} />
    );
  }

  const onScroll =
    (pageW: number) =>
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const next = Math.round(x / Math.max(pageW, 1));
      if (next !== index && next >= 0 && next < urls.length) setIndex(next);
    };

  const renderPager = (pageW: number, pageH: number, lightbox: boolean) => (
    <FlatList
      key={`${lightbox ? "full" : "card"}-${pageW}`}
      data={urls}
      extraData={index}
      keyExtractor={(uri, i) => `${uri}-${i}`}
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      onMomentumScrollEnd={onScroll(pageW)}
      getItemLayout={(_, i) => ({ length: pageW, offset: pageW * i, index: i })}
      initialScrollIndex={lightbox ? Math.min(index, urls.length - 1) : 0}
      onScrollToIndexFailed={() => undefined}
      renderItem={({ item }) => (
        <Pressable
          onPress={() => (lightbox ? undefined : setOpen(true))}
          style={{ width: pageW, height: pageH }}
        >
          <Image
            source={{ uri: item }}
            style={[
              styles.slide,
              { width: pageW, height: pageH, borderRadius: lightbox ? 0 : 12 },
            ]}
            resizeMode="contain"
          />
        </Pressable>
      )}
    />
  );

  return (
    <View
      style={styles.wrap}
      onLayout={(e) => {
        const w = Math.round(e.nativeEvent.layout.width);
        if (w > 0 && w !== width) setWidth(w);
      }}
    >
      {renderPager(width, height, false)}
      <View style={styles.counter} pointerEvents="none">
        <Text style={styles.counterText}>
          {index + 1} / {urls.length}
        </Text>
      </View>

      <Modal visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <StatusBar hidden={open} />
        <View style={styles.lightbox}>
          {renderPager(fullW, fullH, true)}
          <View style={styles.lightboxTop}>
            <Text style={styles.counterText}>
              {index + 1} / {urls.length}
            </Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={12} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color="#fff" />
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14, position: "relative" },
  slide: {
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  counter: {
    position: "absolute",
    right: 10,
    bottom: 10,
    backgroundColor: "rgba(0,0,0,0.72)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  counterText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.6,
  },
  lightbox: {
    flex: 1,
    backgroundColor: "#000",
  },
  lightboxTop: {
    position: "absolute",
    top: 48,
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
});
