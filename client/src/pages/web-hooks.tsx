import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Activity,
  Globe2,
  Link2,
  Radio,
  Smartphone,
  Store,
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

type SchemaPayload = {
  updatedAt: string;
  pipeline: Array<{ id: string; label: string; status: string }>;
  counts: {
    sites: number;
    pending: number;
    transferredToday: number;
    productPoolSites: number;
    trendyolSites: number;
  };
  sites: SchemaSite[];
  notes: string[];
};

export default function WebHooksPage() {
  const [, setLocation] = useLocation();
  const q = useQuery({
    queryKey: ["/api/web-hooks/schema"],
    queryFn: async () => {
      const res = await fetch("/api/web-hooks/schema", { cache: "no-store" });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Şema alınamadı");
      return data.schema as SchemaPayload;
    },
    refetchInterval: 8_000,
  });

  const schema = q.data;
  const pulse = useMemo(() => Date.now(), [schema?.updatedAt]);

  useEffect(() => {
    void pulse;
  }, [pulse]);

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
            Canlı izleme
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Web sitesi kancaları</h1>
          <p className="max-w-2xl text-sm text-zinc-400">
            Desteklenen sitelerden çekilen, henüz Shopify’a aktarılmamış ürünlerin yönetim ve
            izleme şeması. Ürün kartları bu sayfada gösterilmez — mobil uygulamadaki{" "}
            <span className="text-zinc-200">Webo</span> sekmesinde listelenir.
          </p>
        </header>

        {q.isError ? (
          <div className="rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-sm text-red-200">
            {(q.error as Error)?.message || "Şema yüklenemedi"}
          </div>
        ) : (
          <>
            <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Siteler", value: schema?.counts.sites ?? "—", icon: Globe2 },
                { label: "Bekleyen (mobil)", value: schema?.counts.pending ?? "—", icon: Smartphone },
                {
                  label: "Bugün aktarılan",
                  value: schema?.counts.transferredToday ?? "—",
                  icon: Store,
                },
                {
                  label: "Son güncelleme",
                  value: schema?.updatedAt
                    ? new Date(schema.updatedAt).toLocaleTimeString("tr-TR", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })
                    : "—",
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

            <section className="mb-8 rounded-2xl border border-zinc-800 bg-[#070707] p-5 sm:p-6">
              <h2 className="mb-1 text-sm font-semibold uppercase tracking-[0.18em] text-zinc-300">
                Canlı sistem şeması
              </h2>
              <p className="mb-5 text-xs text-zinc-500">
                Site → çekim → Shopify filtresi → mobil Webo → aktarım
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-2">
                {(schema?.pipeline || []).map((step, i) => (
                  <div key={step.id} className="flex flex-1 items-center gap-2">
                    <motion.div
                      className="w-full rounded-xl border border-zinc-800 bg-black px-3 py-4 text-center"
                      animate={{ opacity: [0.7, 1, 0.7] }}
                      transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.2 }}
                    >
                      <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                        {i + 1}. adım
                      </div>
                      <div className="mt-1 text-sm font-medium text-zinc-100">{step.label}</div>
                      <div className="mt-2 text-[10px] text-emerald-400">AKTİF</div>
                    </motion.div>
                    {i < (schema?.pipeline.length || 0) - 1 ? (
                      <div className="hidden text-zinc-700 sm:block">→</div>
                    ) : null}
                  </div>
                ))}
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
                  <h3 className="text-sm font-semibold text-zinc-200">Trendyol sayfası</h3>
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
          </>
        )}
      </div>
    </div>
  );
}
