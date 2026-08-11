import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";

type Name = React.ComponentProps<typeof Ionicons>["name"];

export function TabBarIcon({
  name,
  focused,
}: {
  name: Name;
  focused: boolean;
}) {
  return (
    <Ionicons
      name={name}
      size={22}
      color={focused ? colors.text : colors.textMuted}
    />
  );
}
