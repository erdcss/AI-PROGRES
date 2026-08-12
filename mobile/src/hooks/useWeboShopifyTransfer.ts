import { useCallback, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { transferWeboProductToShopify } from "../api/webo";
import { useInAppBanner } from "../components/InAppBanner";

type ConfirmState = {
  id: number;
  title: string;
} | null;

export function useWeboShopifyTransfer() {
  const qc = useQueryClient();
  const router = useRouter();
  const { showBanner } = useInAppBanner();
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const transfer = useMutation({
    mutationFn: transferWeboProductToShopify,
  });

  const removeFromWeboCache = useCallback(
    (id: number) => {
      qc.setQueryData(
        ["webo-products"],
        (old: { products?: Array<{ id: number }>; total?: number } | undefined) => {
          if (!old?.products) return old;
          const products = old.products.filter((p) => p.id !== id);
          return { ...old, products, total: products.length };
        },
      );
      qc.removeQueries({ queryKey: ["webo-product", id] });
    },
    [qc],
  );

  const afterTransferSuccess = useCallback(
    (id: number, title: string) => {
      removeFromWeboCache(id);
      void qc.invalidateQueries({ queryKey: ["memory-products"] });
      void qc.invalidateQueries({ queryKey: ["memory-products", "all"] });
      void qc.invalidateQueries({ queryKey: ["scraped-products", "all"] });
      void qc.invalidateQueries({ queryKey: ["tracked-products"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["webo-products"] });

      showBanner("Shopify aktarımı", title, "shopify");
      router.replace("/(tabs)/products");
    },
    [qc, removeFromWeboCache, router, showBanner],
  );

  const requestTransfer = useCallback((id: number, title?: string) => {
    setConfirm({ id, title: title || "Bu ürün" });
  }, []);

  const cancelTransfer = useCallback(() => {
    if (!transfer.isPending) setConfirm(null);
  }, [transfer.isPending]);

  const confirmTransfer = useCallback(async () => {
    if (!confirm) return;
    const { id, title } = confirm;
    setBusyId(id);
    try {
      await transfer.mutateAsync(id);
      setConfirm(null);
      afterTransferSuccess(id, title);
    } catch (err) {
      showBanner(
        "Aktarım başarısız",
        err instanceof Error ? err.message : "Shopify yükleme hatası",
        "error",
      );
    } finally {
      setBusyId(null);
    }
  }, [confirm, transfer, afterTransferSuccess, showBanner]);

  return {
    requestTransfer,
    cancelTransfer,
    confirmTransfer,
    confirmVisible: confirm != null,
    confirmTitle: confirm?.title ?? "",
    busyId,
    transferring: transfer.isPending,
  };
}
