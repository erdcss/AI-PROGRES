import { useQuery } from "@tanstack/react-query";

export type DestinationBrand = {
  shopifyEnabled: boolean;
  destinationName: string;
  sendLabel: string;
  sendLoadingLabel: string;
  transferLabel: string;
  transferLoadingLabel: string;
  bulkLabel: string;
};

const DEFAULT_BRAND: DestinationBrand = {
  shopifyEnabled: true,
  destinationName: "Shopify",
  sendLabel: "Shopify'a Gönder",
  sendLoadingLabel: "Shopify'a gidiyor…",
  transferLabel: "Shopify'a Aktar",
  transferLoadingLabel: "Shopify'a aktarılıyor…",
  bulkLabel: "Tüm ürünleri Shopify'a yükle",
};

export function useDestinationBrand(): DestinationBrand {
  const q = useQuery({
    queryKey: ["connection-access"],
    queryFn: async () => {
      const res = await fetch("/api/connection-access", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Bağlantılar alınamadı");
      return data as { brand?: DestinationBrand };
    },
    staleTime: 10_000,
    refetchInterval: 30_000,
  });

  return { ...DEFAULT_BRAND, ...(q.data?.brand || {}) };
}

export function hasShopifyLabel(text: string | null | undefined): boolean {
  return /shopify/i.test(String(text || ""));
}
