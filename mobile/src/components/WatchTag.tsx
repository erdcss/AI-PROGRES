import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import type { WatchTag } from "../lib/watch-tag";
import { WATCH_TAG_INTERVAL_MINUTES, watchTagLabel } from "../lib/watch-tag";
import { colors } from "../theme/colors";

export function WatchTagBadge({ tag }: { tag?: string | null }) {
  if (tag !== "red" && tag !== "green") return null;
  const on = tag === "red";
  return (
    <View style={[styles.badge, on ? styles.badgeRed : styles.badgeGreen]}>
      <Text style={[styles.badgeText, on ? styles.textRed : styles.textGreen]}>
        {watchTagLabel(tag)}
      </Text>
    </View>
  );
}

export function WatchTagPicker({
  value,
  onChange,
  disabled,
}: {
  value?: string | null;
  onChange: (tag: WatchTag | null) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.picker}>
      <Text style={styles.pickerTitle}>Sıkı takip</Text>
      <Text style={styles.pickerHint}>
        Kırmızı {WATCH_TAG_INTERVAL_MINUTES.red} dk · tüm bildirimler. Yeşil{" "}
        {WATCH_TAG_INTERVAL_MINUTES.green} dk · önemli bildirimler anında.
      </Text>
      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.btn, value === "red" && styles.btnRedOn]}
          onPress={() => onChange(value === "red" ? null : "red")}
          disabled={disabled}
          activeOpacity={0.75}
        >
          <Text style={[styles.btnText, value === "red" && styles.textRed]}>Kırmızı</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, value === "green" && styles.btnGreenOn]}
          onPress={() => onChange(value === "green" ? null : "green")}
          disabled={disabled}
          activeOpacity={0.75}
        >
          <Text style={[styles.btnText, value === "green" && styles.textGreen]}>Yeşil</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
  },
  badgeRed: { backgroundColor: "rgba(239,68,68,0.12)", borderColor: colors.negative },
  badgeGreen: { backgroundColor: "rgba(34,197,94,0.12)", borderColor: colors.positive },
  badgeText: { fontSize: 10, fontWeight: "700" },
  textRed: { color: colors.negative },
  textGreen: { color: colors.positive },
  picker: {
    marginTop: 0,
    backgroundColor: "transparent",
    borderRadius: 0,
    borderWidth: 0,
    padding: 0,
  },
  pickerTitle: { color: colors.text, fontWeight: "700", fontSize: 14 },
  pickerHint: { color: colors.textMuted, fontSize: 12, marginTop: 6, lineHeight: 16 },
  row: { flexDirection: "row", gap: 8, marginTop: 12 },
  btn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#2A2A2A",
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#0B0B0B",
  },
  btnRedOn: { borderColor: colors.negative },
  btnGreenOn: { borderColor: colors.positive },
  btnText: { color: colors.textSecondary, fontWeight: "700", fontSize: 14 },
});
