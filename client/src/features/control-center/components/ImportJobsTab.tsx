import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useApproveImportJob, useCreateImportJob, useImportJobs } from "../hooks";
import type { ImportJobRow } from "../types";

const BLOCKER_LABELS: Record<string, string> = {
  title_url_slug_only: "Başlık yalnızca URL slug kaynaklı",
  synthetic_stock_quantity: "Doğrulanmamış stok miktarı",
  suspected_synthetic_variant_matrix: "Şüpheli sentetik varyant matrisi",
  manual_approval_required: "Manuel onay gerekli",
  quality_blocked: "Kalite engeli",
  no_verified_image: "Doğrulanmış görsel yok",
};

function canApprove(job: ImportJobRow): boolean {
  const q = job.qualityResult as { status?: string; blockers?: string[] } | null;
  if (!q || q.status === "blocked") return false;
  if ((q.blockers || []).some((b) => b.includes("synthetic") || b.includes("url_slug"))) return false;
  return job.status === "awaiting_approval";
}

function JobRow({
  job,
  onApprove,
  onSelect,
}: {
  job: ImportJobRow;
  onApprove: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const quality = job.qualityResult as {
    score?: number;
    status?: string;
    blockers?: string[];
    provenance?: { title?: { source?: string } };
  } | null;

  return (
    <tr className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => onSelect(job.jobId)}>
      <td className="p-2 text-xs font-mono">{job.jobId}</td>
      <td className="p-2 max-w-[200px] truncate text-sm">{job.sourceUrl}</td>
      <td className="p-2 text-sm">{job.status}</td>
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
        {canApprove(job) ? (
          <Button size="sm" variant="outline" onClick={() => onApprove(job.jobId)}>
            Onayla
          </Button>
        ) : job.status === "awaiting_approval" ? (
          <span className="text-xs text-muted-foreground">Engelli</span>
        ) : null}
      </td>
    </tr>
  );
}

function JobDetail({ jobId }: { jobId: string }) {
  const { data } = useImportJobs(1, undefined, true);
  const job = data?.items.find((j) => j.jobId === jobId);
  if (!job) return null;

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
    <div className="rounded-md border p-4 space-y-3 text-sm">
      <h3 className="font-semibold">İş Detayı: {jobId}</h3>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        <div>Kalite: {quality?.score ?? "—"} ({quality?.status})</div>
        <div>Başlık kaynağı: {quality?.provenance?.title?.source ?? diagnostics.titleSource ?? "—"}</div>
        <div>Varyant: {quality?.provenance?.variants?.confirmedCount ?? 0} doğrulanmış / {quality?.provenance?.variants?.inferredCount ?? 0} çıkarımsal</div>
        <div>Görsel: {quality?.provenance?.images?.uniqueCount ?? 0} tekil / {quality?.provenance?.images?.rawCount ?? 0} ham</div>
        <div>Stok: {quality?.provenance?.stock?.exactCount ?? 0} kesin / {quality?.provenance?.stock?.availabilityOnlyCount ?? 0} yalnızca müsaitlik</div>
        <div>Pipeline: {String(diagnostics.pipelineDurationMs ?? "—")} ms</div>
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
    </div>
  );
}

export function ImportJobsTab({ active }: { active: boolean }) {
  const [url, setUrl] = useState("");
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const { data, isLoading } = useImportJobs(1, undefined, active);
  const createJob = useCreateImportJob();
  const approveJob = useApproveImportJob();

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder="Trendyol ürün URL'si"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <Button
          disabled={!url || createJob.isPending}
          onClick={() => createJob.mutate(url, { onSuccess: () => setUrl("") })}
        >
          İçe Aktarma Başlat
        </Button>
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
                  onApprove={(id) => approveJob.mutate(id)}
                  onSelect={setSelectedJob}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedJob && <JobDetail jobId={selectedJob} />}
    </div>
  );
}
