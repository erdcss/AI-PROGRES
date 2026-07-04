import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  useApproveImportJob,
  useCancelImportJob,
  useCreateImportJob,
  useImportJobs,
  useRetryImportJob,
} from "../hooks";
import { fetchImportJobDetail } from "../api";
import type { ImportJobRow } from "../types";

const BLOCKER_LABELS: Record<string, string> = {
  title_url_slug_only: "Başlık yalnızca URL slug kaynaklı",
  synthetic_stock_quantity: "Doğrulanmamış stok miktarı",
  suspected_synthetic_variant_matrix: "Şüpheli sentetik varyant matrisi",
  manual_approval_required: "Manuel onay gerekli",
  quality_blocked: "Kalite engeli",
  no_verified_image: "Doğrulanmış görsel yok",
};

const STATUS_OPTIONS = [
  { value: "", label: "Tümü" },
  { value: "queued", label: "Kuyruk" },
  { value: "awaiting_approval", label: "Onay bekliyor" },
  { value: "failed", label: "Başarısız" },
  { value: "completed", label: "Tamamlandı" },
];

function canApprove(job: ImportJobRow): boolean {
  const q = job.qualityResult as { status?: string; blockers?: string[] } | null;
  if (!q || q.status === "blocked") return false;
  if ((q.blockers || []).some((b) => b.includes("synthetic") || b.includes("url_slug"))) return false;
  return job.status === "awaiting_approval";
}

function canCancel(job: ImportJobRow): boolean {
  return ["queued", "awaiting_approval", "failed"].includes(job.status);
}

function canRetry(job: ImportJobRow): boolean {
  return job.status === "failed";
}

function JobRow({
  job,
  onApprove,
  onCancel,
  onRetry,
  onSelect,
  busy,
}: {
  job: ImportJobRow;
  onApprove: (id: string) => void;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onSelect: (id: string) => void;
  busy: boolean;
}) {
  const quality = job.qualityResult as { status?: string } | null;

  return (
    <tr className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => onSelect(job.jobId)}>
      <td className="p-2 text-xs font-mono">{job.jobId.slice(0, 8)}…</td>
      <td className="p-2 max-w-[220px] truncate text-sm" title={job.sourceUrl}>
        {job.sourceUrl}
      </td>
      <td className="p-2">
        <Badge variant="outline">{job.status}</Badge>
      </td>
      <td className="p-2 text-sm">{job.progressPercentage}%</td>
      <td className="p-2 text-sm">
        {job.qualityScore ?? "—"}
        {quality?.status && (
          <Badge variant="outline" className="ml-1 text-xs">
            {quality.status}
          </Badge>
        )}
      </td>
      <td className="p-2" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap gap-1">
          {canApprove(job) && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onApprove(job.jobId)}>
              Onayla
            </Button>
          )}
          {job.status === "awaiting_approval" && !canApprove(job) && (
            <span className="text-xs text-muted-foreground self-center">Engelli</span>
          )}
          {canRetry(job) && (
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => onRetry(job.jobId)}>
              Tekrar
            </Button>
          )}
          {canCancel(job) && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => onCancel(job.jobId)}>
              İptal
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

