import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

type StartupNotification = {
  id: string;
  level: string;
  title: string;
  body: string;
};

type StartupAuditPayload = {
  success: boolean;
  running: boolean;
  last: {
    running: boolean;
    success: boolean;
    message: string;
    notifications?: StartupNotification[];
    completedAt: string | null;
    deleted?: number;
    verifyPassed?: boolean;
  } | null;
};

function toastVariant(level: string): "default" | "destructive" {
  return level === "error" ? "destructive" : "default";
}

/** Açılış Shopify/takip denetimi sonuçlarını uygulama içi toast olarak gösterir */
export function TrackingStartupNotifier() {
  const { toast } = useToast();
  const lastCompletedRef = useRef<string | null>(null);
  const runningToastShownRef = useRef(false);

  const { data } = useQuery<StartupAuditPayload>({
    queryKey: ["tracking-startup-audit"],
    queryFn: async () => {
      const res = await fetch("/api/tracking/startup-audit");
      if (!res.ok) throw new Error("startup-audit alınamadı");
      return res.json();
    },
    refetchInterval: (query) => {
      const d = query.state.data;
      if (d?.running || d?.last?.running) return 2500;
      if (!d?.last?.completedAt) return 4000;
      return 60_000;
    },
    staleTime: 1000,
  });

  useEffect(() => {
    if (!data) return;

    if ((data.running || data.last?.running) && !runningToastShownRef.current) {
      runningToastShownRef.current = true;
      toast({
        title: "Açılış denetimi başladı",
        description: "Takip sistemi ve Shopify ürün kontrolü çalışıyor.",
      });
    }

    const completedAt = data.last?.completedAt ?? null;
    if (!completedAt || completedAt === lastCompletedRef.current) return;
    lastCompletedRef.current = completedAt;

    const notifications = data.last?.notifications ?? [];
    if (notifications.length === 0) {
      toast({
        title: data.last?.success ? "Açılış denetimi tamamlandı" : "Açılış denetimi uyarı",
        description: data.last?.message ?? "Sonuç alındı.",
        variant: data.last?.success ? "default" : "destructive",
      });
      return;
    }

    for (const n of notifications) {
      // Başlangıç bilgisini zaten gösterdiysek tekrar etme
      if (n.id === "startup-begin" && runningToastShownRef.current) continue;
      toast({
        title: n.title,
        description: n.body,
        variant: toastVariant(n.level),
      });
    }
  }, [data, toast]);

  return null;
}
