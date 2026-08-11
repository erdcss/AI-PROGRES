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

    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
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
        .subscribe((status, err) => {
          if (err || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.warn("[realtime] subscribe", channelName, status, err);
          }
        });
    } catch (err) {
      console.warn("[realtime] init failed", channelName, err);
      return;
    }

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
      if (channel) {
        void supabase!.removeChannel(channel).catch((err) => {
          console.warn("[realtime] removeChannel", channelName, err);
        });
      }
    };
  }, [channelName, table, event, qc, JSON.stringify(invalidateKeys)]);
}

export function useRealtimeTracking() {
  useRealtimeTable(
    "rt-tracking-changes",
    "mobile_tracking_changes",
    [["changes-actionable"], ["changes-all"], ["notifications"], ["notifications-badge"], ["dashboard"]],
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
    [["scraped-products"], ["tracked-products"], ["memory-products"], ["dashboard"]],
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
