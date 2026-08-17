import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, KeyRound, Pause, Play, Plus, ChevronDown, ChevronUp, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type EnvStatus = { name: string; configured: boolean; masked: string | null };

type ExtraKey = {
  id: string;
  envName: string;
  label: string;
  masked: string | null;
  createdAt: string;
};

type ConnectionRow = {
  id: string;
  name: string;
  group: string;
  description: string;
  enabled: boolean;
  configured: boolean;
  schema: {
    protocol: string;
    baseUrl: string;
    auth: string;
    envVars: string[];
    endpoints: string[];
  };
  envStatus: EnvStatus[];
  extraKeys: ExtraKey[];
};

async function readJson(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "İstek başarısız");
  return data;
}

export default function BaglantiApiPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [form, setForm] = useState({
    connectionId: "browser-worker",
    connectionName: "",
    value: "",
    label: "",
  });

  const listQ = useQuery({
    queryKey: ["connection-access"],
    queryFn: async () => {
      const res = await fetch("/api/connection-access", { cache: "no-store" });
      const data = await readJson(res);
      return data as { connections?: ConnectionRow[] };
    },
  });

  const connections = (listQ.data?.connections || []).filter((c) => c.id !== "shopify");
  const nameSeeded = useRef(false);
  useEffect(() => {
    if (nameSeeded.current || !connections.length) return;
    nameSeeded.current = true;
    setForm((f) => {
      if (f.connectionId === "custom" || f.connectionName) return f;
      const match = connections.find((c) => c.id === f.connectionId);
      return match ? { ...f, connectionName: match.name } : f;
    });
  }, [connections]);

  const toggleMut = useMutation({
    mutationFn: async ({ id, enable }: { id: string; enable: boolean }) => {
      const res = await fetch(`/api/connection-access/${id}/${enable ? "start" : "stop"}`, {
        method: "POST",
      });
      return readJson(res);
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["connection-access"] });
      toast({
        title: vars.enable ? "Bağlantı açıldı" : "Bağlantı durduruldu",
        description: vars.enable
          ? "Ortam değişkenleri yeniden uygulandı"
          : "Bu bağlantının anahtarları süreçten kaldırıldı",
      });
    },
    onError: (err: Error) => {
      toast({ title: "İşlem başarısız", description: err.message, variant: "destructive" });
    },
  });

  const addKeyMut = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/connection-access/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId: form.connectionId,
          connectionName: form.connectionName,
          value: form.value,
          label: form.label,
        }),
      });
      return readJson(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connection-access"] });
      setForm((f) => ({ ...f, value: "", label: "" }));
      toast({ title: "API anahtarı eklendi" });
    },
    onError: (err: Error) => {
      toast({ title: "Anahtar eklenemedi", description: err.message, variant: "destructive" });
    },
  });

  const renameMut = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const res = await fetch(`/api/connection-access/${id}/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      return readJson(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connection-access"] });
      toast({ title: "Bağlantı adı güncellendi" });
    },
    onError: (err: Error) => {
      toast({ title: "Ad değiştirilemedi", description: err.message, variant: "destructive" });
    },
  });

  const toggleOpen = (id: string, currentlyOpen: boolean, name: string) => {
    const next = currentlyOpen ? null : id;
    setOpenId(next);
    if (next) setRenameDraft(name);
  };

  return (
    <div className="home-orvian relative min-h-screen overflow-x-hidden bg-black">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 70% 40% at 50% 0%, rgba(255,255,255,0.03), transparent 55%), linear-gradient(180deg, #050505 0%, #000 40%, #000 100%)",
        }}
      />

      <div className="relative z-10 mx-auto max-w-5xl px-4 pb-16 pt-8 sm:px-6">
        <button
          type="button"
          onClick={() => setLocation("/")}
          className="mb-6 inline-flex items-center gap-2 text-[12px] uppercase tracking-[0.18em] text-zinc-500 transition-colors hover:text-zinc-200"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.25} />
          Ana sayfa
        </button>

        <motion.header
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950">
            <KeyRound className="h-5 w-5 text-zinc-300" strokeWidth={1.25} />
          </div>
          <h1 className="home-title text-2xl tracking-[0.18em]">Bağlantı API Erişimi</h1>
          <p className="home-muted mt-2 text-[13px] leading-relaxed">
            Tüm dış bağlantılar, şemalar ve anahtar durumları. Durdur, bağlantının ortam
            değişkenlerini süreçten kaldırır. Tam gizli değerler gösterilmez.
          </p>
        </motion.header>

        {listQ.isLoading && <p className="home-muted text-sm">Bağlantılar yükleniyor…</p>}
        {listQ.error && (
          <p className="text-sm text-red-400">{(listQ.error as Error).message}</p>
        )}

        <div className="space-y-2.5">
          {connections.map((c) => {
            const open = openId === c.id;
            return (
              <div
                key={c.id}
                className="rounded-xl border border-zinc-800/80 bg-[#070707] overflow-hidden"
              >
                <div className="flex items-center gap-3 px-3.5 py-3">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => toggleOpen(c.id, open, c.name)}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="home-title text-[14px]">{c.name}</span>
                      <span className="text-[10px] uppercase tracking-wider text-zinc-500">
                        {c.group}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${
                          !c.enabled
                            ? "border-red-900/60 text-red-300"
                            : c.configured
                              ? "border-zinc-700 text-zinc-200"
                              : "border-zinc-800 text-zinc-500"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            !c.enabled
                              ? "bg-red-400"
                              : c.configured
                                ? "bg-emerald-400"
                                : "bg-zinc-600"
                          }`}
                        />
                        {!c.enabled ? "Durduruldu" : c.configured ? "Aktif" : "Anahtar yok"}
                      </span>
                    </div>
                    <p className="home-muted mt-0.5 truncate text-[12px]">{c.description}</p>
                  </button>
                  <button
                    type="button"
                    disabled={toggleMut.isPending}
                    onClick={() => toggleMut.mutate({ id: c.id, enable: !c.enabled })}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] uppercase tracking-wider ${
                      c.enabled
                        ? "border-red-900/50 text-red-300 hover:bg-red-950/40"
                        : "border-emerald-900/50 text-emerald-300 hover:bg-emerald-950/30"
                    }`}
                  >
                    {c.enabled ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                    {c.enabled ? "Durdur" : "Başlat"}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleOpen(c.id, open, c.name)}
                    className="text-zinc-500"
                  >
                    {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                </div>

                {open && (
                  <div className="border-t border-zinc-900 px-3.5 py-3 space-y-3">
                    <form
                      className="flex flex-wrap items-end gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        renameMut.mutate({ id: c.id, name: renameDraft });
                      }}
                    >
                      <label className="block min-w-[200px] flex-1 text-[11px] text-zinc-400">
                        Bağlantı adı
                        <input
                          className="mt-1 w-full rounded-lg border border-zinc-800 bg-black px-2.5 py-2 text-[13px] text-zinc-200"
                          value={renameDraft}
                          onChange={(e) => setRenameDraft(e.target.value)}
                        />
                      </label>
                      <button
                        type="submit"
                        disabled={renameMut.isPending || renameDraft.trim().length < 2}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-2.5 py-2 text-[11px] uppercase tracking-wider text-zinc-200 hover:border-zinc-500 disabled:opacity-40"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Adı kaydet
                      </button>
                    </form>
                    <div className="grid gap-2 sm:grid-cols-2 text-[12px]">
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-zinc-500">Protokol</div>
                        <div className="home-title mt-0.5">{c.schema.protocol}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-zinc-500">Kimlik</div>
                        <div className="home-muted mt-0.5 break-all">{c.schema.auth}</div>
                      </div>
                      <div className="sm:col-span-2">
                        <div className="text-[10px] uppercase tracking-wider text-zinc-500">Şema / base URL</div>
                        <div className="home-muted mt-0.5 font-mono text-[11px] break-all">
                          {c.schema.baseUrl}
                        </div>
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                        Endpoint’ler
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {c.schema.endpoints.map((ep) => (
                          <span
                            key={ep}
                            className="rounded-md border border-zinc-800 bg-black px-2 py-0.5 font-mono text-[10px] text-zinc-300"
                          >
                            {ep}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                        Ortam değişkenleri
                      </div>
                      <div className="space-y-1">
                        {c.envStatus.map((e) => (
                          <div
                            key={e.name}
                            className="flex items-center justify-between gap-2 rounded-md border border-zinc-800/80 bg-black/60 px-2 py-1"
                          >
                            <span className="font-mono text-[11px] text-zinc-300">{e.name}</span>
                            <span className="text-[11px] text-zinc-500">
                              {e.configured ? e.masked : "tanımsız"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    {c.extraKeys.length > 0 && (
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                          Eklenen anahtarlar
                        </div>
                        {c.extraKeys.map((k) => (
                          <div key={k.id} className="home-muted text-[11px]">
                            {k.label} · {k.envName} · {k.masked}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-8 rounded-xl border border-zinc-800/80 bg-[#070707] p-4"
        >
          <h2 className="home-title mb-3 flex items-center gap-2 text-[13px] uppercase tracking-[0.2em]">
            <Plus className="h-4 w-4" />
            Yeni API anahtarı
          </h2>
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              addKeyMut.mutate();
            }}
          >
            <label className="block text-[11px] text-zinc-400">
              Bağlantı
              <select
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-black px-2.5 py-2 text-[13px] text-zinc-200"
                value={form.connectionId}
                onChange={(e) => {
                  const id = e.target.value;
                  const match = connections.find((c) => c.id === id);
                  setForm((f) => ({
                    ...f,
                    connectionId: id,
                    connectionName: id === "custom" ? "" : match?.name || f.connectionName,
                  }));
                }}
              >
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option value="custom">+ Yeni harici uygulama</option>
              </select>
            </label>
            <label className="block text-[11px] text-zinc-400">
              Bağlantı adı
              <input
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-black px-2.5 py-2 text-[13px] text-zinc-200"
                value={form.connectionName}
                onChange={(e) => setForm((f) => ({ ...f, connectionName: e.target.value }))}
                placeholder="ör. Mağazam, WooCommerce, özel API"
              />
            </label>
            <label className="block text-[11px] text-zinc-400 sm:col-span-2">
              Anahtar
              <input
                type="password"
                autoComplete="off"
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-black px-2.5 py-2 text-[13px] text-zinc-200"
                value={form.value}
                onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                placeholder="Yeni API anahtarı"
              />
            </label>
            <label className="block text-[11px] text-zinc-400">
              Etiket (isteğe bağlı)
              <input
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-black px-2.5 py-2 text-[13px] text-zinc-200"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="ör. canlı mağaza"
              />
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={addKeyMut.isPending || !form.connectionName || !form.value}
                className="w-full rounded-lg border border-zinc-600 bg-zinc-950 px-3 py-2 text-[12px] uppercase tracking-wider text-zinc-200 hover:border-zinc-400 disabled:opacity-40"
              >
                {addKeyMut.isPending ? "Ekleniyor…" : "Anahtarı kaydet"}
              </button>
            </div>
          </form>
        </motion.section>
      </div>
    </div>
  );
}
