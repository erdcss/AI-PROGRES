import React, { useState } from "react";
import {
  View,
  Image,
  FlatList,
  StyleSheet,
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from "react-native";
import { colors } from "../theme/colors";

const SCREEN_W = Dimensions.get("window").width;

export function ImageGallery({
  urls,
  height = 320,
}: {
  urls: string[];
  height?: number;
}) {
  const [index, setIndex] = useState(0);
  const width = SCREEN_W - 32;

  if (!urls.length) {
    return <View style={[styles.slide, { width, height, backgroundColor: colors.skeletonHighlight }]} />;
  }

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const next = Math.round(x / Math.max(width, 1));
    if (next !== index && next >= 0 && next < urls.length) setIndex(next);
  };

  return (
    <View style={styles.wrap}>
      <FlatList
        data={urls}
        keyExtractor={(uri, i) => `${uri}-${i}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        renderItem={({ item }) => (
          <Image
            source={{ uri: item }}
            style={[styles.slide, { width, height }]}
            resizeMode="contain"
          />
        )}
      />
      {urls.length > 1 ? (
        <View style={styles.dots}>
          {urls.map((_, i) => (
            <View key={i} style={[styles.dot, i === index && styles.dotOn]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  slide: {
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    marginTop: 10,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.textMuted,
  },
  dotOn: { backgroundColor: colors.text, width: 16 },
});