function JobDetail({ jobId }: { jobId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["import-job-detail", jobId],
    queryFn: () => fetchImportJobDetail(jobId),
  });

  if (isLoading) return <p className="text-muted-foreground text-sm">Detay yükleniyor…</p>;
  if (error) return <p className="text-destructive text-sm">{(error as Error).message}</p>;
  if (!data) return null;

  const job = data.job;
  const canonical = job.canonicalProduct as Record<string, unknown> | null;
  const quality = job.qualityResult as {
    score?: number;
    status?: string;
    blockers?: string[];
    warnings?: string[];
    provenance?: {
      title?: { source?: string };
      variants?: { confirmedCount?: number; inferredCount?: number };
      images?: { uniqueCount?: number; rawCount?: number };
      stock?: { exactCount?: number; availabilityOnlyCount?: number };
    };
  } | null;
  const diagnostics = (canonical?.diagnostics || {}) as Record<string, unknown>;

  return (
    <div className="rounded-md border p-4 space-y-4 text-sm">
      <h3 className="font-semibold">İş Detayı: {jobId}</h3>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        <div>Durum: {job.status}</div>
        <div>Kalite: {quality?.score ?? "—"} ({quality?.status})</div>
        <div>Başlık kaynağı: {quality?.provenance?.title?.source ?? diagnostics.titleSource ?? "—"}</div>
        <div>
          Varyant: {quality?.provenance?.variants?.confirmedCount ?? 0} doğrulanmış /{" "}
          {quality?.provenance?.variants?.inferredCount ?? 0} çıkarımsal
        </div>
        <div>
          Görsel: {quality?.provenance?.images?.uniqueCount ?? 0} tekil /{" "}
          {quality?.provenance?.images?.rawCount ?? 0} ham
        </div>
        <div>
          Stok: {quality?.provenance?.stock?.exactCount ?? 0} kesin /{" "}
          {quality?.provenance?.stock?.availabilityOnlyCount ?? 0} yalnızca müsaitlik
        </div>
      </div>
      {(quality?.blockers?.length ?? 0) > 0 && (
        <div>
          <p className="font-medium text-destructive">Engeller:</p>
          <ul className="list-disc pl-5">
            {quality!.blockers!.map((b) => (
              <li key={b}>{BLOCKER_LABELS[b] || b}</li>
            ))}
          </ul>
        </div>
      )}
      {(quality?.warnings?.length ?? 0) > 0 && (
        <div>
          <p className="font-medium">Uyarılar:</p>
          <ul className="list-disc pl-5 text-muted-foreground">
            {quality!.warnings!.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      {data.events.length > 0 && (
        <div>
          <p className="font-medium mb-2">Olay geçmişi</p>
          <div className="max-h-48 overflow-y-auto space-y-1 rounded border p-2 text-xs">
            {data.events.map((e, i) => (
              <div key={`${e.createdAt}-${i}`} className="flex gap-2">
                <span className="text-muted-foreground whitespace-nowrap">
                  {new Date(e.createdAt).toLocaleString("tr-TR")}
                </span>
                <span className="font-medium">{e.stage}</span>
                <span>{e.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ImportJobsTab({ active }: { active: boolean }) {
  const [url, setUrl] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const { data, isLoading } = useImportJobs(1, statusFilter || undefined, active);
  const createJob = useCreateImportJob();
  const approveJob = useApproveImportJob();
  const cancelJob = useCancelImportJob();
  const retryJob = useRetryImportJob();
  const busy = createJob.isPending || approveJob.isPending || cancelJob.isPending || retryJob.isPending;

  if (!active) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder="Trendyol ürün URL'si"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <Button
          disabled={!url || busy}
          onClick={() => createJob.mutate(url, { onSuccess: () => setUrl("") })}
        >
          İçe Aktarma Başlat
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((opt) => (
          <Button
            key={opt.value || "all"}
            size="sm"
            variant={statusFilter === opt.value ? "default" : "outline"}
            onClick={() => setStatusFilter(opt.value)}
          >
            {opt.label}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">İşler yükleniyor...</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b bg-muted/50 text-sm">
                <th className="p-2">Job ID</th>
                <th className="p-2">URL</th>
                <th className="p-2">Durum</th>
                <th className="p-2">İlerleme</th>
                <th className="p-2">Kalite</th>
                <th className="p-2">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((job) => (
                <JobRow
                  key={job.jobId}
                  job={job}
                  busy={busy}
                  onApprove={(id) => approveJob.mutate(id)}
                  onCancel={(id) => cancelJob.mutate(id)}
                  onRetry={(id) => retryJob.mutate(id)}
                  onSelect={setSelectedJob}
                />
              ))}
            </tbody>
          </table>
          {(data?.items.length ?? 0) === 0 && (
            <p className="p-4 text-center text-muted-foreground text-sm">Bu filtrede iş yok.</p>
          )}
        </div>
      )}

      {selectedJob && <JobDetail jobId={selectedJob} />}
    </div>
  );
}
