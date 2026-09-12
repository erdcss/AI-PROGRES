import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { useLocation } from "wouter";
import type { AccountUser } from "@/lib/account-auth";

type Job = {
  id: string;
  source_url: string;
  status: "queued" | "processing" | "completed" | "failed";
  attempts: number;
  max_attempts: number;
  result?: any;
  error?: string | null;
  created_at: string;
};

type Summary = {
  workspace: { id: string; name: string } | null;
  jobs: { queued: number; processing: number; completed: number; failed: number };
  worker: { started: boolean; active: number; concurrency: number };
};

async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message || `İstek başarısız (${response.status})`);
  return payload;
}

const statusText: Record<Job["status"], string> = {
  queued: "Bekliyor",
  processing: "İşleniyor",
  completed: "Tamamlandı",
  failed: "Başarısız",
};

export function TenantWorkspace({ user }: { user: AccountUser }) {
  const [, setLocation] = useLocation();
  const [url, setUrl] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [jobsPayload, summaryPayload] = await Promise.all([
        api("/api/workspace/jobs?limit=50"),
        api("/api/workspace/summary"),
      ]);
      setJobs(jobsPayload.jobs || []);
      setSummary(summaryPayload);
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Veriler alınamadı");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const busy = useMemo(
    () => jobs.some((job) => job.status === "queued" || job.status === "processing"),
    [jobs],
  );

  const submit = async () => {
    const clean = url.trim();
    if (!clean) return;
    setSubmitting(true);
    setMessage(null);
    try {
      await api("/api/workspace/scrape", { method: "POST", body: JSON.stringify({ url: clean }) });
      setUrl("");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Görev oluşturulamadı");
    } finally {
      setSubmitting(false);
    }
  };

  const retry = async (id: string) => {
    await api(`/api/workspace/jobs/${id}/retry`, { method: "POST", body: "{}" });
    await refresh();
  };

  const remove = async (id: string) => {
    await api(`/api/workspace/jobs/${id}`, { method: "DELETE" });
    await refresh();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/95 px-4 py-4 md:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div>
            <div className="text-lg font-semibold">Trendyol Ürün Çıkarma</div>
            <div className="text-xs text-slate-400">{summary?.workspace?.name || user.email}</div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setLocation("/")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Ana Sayfa
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-8">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card><CardHeader className="pb-2"><CardDescription>Bekleyen</CardDescription><CardTitle>{summary?.jobs.queued ?? 0}</CardTitle></CardHeader></Card>
          <Card><CardHeader className="pb-2"><CardDescription>İşlenen</CardDescription><CardTitle>{summary?.jobs.processing ?? 0}</CardTitle></CardHeader></Card>
          <Card><CardHeader className="pb-2"><CardDescription>Tamamlanan</CardDescription><CardTitle>{summary?.jobs.completed ?? 0}</CardTitle></CardHeader></Card>
          <Card><CardHeader className="pb-2"><CardDescription>Başarısız</CardDescription><CardTitle>{summary?.jobs.failed ?? 0}</CardTitle></CardHeader></Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Trendyol ürününü çek</CardTitle>
            <CardDescription>Ürün adresini ekleyin. İşlem arka plandaki kontrollü kuyruğa alınır ve yalnızca çalışma alanınızda görünür.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3 md:flex-row">
              <Input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://www.trendyol.com/...-p-123456"
                onKeyDown={(event) => { if (event.key === "Enter") void submit(); }}
              />
              <Button onClick={() => void submit()} disabled={submitting || !url.trim()}>
                <Plus className="mr-2 h-4 w-4" /> {submitting ? "Ekleniyor" : "Kuyruğa Ekle"}
              </Button>
              <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Yenile
              </Button>
            </div>
            {message ? <div className="mt-3 text-sm text-red-400">{message}</div> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div><CardTitle>Aktarım görevleri</CardTitle><CardDescription>{busy ? "Kuyruk çalışıyor" : "Kuyruk güncel"}</CardDescription></div>
              {summary?.worker ? <Badge variant="outline">Worker {summary.worker.active}/{summary.worker.concurrency}</Badge> : null}
            </div>
          </CardHeader>
          <CardContent>
            {jobs.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-700 px-4 py-10 text-center text-sm text-slate-400">Henüz ürün çekme görevi yok.</div>
            ) : (
              <div className="space-y-3">
                {jobs.map((job) => (
                  <div key={job.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                    <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <Badge variant={job.status === "failed" ? "destructive" : "outline"}>{statusText[job.status]}</Badge>
                          <span className="text-xs text-slate-500">Deneme {job.attempts}/{job.max_attempts}</span>
                        </div>
                        <div className="truncate text-sm text-slate-200" title={job.source_url}>{job.source_url}</div>
                        {job.error ? <div className="mt-2 text-xs text-red-400">{job.error}</div> : null}
                        {job.status === "completed" && job.result ? (
                          <div className="mt-3 grid gap-1 text-sm text-slate-300 md:grid-cols-3">
                            <div><span className="text-slate-500">Ürün:</span> {job.result.title || "—"}</div>
                            <div><span className="text-slate-500">Marka:</span> {job.result.brand || "—"}</div>
                            <div><span className="text-slate-500">Fiyat:</span> {job.result.price?.current || job.result.price || "—"}</div>
                          </div>
                        ) : null}
                      </div>
                      <div className="flex gap-2">
                        {job.status === "failed" ? <Button size="sm" variant="outline" onClick={() => void retry(job.id)}><RotateCcw className="mr-2 h-4 w-4" /> Tekrar</Button> : null}
                        {(job.status === "failed" || job.status === "completed") ? <Button size="sm" variant="ghost" onClick={() => void remove(job.id)}><Trash2 className="h-4 w-4" /></Button> : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
