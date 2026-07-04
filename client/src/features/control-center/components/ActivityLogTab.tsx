import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { queryKeys } from "../query-keys";
import { fetchImportActivity } from "../api";
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
  const [view, setView] = useState<"audit" | "import">("import");
  const [page, setPage] = useState(1);

  const auditQuery = useQuery({
    queryKey: queryKeys.auditLogs(page),
    queryFn: () => fetchAuditLogs(page),
    enabled: active && view === "audit",
  });

  const importQuery = useQuery({
    queryKey: [...queryKeys.all, "import-activity", page],
    queryFn: () => fetchImportActivity(page),
    enabled: active && view === "import",
    refetchInterval: active && view === "import" ? 10_000 : false,
  });

  if (!active) return null;

  const data = view === "audit" ? auditQuery.data : importQuery.data;
  const isLoading = view === "audit" ? auditQuery.isLoading : importQuery.isLoading;
  const error = view === "audit" ? auditQuery.error : importQuery.error;
  const refetch = view === "audit" ? auditQuery.refetch : importQuery.refetch;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={view === "import" ? "default" : "outline"}
          onClick={() => {
            setView("import");
            setPage(1);
          }}
        >
          Aktarım işleri
        </Button>
        <Button
          size="sm"
          variant={view === "audit" ? "default" : "outline"}
          onClick={() => {
            setView("audit");
            setPage(1);
          }}
        >
          Onay / denetim
        </Button>
        <Button size="sm" variant="ghost" onClick={() => refetch()}>
          Yenile
        </Button>
      </div>

      {isLoading && <p className="text-muted-foreground">Yükleniyor…</p>}
      {error && <p className="text-destructive">{(error as Error).message}</p>}

      <div className="space-y-2">
        {view === "import" &&
          importQuery.data?.items.map((row) => (
            <Card key={`${row.id}-${row.createdAt}`}>
              <CardContent className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <div>
                  <span className="font-medium">{row.id.slice(0, 8)}…</span>
                  <Badge variant="outline" className="ml-2">
                    {row.status}
                  </Badge>
                  {row.message && (
                    <span className="text-muted-foreground ml-2">{row.message}</span>
                  )}
                </div>
                <div className="text-muted-foreground">
                  {new Date(row.createdAt).toLocaleString("tr-TR")}
                </div>
              </CardContent>
            </Card>
          ))}

        {view === "audit" &&
          auditQuery.data?.items.map((row) => (
            <Card key={row.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <div>
                  <span className="font-medium">{row.action}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    — {row.entityType} #{row.entityId}
                  </span>
                  {!row.success && (
                    <Badge variant="destructive" className="ml-2">
                      başarısız
                    </Badge>
                  )}
                </div>
                <div className="text-muted-foreground">
                  {row.actor ?? "system"} · {new Date(row.createdAt).toLocaleString("tr-TR")}
                </div>
              </CardContent>
            </Card>
          ))}

        {!isLoading && (data?.items.length ?? 0) === 0 && (
          <p className="text-muted-foreground text-sm">Kayıt bulunamadı.</p>
        )}
      </div>

      {data && data.totalPages > 1 && (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Önceki
          </Button>
          <span className="self-center text-sm text-muted-foreground">
            Sayfa {page} / {data.totalPages}
          </span>
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
