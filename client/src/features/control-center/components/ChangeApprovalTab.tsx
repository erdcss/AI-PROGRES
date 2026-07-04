import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { queryKeys } from "../query-keys";

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
};

async function fetchChanges(status?: string) {
  const params = status ? `?status=${status}` : "";
  const res = await fetch(`/api/tracking/changes${params}`, { cache: "no-store" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Değişiklikler yüklenemedi");
  return (data.changes ?? []) as TrackedChange[];
}

export function ChangeApprovalTab({ active }: { active: boolean }) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string>("pending");
  const { data = [], isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.changes(filter),
    queryFn: () => fetchChanges(filter),
    enabled: active,
    refetchInterval: active ? 15000 : false,
  });

  const mutation = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: string }) => {
      const res = await fetch(`/api/tracking/changes/${id}/${action}`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "İşlem başarısız");
      return body;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.changes(filter) });
    },
  });

  const sections = [
    { key: "pending", label: "Onay Bekleyen" },
    { key: "manual_review", label: "Manuel İnceleme" },
    { key: "approved", label: "Onaylanmış" },
    { key: "failed", label: "Hatalı" },
  ];

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
      </div>

      {isLoading && <p className="text-muted-foreground">Yükleniyor…</p>}
      {error && <p className="text-destructive">{(error as Error).message}</p>}

      {!isLoading && data.length === 0 && (
        <p className="text-muted-foreground">Bu kategoride değişiklik yok.</p>
      )}

      <div className="grid gap-3">
        {data.map((c) => (
          <Card key={c.id}>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">
                  #{c.id} — {c.changeType} / {c.fieldName}
                </CardTitle>
                <Badge variant="outline">{c.status}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="grid gap-1 md:grid-cols-2">
                <div>
                  <span className="text-muted-foreground">Eski: </span>
                  <code>{JSON.stringify(c.oldValue)}</code>
                </div>
                <div>
                  <span className="text-muted-foreground">Yeni: </span>
                  <code>{JSON.stringify(c.newValue)}</code>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                {(c.status === "pending" || c.status === "manual_review") && (
                  <>
                    <Button
                      size="sm"
                      disabled={mutation.isPending}
                      onClick={() => mutation.mutate({ id: c.id, action: "approve" })}
                    >
                      Onayla
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={mutation.isPending}
                      onClick={() => mutation.mutate({ id: c.id, action: "reject" })}
                    >
                      Reddet
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={mutation.isPending}
                      onClick={() => mutation.mutate({ id: c.id, action: "ignore" })}
                    >
                      Yok say
                    </Button>
                  </>
                )}
                {c.status === "approved" && (
                  <Button
                    size="sm"
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate({ id: c.id, action: "apply" })}
                  >
                    Uygula
                  </Button>
                )}
                {c.status === "failed" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate({ id: c.id, action: "retry" })}
                  >
                    Tekrar dene
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
