import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Activity,
  Globe2,
  Link2,
  Play,
  Pause,
  Radio,
  RefreshCw,
  Smartphone,
  Store,
  Filter,
} from "lucide-react";

type SchemaSite = {
  id: string;
  name: string;
  domain: string;
  url: string;
  logoUrl: string;
  source: "product-pool" | "trendyol";
  pendingCount: number;
  status: string;
};

type SchemaEvent = {
  id: number;
  level: string;
  siteId?: string | null;
  siteName?: string | null;
  message: string;
  createdAt: string;
};

type DiscoveryStatus = {
  enabled: boolean;
  running: boolean;
  intervalMs: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastError: string | null;
  lastSummary: {
    sitesScanned: number;
    found: number;
    ingested: number;
    skippedShopify: number;
    errors: number;
  } | null;
};

type SchemaPayload = {
  updatedAt: string;
  pipeline: Array<{ id: string; label: string; status: string }>;
  counts: {
    sites: number;
    pending: number;
    transferredToday: number;
    alreadyOnShopify?: number;
    productPoolSites: number;
    trendyolSites: number;
  };
  discovery?: DiscoveryStatus | null;
  events?: SchemaEvent[];
  sites: SchemaSite[];
  notes: string[];
};

function fmtTime(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "—";
  }
}

