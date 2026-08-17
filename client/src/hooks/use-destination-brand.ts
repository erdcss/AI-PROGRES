import { useQuery } from "@tanstack/react-query";

export type DestinationBrand = {
  shopifyEnabled: boolean;
  marktgoEnabled: boolean;
  destinationName: string;
  sendLabel: string;
  sendLoadingLabel: string;
  transferLabel: string;
  transferLoadingLabel: string;
  bulkLabel: string;
  provider: "marktgo" | "shopify";
};

const DEFAULT_BRAND: DestinationBrand = {
  shopifyEnabled: true,
  marktgoEnabled: false,
  destinationName: "MARKT-GO",
  sendLabel: "MARKT-GO'ya Gönder",
  sendLoadingLabel: "MARKT-GO'ya gidiyor…",
  transferLabel: "MARKT-GO'ya Aktar",
  transferLoadingLabel: "MARKT-GO'ya aktarılıyor…",
  bulkLabel: "Tüm ürünleri MARKT-GO'ya yükle",
  provider: "marktgo",
};

function labelsFor(name: string): Omit<DestinationBrand, "shopifyEnabled" | "marktgoEnabled" | "provider"> {
  const n = name.trim() || "MARKT-GO";
  return {
    destinationName: n,
    sendLabel: `${n}'a Gönder`,
    sendLoadingLabel: `${n}'a gidiyor…`,
    transferLabel: `${n}'a Aktar`,
    transferLoadingLabel: `${n}'a aktarılıyor…`,
    bulkLabel: `Tüm ürünleri ${n}'a yükle`,
  };
}

export function useDestinationBrand(): DestinationBrand {
  const accessQ = useQuery({
    queryKey: ["connection-access"],
    queryFn: async () => {
      const res = await fetch("/api/connection-access", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Bağlantılar alınamadı");
      return data as { brand?: Partial<DestinationBrand> };
    },
    staleTime: 10_000,
    refetchInterval: 30_000,
  });

  const connectionsQ = useQuery({
    queryKey: ["/api/marktgo/connections"],
    queryFn: async () => {
      const res = await fetch("/api/marktgo/connections", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) return { connections: [] as Array<{ name?: string; status?: string }> };
      return data as { connections?: Array<{ name?: string; status?: string; isActive?: boolean }> };
    },
    staleTime: 10_000,
    refetchInterval: 30_000,
  });

  const marktgoQ = useQuery({
    queryKey: ["/api/marktgo/health"],
    queryFn: async () => {
      const res = await fetch("/api/marktgo/health", { cache: "no-store" });
      return res.json() as Promise<{
        success?: boolean;
        connection?: { name?: string; status?: string };
        error?: string;
      }>;
    },
    staleTime: 10_000,
    refetchInterval: 30_000,
  });

  const saved =
    connectionsQ.data?.connections?.find((c) => c.isActive !== false) ??
    connectionsQ.data?.connections?.[0];
  const mg = marktgoQ.data?.connection ?? saved;
  const mgStatus = mg?.status || saved?.status || "";
  const marktgoEnabled = Boolean(
    mgStatus === "connected" ||
      mgStatus === "connected_limited" ||
      (marktgoQ.data?.success &&
        (mg?.status === "connected" || mg?.status === "connected_limited")),
  );
  const shopifyEnabled =
    accessQ.data?.brand?.shopifyEnabled !== false && !marktgoEnabled;

  if (marktgoEnabled) {
    const name = mg?.name || saved?.name || "MARKT-GO";
    return {
      shopifyEnabled,
      marktgoEnabled: true,
      provider: "marktgo",
      ...labelsFor(name),
    };
  }

  const fromAccess = accessQ.data?.brand || {};
  const name = String(fromAccess.destinationName || saved?.name || "MARKT-GO");
  return {
    ...DEFAULT_BRAND,
    ...fromAccess,
    shopifyEnabled,
    marktgoEnabled: false,
    provider: "marktgo",
    ...labelsFor(name),
  };
}

export function hasShopifyLabel(text: string | null | undefined): boolean {
  return /shopify/i.test(String(text || ""));
}
