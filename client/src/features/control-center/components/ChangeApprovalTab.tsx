import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { queryKeys } from "../query-keys";
import { TrackingChangeCard } from "@/features/tracking/TrackingChangeCard";

type TrackedChange = {
  id: number;
  trackedProductId: number;
  changeType: string;
  fieldName: string;
  oldValue: unknown;
  newValue: unknown;
  status: string;
  severity?: string;
  confidence: string;
  createdAt: string;
  productTitle: string | null;
  productUrl: string | null;
  shopifyProductId: string | null;
  trackingUid: string | null;
};

async function fetchChanges(status: string) {
  const res = await fetch(`/api/control-center/tracking/changes?status=${encodeURIComponent(status)}`, {
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Değişiklikler yüklenemedi");
  return (data.changes ?? []) as TrackedChange[];
}

export function ChangeApprovalTab({ active }: { active: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [filter, setFilter] = useState<string>("pending");
  const { data = [], isLoading, error, refetch } = useQuery({
    queryKey: [...queryKeys.changes(filter), "control-center"],
    queryFn: () => fetchChanges(filter),
    enabled: active,
    refetchInterval: active ? 15_000 : false,
  });

  const mutation = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: string }) => {
      const endpoint =
        action === "shopify-sync"
          ? `/api/tracking/changes/${id}/shopify-sync`
          : `/api/tracking/changes/${id}/${action}`;
      const res = await fetch(endpoint, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "İşlem başarısız");
      return body;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.changes(filter) });
      void qc.invalidateQueries({ queryKey: queryKeys.all });
    },
  });

  const bulkApproveMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const res = await fetch("/api/tracking/bulk/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Toplu onay başarısız");
      return body as { summary: { total: number; succeeded: number; failed: number } };
    },
    onSuccess: (result) => {
      const s = result.summary;
      toast({
        title: "Toplu onay tamam",
        description: `${s.succeeded}/${s.total} değişiklik onaylandı`,
        variant: s.failed > 0 ? "destructive" : "default",
      });
      void qc.invalidateQueries({ queryKey: queryKeys.changes(filter) });
      void qc.invalidateQueries({ queryKey: queryKeys.all });
    },
    onError: (e: Error) => {
      toast({ title: e.message, variant: "destructive" });
    },
  });

  const approvableIds = data
    .filter((c) => c.status === "pending" || c.status === "manual_review")
    .map((c) => c.id);

  const sections = [
    { key: "pending", label: "Onay bekleyen" },
    { key: "manual_review", label: "Manuel inceleme" },
    { key: "approved", label: "Onaylanmış" },
    { key: "failed", label: "Hatalı" },
  ];

  if (!active) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {sections.map((s) => (
          <Button
            key={s.key}
            variant={filter === s.key ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(s.key)}
          >
            {s.label}
          </Button>
        ))}
        <Button variant="ghost" size="sm" onClick={() => refetch()}>
          Yenile
        </Button>
        {approvableIds.length > 0 && (
          <Button
            size="sm"
            disabled={bulkApproveMutation.isPending}
            onClick={() => bulkApproveMutation.mutate(approvableIds)}
          >
            Toplu Onayla ({approvableIds.length})
          </Button>
        )}
      </div>

      {isLoading && <p className="text-muted-foreground text-sm">Yükleniyor…</p>}
      {error && <p className="text-destructive text-sm">{(error as Error).message}</p>}

      {!isLoading && data.length === 0 && (
        <p className="text-muted-foreground text-sm">Bu kategoride değişiklik yok.</p>
      )}

      <div className="grid gap-3">
        {data.map((c) => (
          <TrackingChangeCard
            key={c.id}
            change={c}
            busy={mutation.isPending || bulkApproveMutation.isPending}
            onApprove={
              c.status === "pending" || c.status === "manual_review"
                ? () => mutation.mutate({ id: c.id, action: "approve" })
                : undefined
            }
            onReject={
              c.status === "pending" || c.status === "manual_review"
                ? () => mutation.mutate({ id: c.id, action: "reject" })
                : undefined
            }
            onIgnore={() => mutation.mutate({ id: c.id, action: "ignore" })}
            onShopifySync={
              c.status !== "applied" && c.status !== "ignored" && c.status !== "rejected"
                ? () => mutation.mutate({ id: c.id, action: "shopify-sync" })
                : undefined
            }
            onApply={
              c.status === "approved" ? () => mutation.mutate({ id: c.id, action: "apply" }) : undefined
            }
            onRetry={c.status === "failed" ? () => mutation.mutate({ id: c.id, action: "retry" }) : undefined}
          />
        ))}
      </div>
    </div>
  );
}
