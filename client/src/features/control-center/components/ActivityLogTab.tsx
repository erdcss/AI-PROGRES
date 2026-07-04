import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { queryKeys } from "../query-keys";
import { useState } from "react";

type AuditRow = {
  id: number;
  actor: string | null;
  action: string;
  entityType: string;
  entityId: string;
  success: boolean;
  createdAt: string;
};

async function fetchAuditLogs(page: number) {
  const res = await fetch(`/api/control-center/audit-logs?page=${page}&pageSize=30`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Audit log yüklenemedi");
  return res.json() as Promise<{
    items: AuditRow[];
    page: number;
    totalPages: number;
  }>;
}

export function ActivityLogTab({ active }: { active: boolean }) {
  const [page, setPage] = useState(1);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.auditLogs(page),
    queryFn: () => fetchAuditLogs(page),
    enabled: active,
  });

  return (
    <div className="space-y-4">
      <Button size="sm" variant="outline" onClick={() => refetch()}>
        Yenile
      </Button>
      {isLoading && <p className="text-muted-foreground">Yükleniyor…</p>}
      {error && <p className="text-destructive">{(error as Error).message}</p>}
      <div className="space-y-2">
        {data?.items.map((row) => (
          <Card key={row.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <div>
                <span className="font-medium">{row.action}</span>
                <span className="text-muted-foreground">
                  {" "}
                  — {row.entityType} #{row.entityId}
                </span>
              </div>
              <div className="text-muted-foreground">
                {row.actor ?? "system"} · {new Date(row.createdAt).toLocaleString("tr-TR")}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {data && data.totalPages > 1 && (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Önceki
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= data.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Sonraki
          </Button>
        </div>
      )}
    </div>
  );
}
