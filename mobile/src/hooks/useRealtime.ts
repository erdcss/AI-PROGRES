import { useEffect } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { supabase, isMobileSupabaseConfigured } from "../lib/supabase";

function useRealtimeTable(
  channelName: string,
  table: string,
  invalidateKeys: string[][],
  event: "INSERT" | "UPDATE" | "*" = "*",
) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!isMobileSupabaseConfigured() || !supabase) return;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event, schema: "public", table },
        () => {
          for (const key of invalidateKeys) {
            void qc.invalidateQueries({ queryKey: key });
          }
        },
      )
      .subscribe();

    const onAppState = (state: AppStateStatus) => {
      if (state === "active") {
        for (const key of invalidateKeys) {
          void qc.invalidateQueries({ queryKey: key });
        }
      }
    };
    const sub = AppState.addEventListener("change", onAppState);

    return () => {
      sub.remove();
      void supabase!.removeChannel(channel);
    };
  }, [channelName, table, event, qc, JSON.stringify(invalidateKeys)]);
}

export function useRealtimeTracking() {
  useRealtimeTable(
    "rt-tracking-changes",
    "mobile_tracking_changes",
    [["changes-actionable"], ["notifications"], ["notifications-badge"], ["dashboard"]],
    "INSERT",
  );
}

export function useRealtimeNotifications() {
  useRealtimeTable(
    "rt-notifications",
    "mobile_notifications",
    [["notifications"], ["notifications-badge"]],
    "INSERT",
  );
}

export function useRealtimeProducts() {
  useRealtimeTable(
    "rt-products",
    "mobile_products",
    [["scraped-products"], ["tracked-products"], ["dashboard"]],
    "UPDATE",
  );
}

export function useRealtimeDashboard() {
  useRealtimeTable(
    "rt-dashboard",
    "mobile_dashboard_stats",
    [["dashboard"]],
    "UPDATE",
  );
}

export function useAllMobileRealtime() {
  useRealtimeTracking();
  useRealtimeNotifications();
  useRealtimeProducts();
  useRealtimeDashboard();
}
