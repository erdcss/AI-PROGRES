import React, { useEffect, useRef, useState } from "react";
import { Animated, Image, StyleSheet, View } from "react-native";

export function BootSplash({ onDone }: { onDone: () => void }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.88)).current;
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 520,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 7,
        tension: 60,
        useNativeDriver: true,
      }),
    ]).start();

    const hold = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 380,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setVisible(false);
          onDone();
        }
      });
    }, 1100);

    return () => clearTimeout(hold);
  }, [onDone, opacity, scale]);

  if (!visible) return null;

  return (
    <View style={styles.root} pointerEvents="none">
      <Animated.View style={{ opacity, transform: [{ scale }] }}>
        <Image source={require("../../assets/splash.png")} style={styles.logo} resizeMode="contain" />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  logo: { width: 260, height: 80 },
});
