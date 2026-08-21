import { useQuery } from "@tanstack/react-query";

export type DestinationBrand = {
  shopifyEnabled: boolean;
  marktgoEnabled: boolean;
  marktgoStatus: string | null;
  marktgoStatusLabel: string | null;
  marktgoMissingScopes: string[];
  destinationName: string;
  sendLabel: string;
  sendLoadingLabel: string;
  transferLabel: string;
  transferLoadingLabel: string;
  bulkLabel: string;
  provider: "marktgo";
};

const DESTINATION = "MARKT-GO";

const MARKTGO_BRAND: DestinationBrand = {
  shopifyEnabled: false,
  marktgoEnabled: false,
  marktgoStatus: null,
  marktgoStatusLabel: null,
  marktgoMissingScopes: [],
  destinationName: DESTINATION,
  sendLabel: `${DESTINATION}'ya Gönder`,
  sendLoadingLabel: `${DESTINATION}'ya gidiyor…`,
  transferLabel: `${DESTINATION}'ya Aktar`,
  transferLoadingLabel: `${DESTINATION}'ya aktarılıyor…`,
  bulkLabel: `Tüm ürünleri ${DESTINATION}'ya yükle`,
  provider: "marktgo",
};

export function useDestinationBrand(): DestinationBrand {
  const connectionsQ = useQuery({
    queryKey: ["/api/marktgo/connections"],
    queryFn: async () => {
      const res = await fetch("/api/marktgo/connections", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          connections: [] as Array<{
            name?: string;
            status?: string;
            statusLabel?: string;
            isActive?: boolean;
            scopes?: string[];
            missingScopes?: string[];
          }>,
        };
      }
      return data as {
        connections?: Array<{
          name?: string;
          status?: string;
          statusLabel?: string;
          isActive?: boolean;
          scopes?: string[];
          missingScopes?: string[];
        }>;
      };
    },
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 15_000,
    retry: 1,
  });

  const saved =
    connectionsQ.data?.connections?.find((c) => c.isActive !== false) ??
    connectionsQ.data?.connections?.[0];
  const rawName = String(saved?.name || "").trim();
  const destinationName =
    rawName && !/shopify/i.test(rawName) ? rawName : DESTINATION;
  const missingScopes = Array.isArray(saved?.missingScopes)
    ? saved!.missingScopes!.map(String)
    : [];
  const grantedScopes = Array.isArray(saved?.scopes)
    ? saved!.scopes!.map(String)
    : [];
  const hasWildcard = grantedScopes.some((s) => {
    const n = s.toLowerCase();
    return n === "*" || n === "*.*" || n === "all" || n === "full";
  });
  const effectiveMissing = hasWildcard ? [] : missingScopes;

  return {
    ...MARKTGO_BRAND,
    destinationName,
    sendLabel: `${destinationName}'ya Gönder`,
    sendLoadingLabel: `${destinationName}'ya gidiyor…`,
    transferLabel: `${destinationName}'ya Aktar`,
    transferLoadingLabel: `${destinationName}'ya aktarılıyor…`,
    bulkLabel: `Tüm ürünleri ${destinationName}'ya yükle`,
    shopifyEnabled: false,
    // UI yalnız bağlantı kaydının varlığını kontrol eder. Sağlık/yetki doğrulaması
    // gönderim anında backend tarafından yapılır; eski health cache'i butonu kilitlemez.
    marktgoEnabled: Boolean(saved) && saved?.status !== "error",
    marktgoStatus: saved?.status ? String(saved.status) : null,
    marktgoStatusLabel: hasWildcard
      ? "Bağlı"
      : saved?.statusLabel
        ? String(saved.statusLabel)
        : null,
    marktgoMissingScopes: effectiveMissing,
    provider: "marktgo",
  };
}

export function hasShopifyLabel(text: string | null | undefined): boolean {
  return /shopify/i.test(String(text || ""));
}