export default function WebHooksPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const q = useQuery({
    queryKey: ["/api/web-hooks/schema"],
    queryFn: async () => {
      const res = await fetch("/api/web-hooks/schema", { cache: "no-store" });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Şema alınamadı");
      return data.schema as SchemaPayload;
    },
    refetchInterval: 5_000,
  });

  const schema = q.data;
  const discovery = schema?.discovery;
  const pulse = useMemo(() => Date.now(), [schema?.updatedAt]);

  const runDiscovery = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/web-hooks/discovery/run", { method: "POST" });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Keşif başarısız");
      return data;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["/api/web-hooks/schema"] });
    },
  });

  const toggleDiscovery = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await fetch("/api/web-hooks/discovery/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Durum güncellenemedi");
      return data;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["/api/web-hooks/schema"] });
    },
  });

  const purgeShopify = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/web-hooks/purge-shopify", { method: "POST" });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Temizlik başarısız");
      return data as { marked: number };
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["/api/web-hooks/schema"] });
    },
  });

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <button
          type="button"
          onClick={() => setLocation("/")}
          className="mb-6 inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Sistem Analizi
        </button>

        <header className="mb-8 space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-zinc-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            Canlı izleme · {fmtTime(schema?.updatedAt)} · pulse {String(pulse).slice(-4)}
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Web sitesi kancaları</h1>
          <p className="max-w-2xl text-sm text-zinc-400">
            Desteklenen siteleri ara ara tarayan keşif sisteminin yönetim paneli. Shopify’da olan
            ürünler elenir; yalnızca yeni adaylar mobil <span className="text-zinc-200">Webo</span>{" "}
            sekmesine düşer. Bu sayfada ürün kartı yoktur.
          </p>
        </header>

        {q.isError ? (
          <div className="rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-sm text-red-200">
            {(q.error as Error)?.message || "Şema yüklenemedi"}
          </div>
        ) : (
          <>
            <section className="mb-6 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={runDiscovery.isPending || discovery?.running}
                onClick={() => runDiscovery.mutate()}
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 hover:border-zinc-500 disabled:opacity-50"
              >
                <Play className="h-3.5 w-3.5" />
                Şimdi tara
              </button>
              <button
                type="button"
                disabled={toggleDiscovery.isPending}
                onClick={() => toggleDiscovery.mutate(!(discovery?.enabled !== false))}
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 hover:border-zinc-500 disabled:opacity-50"
              >
                {discovery?.enabled === false ? (
                  <>
                    <Play className="h-3.5 w-3.5" /> Keşfi aç
                  </>
                ) : (
                  <>
                    <Pause className="h-3.5 w-3.5" /> Keşfi durdur
                  </>
                )}
              </button>
              <button
                type="button"
                disabled={purgeShopify.isPending || busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await purgeShopify.mutateAsync();
                  } finally {
                    setBusy(false);
                  }
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 hover:border-zinc-500 disabled:opacity-50"
              >
                <Filter className="h-3.5 w-3.5" />
                Shopify eşleşenleri temizle
                {purgeShopify.data?.marked != null ? ` (${purgeShopify.data.marked})` : ""}
              </button>
              <button
                type="button"
                onClick={() => q.refetch()}
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-400 hover:text-white"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Yenile
              </button>
              <div className="ml-auto text-xs text-zinc-500">
                Son tur: {fmtTime(discovery?.lastRunAt)} · Sonraki: {fmtTime(discovery?.nextRunAt)}
                {discovery?.running ? " · çalışıyor…" : ""}
              </div>
            </section>

            <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Siteler", value: schema?.counts.sites ?? "—", icon: Globe2 },
                {
                  label: "Mobil bekleyen",
                  value: schema?.counts.pending ?? "—",
                  icon: Smartphone,
                },
                {
                  label: "Bugün aktarılan",
                  value: schema?.counts.transferredToday ?? "—",
                  icon: Store,
                },
                {
                  label: "Son tur yeni",
                  value: discovery?.lastSummary?.ingested ?? "—",
                  icon: Activity,
                },
              ].map((card) => (
                <div
                  key={card.label}
                  className="rounded-xl border border-zinc-800 bg-[#0a0a0a] p-4"
                >
                  <div className="mb-3 flex items-center justify-between text-zinc-500">
                    <card.icon className="h-4 w-4" />
                    <Radio className="h-3.5 w-3.5 text-emerald-500/80" />
                  </div>
                  <div className="text-2xl font-semibold tabular-nums text-white">{card.value}</div>
                  <div className="mt-1 text-[11px] uppercase tracking-wide text-zinc-500">
                    {card.label}
                  </div>
                </div>
              ))}
            </section>

            {discovery?.lastSummary ? (
              <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Taranan site", value: discovery.lastSummary.sitesScanned },
                  { label: "Bulunan aday", value: discovery.lastSummary.found },
                  { label: "Shopify elenen", value: discovery.lastSummary.skippedShopify },
                  { label: "Hata", value: discovery.lastSummary.errors },
                ].map((c) => (
                  <div
                    key={c.label}
                    className="rounded-lg border border-zinc-900 bg-black px-3 py-3 text-center"
                  >
                    <div className="text-lg font-semibold tabular-nums">{c.value}</div>
                    <div className="text-[10px] uppercase tracking-wide text-zinc-500">{c.label}</div>
                  </div>
                ))}
              </section>
            ) : null}

            <section className="mb-8 rounded-2xl border border-zinc-800 bg-[#070707] p-5 sm:p-6">
              <h2 className="mb-1 text-sm font-semibold uppercase tracking-[0.18em] text-zinc-300">
                Canlı sistem şeması
              </h2>
              <p className="mb-5 text-xs text-zinc-500">
                Site tarama → keşif → Shopify filtresi → mobil Webo → aktarım
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-2">
                {(schema?.pipeline || []).map((step, i) => {
                  const active = step.status === "running";
                  const paused = step.status === "paused";
                  return (
                    <div key={step.id} className="flex flex-1 items-center gap-2">
                      <motion.div
                        className={`w-full rounded-xl border px-3 py-4 text-center ${
                          active
                            ? "border-emerald-700/60 bg-emerald-950/20"
                            : paused
                              ? "border-zinc-800 bg-zinc-950/40 opacity-60"
                              : "border-zinc-800 bg-black"
                        }`}
                        animate={active ? { opacity: [0.65, 1, 0.65] } : { opacity: [0.75, 1, 0.75] }}
                        transition={{ duration: active ? 1.2 : 2.4, repeat: Infinity, delay: i * 0.15 }}
                      >
                        <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                          {i + 1}. adım
                        </div>
                        <div className="mt-1 text-sm font-medium text-zinc-100">{step.label}</div>
                        <div
                          className={`mt-2 text-[10px] ${
                            active
                              ? "text-emerald-300"
                              : paused
                                ? "text-amber-400"
                                : "text-emerald-400"
                          }`}
                        >
                          {active ? "ÇALIŞIYOR" : paused ? "DURAKLATILDI" : "AKTİF"}
                        </div>
                      </motion.div>
                      {i < (schema?.pipeline.length || 0) - 1 ? (
                        <div className="hidden text-zinc-700 sm:block">→</div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="mb-8 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-zinc-800 bg-[#070707] p-5">
                <div className="mb-4 flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-zinc-400" />
                  <h3 className="text-sm font-semibold text-zinc-200">Ürün havuzu siteleri</h3>
                </div>
                <ul className="space-y-2">
                  {(schema?.sites || [])
                    .filter((s) => s.source === "product-pool")
                    .map((s) => (
                      <li
                        key={s.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-zinc-900 bg-black px-3 py-2.5"
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <img
                            src={s.logoUrl}
                            alt=""
                            className="h-6 w-6 rounded bg-white object-contain p-0.5"
                          />
                          <div className="min-w-0">
                            <div className="truncate text-sm text-zinc-100">{s.name}</div>
                            <div className="truncate text-[11px] text-zinc-500">{s.domain}</div>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-xs tabular-nums text-zinc-300">{s.pendingCount}</div>
                          <div className="text-[10px] text-emerald-500">izleniyor</div>
                        </div>
                      </li>
                    ))}
                </ul>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-[#070707] p-5">
                <div className="mb-4 flex items-center gap-2">
                  <Store className="h-4 w-4 text-zinc-400" />
                  <h3 className="text-sm font-semibold text-zinc-200">Trendyol</h3>
                </div>
                <ul className="space-y-2">
                  {(schema?.sites || [])
                    .filter((s) => s.source === "trendyol")
                    .map((s) => (
                      <li
                        key={s.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-zinc-900 bg-black px-3 py-2.5"
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <img
                            src={s.logoUrl}
                            alt=""
                            className="h-6 w-6 rounded bg-white object-contain p-0.5"
                          />
                          <div className="min-w-0">
                            <div className="truncate text-sm text-zinc-100">{s.name}</div>
                            <div className="truncate text-[11px] text-zinc-500">{s.domain}</div>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-xs tabular-nums text-zinc-300">{s.pendingCount}</div>
                          <div className="text-[10px] text-emerald-500">izleniyor</div>
                        </div>
                      </li>
                    ))}
                </ul>
                <p className="mt-4 text-xs leading-relaxed text-zinc-500">
                  {(schema?.notes || []).join(" ")}
                </p>
              </div>
            </section>

            <section className="rounded-2xl border border-zinc-800 bg-[#070707] p-5">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-zinc-300">
                Canlı işlem günlüğü
              </h3>
              <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {(schema?.events || []).length === 0 ? (
                  <li className="text-sm text-zinc-500">Henüz olay yok — keşif turu bekleniyor.</li>
                ) : (
                  (schema?.events || []).map((ev) => (
                    <li
                      key={ev.id}
                      className="flex items-start justify-between gap-3 rounded-lg border border-zinc-900 bg-black px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <div className="text-sm text-zinc-100">
                          {ev.siteName ? (
                            <span className="mr-2 text-zinc-400">[{ev.siteName}]</span>
                          ) : null}
                          {ev.message}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div
                          className={`text-[10px] uppercase ${
                            ev.level === "error"
                              ? "text-red-400"
                              : ev.level === "warn"
                                ? "text-amber-400"
                                : ev.level === "ok"
                                  ? "text-emerald-400"
                                  : "text-zinc-500"
                          }`}
                        >
                          {ev.level}
                        </div>
                        <div className="text-[10px] text-zinc-600">{fmtTime(ev.createdAt)}</div>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
