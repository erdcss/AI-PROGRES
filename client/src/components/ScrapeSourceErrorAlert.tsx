import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  ShieldAlert,
  Timer,
} from "lucide-react";
import { formatStageErrorsForUser } from "@shared/scrape-runtime";

export type ScrapeErrorMeta = {
  reason?: string;
  userMessage?: string;
  stageErrors?: string[];
  stageErrorsHuman?: string;
  finalSuccessReason?: string;
  /** Kalan cooldown (ms) — ilk anlık değer */
  blockCooldownMs?: number;
  /** Circuit bitiş epoch ms */
  blockEndsAt?: number;
  blockKind?: string;
};

type Props = {
  message: string;
  details?: string;
  meta?: ScrapeErrorMeta;
  onRetry?: () => void;
  /** Ban kalkınca (canlı polling) */
  onBanCleared?: (info: { waitedMs: number; lastKind?: string }) => void;
};

const DEFAULT_TITLE = "Ürün verisi alınamadı";
const DEFAULT_MESSAGE =
  "Kaynak siteye erişim sağlanamadı veya ürün verisi doğrulanamadı. Program alternatif erişim yollarını denedi ancak geçerli fiyat, görsel veya başlık bulunamadı.";

const STAGE_ERROR_LABELS: Record<string, string> = {
  "local-agent-failed": "Yerel agent erişilemedi (DNS veya tunnel süresi dolmuş olabilir)",
  "browser-worker-unhealthy": "Tarayıcı Worker sağlıksız veya yapılandırılmamış",
  "browser-worker-not-configured": "Tarayıcı Worker yapılandırılmamış",
  "browser-worker-blocked": "Tarayıcı Worker engellendi (WAF/IP)",
  "api-null-response": "Trendyol API boş yanıt döndü",
  "image-proxy-timeout": "Görsel proxy zaman aşımı (ürün verisi etkilenmeyebilir)",
  "image-fallback-timeout": "Görsel yedek indirme zaman aşımı",
  "puppeteer-disabled-in-cloud": "Cloud ortamında Puppeteer kapalı — Browser Worker gerekli",
  "unknown-scenario-error": "Bilinmeyen senaryo hatası",
  "chromium-not-found": "Chromium bulunamadı",
  "chromium-launch-failed": "Chromium başlatılamadı",
  "navigation-timeout": "Sayfa yükleme zaman aşımı",
  "trendyol-blocked": "Trendyol erişimi engellendi",
  "trendyol-circuit-open": "Trendyol ban koruması aktif — bekleyin",
  "upstream-556": "Trendyol upstream 556 engeli",
  "page-empty": "Sayfa boş veya veri yok",
};

function isBanMeta(meta?: ScrapeErrorMeta): boolean {
  const stages = meta?.stageErrors ?? [];
  const reason = meta?.reason || "";
  return (
    stages.some((e) =>
      ["trendyol-blocked", "trendyol-circuit-open", "upstream-556", "browser-worker-blocked"].includes(
        e,
      ),
    ) ||
    reason.includes("trendyol-circuit") ||
    reason.includes("trendyol-blocked") ||
    reason.includes("upstream-556")
  );
}

function buildDetailLines(meta?: ScrapeErrorMeta) {
  const stages = meta?.stageErrors ?? [];
  const lines: string[] = stages.map((e) => STAGE_ERROR_LABELS[e] || e);

  if (lines.length === 0) {
    if (stages.some((e) => e.includes("api"))) lines.push("Trendyol API başarısız");
    if (stages.some((e) => e.includes("direct-html") || e.includes("html-parse"))) {
      lines.push("Sayfa HTML alınamadı");
    }
    if (stages.some((e) => e.includes("image"))) lines.push("Görseller indirilemedi");
    if (stages.some((e) => e.includes("local-agent") || e.includes("browser-worker"))) {
      lines.push("Tarayıcı tabanlı erişim başarısız");
    }
  }

  if (meta?.stageErrorsHuman) {
    lines.push(meta.stageErrorsHuman);
  } else if (stages.length > 0) {
    lines.push(formatStageErrorsForUser(stages as any));
  }

  return lines.length > 0 ? [...new Set(lines)] : ["Kaynak veri doğrulanamadı"];
}

function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

type BlockStatusPayload = {
  open?: boolean;
  remainingMs?: number;
  openUntil?: number | null;
  lastKind?: string | null;
  cooldownMs?: number;
  message?: string | null;
};

async function fetchBlockStatus(): Promise<BlockStatusPayload | null> {
  try {
    const res = await fetch("/api/trendyol/block-status", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as BlockStatusPayload;
  } catch {
    return null;
  }
}

function notifyBrowserBanCleared() {
  try {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "granted") {
      new Notification("Trendyol ban kalktı", {
        body: "Erişim yeniden açıldı — ürün çekimine devam edebilirsiniz.",
        tag: "trendyol-ban-cleared",
      });
    } else if (Notification.permission === "default") {
      void Notification.requestPermission().then((p) => {
        if (p === "granted") {
          new Notification("Trendyol ban kalktı", {
            body: "Erişim yeniden açıldı — ürün çekimine devam edebilirsiniz.",
            tag: "trendyol-ban-cleared",
          });
        }
      });
    }
  } catch {
    /* ignore */
  }
}

export function ScrapeSourceErrorAlert({
  message,
  details,
  meta,
  onRetry,
  onBanCleared,
}: Props) {
  const [open, setOpen] = useState(false);
  const ban = isBanMeta(meta);
  const detailLines = buildDetailLines(meta);
  const displayMessage = message?.trim() || meta?.userMessage?.trim() || DEFAULT_MESSAGE;

  const initialEndsAt =
    typeof meta?.blockEndsAt === "number" && meta.blockEndsAt > Date.now()
      ? meta.blockEndsAt
      : typeof meta?.blockCooldownMs === "number" && meta.blockCooldownMs > 0
        ? Date.now() + meta.blockCooldownMs
        : null;

  const [endsAt, setEndsAt] = useState<number | null>(initialEndsAt);
  const [remainingMs, setRemainingMs] = useState(() =>
    initialEndsAt ? Math.max(0, initialEndsAt - Date.now()) : meta?.blockCooldownMs ?? 0,
  );
  const [serverOpen, setServerOpen] = useState(ban);
  const [cleared, setCleared] = useState(false);
  const [totalCooldownMs, setTotalCooldownMs] = useState(
    () => meta?.blockCooldownMs || (initialEndsAt ? Math.max(1, initialEndsAt - Date.now()) : 600_000),
  );
  const clearedRef = useRef(false);
  const startedAtRef = useRef(Date.now());
  const onBanClearedRef = useRef(onBanCleared);
  onBanClearedRef.current = onBanCleared;

  // Meta değişince (yeni ban) sayacı sıfırla
  useEffect(() => {
    if (!ban) return;
    clearedRef.current = false;
    setCleared(false);
    setServerOpen(true);
    startedAtRef.current = Date.now();
    const nextEnds =
      typeof meta?.blockEndsAt === "number" && meta.blockEndsAt > Date.now()
        ? meta.blockEndsAt
        : typeof meta?.blockCooldownMs === "number" && meta.blockCooldownMs > 0
          ? Date.now() + meta.blockCooldownMs
          : null;
    setEndsAt(nextEnds);
    const rem = nextEnds
      ? Math.max(0, nextEnds - Date.now())
      : meta?.blockCooldownMs ?? 0;
    setRemainingMs(rem);
    setTotalCooldownMs(Math.max(rem, meta?.blockCooldownMs || 600_000));
  }, [ban, meta?.blockEndsAt, meta?.blockCooldownMs, meta?.blockKind, meta?.reason]);

  const markCleared = useCallback((lastKind?: string) => {
    if (clearedRef.current) return;
    clearedRef.current = true;
    setCleared(true);
    setServerOpen(false);
    setRemainingMs(0);
    notifyBrowserBanCleared();
    onBanClearedRef.current?.({
      waitedMs: Date.now() - startedAtRef.current,
      lastKind,
    });
  }, []);

  // Canlı tick (her saniye)
  useEffect(() => {
    if (!ban || cleared) return;
    const tick = () => {
      if (endsAt) {
        const rem = Math.max(0, endsAt - Date.now());
        setRemainingMs(rem);
        if (rem <= 0) {
          // Yerel süre bitti — sunucuyu doğrula (aşağıdaki poll de yakalar)
          void fetchBlockStatus().then((s) => {
            if (!s || s.open === false) markCleared(s?.lastKind || meta?.blockKind);
            else if (typeof s.openUntil === "number" && s.openUntil > Date.now()) {
              setEndsAt(s.openUntil);
              setRemainingMs(Math.max(0, s.openUntil - Date.now()));
              if (typeof s.cooldownMs === "number" && s.cooldownMs > 0) {
                setTotalCooldownMs(s.cooldownMs);
              }
            } else if (typeof s.remainingMs === "number" && s.remainingMs > 0) {
              const next = Date.now() + s.remainingMs;
              setEndsAt(next);
              setRemainingMs(s.remainingMs);
            }
          });
        }
      }
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [ban, cleared, endsAt, markCleared, meta?.blockKind]);

  // Sunucu polling (canlı doğrulama)
  useEffect(() => {
    if (!ban || cleared) return;
    let cancelled = false;

    const sync = async () => {
      const s = await fetchBlockStatus();
      if (cancelled || !s) return;
      if (s.open === false) {
        markCleared(s.lastKind || meta?.blockKind);
        return;
      }
      setServerOpen(true);
      if (typeof s.openUntil === "number" && s.openUntil > Date.now()) {
        setEndsAt(s.openUntil);
        setRemainingMs(Math.max(0, s.openUntil - Date.now()));
      } else if (typeof s.remainingMs === "number") {
        setEndsAt(Date.now() + s.remainingMs);
        setRemainingMs(Math.max(0, s.remainingMs));
      }
      if (typeof s.cooldownMs === "number" && s.cooldownMs > 0) {
        setTotalCooldownMs((prev) => Math.max(prev, s.cooldownMs!));
      }
    };

    void sync();
    const id = window.setInterval(sync, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [ban, cleared, markCleared, meta?.blockKind]);

  const progress =
    totalCooldownMs > 0
      ? Math.min(100, Math.max(0, ((totalCooldownMs - remainingMs) / totalCooldownMs) * 100))
      : 0;

  if (ban && cleared) {
    return (
      <Card className="border-emerald-500/50 bg-emerald-950/25">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2 text-emerald-300">
            <CheckCircle2 className="w-5 h-5" />
            Trendyol erişimi yeniden açıldı
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-zinc-200">
            Ban koruması süresi doldu. Ürün çekimine güvenle devam edebilirsiniz.
          </p>
          <div className="flex flex-wrap gap-2">
            {onRetry && (
              <Button type="button" size="sm" variant="secondary" onClick={onRetry}>
                <RefreshCw className="w-3.5 h-3.5 mr-1" />
                Şimdi tekrar dene
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={
        ban
          ? "border-amber-500/50 bg-amber-950/25"
          : "border-red-500/40 bg-red-950/20"
      }
    >
      <CardHeader className="pb-2">
        <CardTitle
          className={`text-lg flex items-center gap-2 ${ban ? "text-amber-300" : "text-red-400"}`}
        >
          {ban ? <ShieldAlert className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
          {ban ? "Trendyol erişimi engellendi" : DEFAULT_TITLE}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-zinc-200">{displayMessage}</p>
        {ban && (
          <div className="space-y-2 rounded-md border border-amber-800/40 bg-amber-950/30 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-amber-100">
                <Timer className="w-4 h-4 animate-pulse" />
                <span className="text-xs uppercase tracking-wide text-amber-200/80">
                  Canlı bekleme
                </span>
              </div>
              <span
                className="font-mono text-2xl tabular-nums text-amber-100"
                data-testid="ban-countdown"
              >
                {formatCountdown(remainingMs)}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-amber-950/80">
              <div
                className="h-full rounded-full bg-amber-400 transition-[width] duration-300 ease-linear"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-amber-200/90">
              {serverOpen
                ? `Ban koruması aktif — kalan süre canlı güncelleniyor.${
                    meta?.blockKind ? ` Sebep: ${meta.blockKind}.` : ""
                  } Hemen tekrar denemek engeli uzatabilir.`
                : "Sunucu durumu doğrulanıyor…"}
            </p>
          </div>
        )}
        {details && details !== displayMessage && (
          <p className="text-xs text-zinc-500 break-all">{details}</p>
        )}
        <div className="flex flex-wrap gap-2">
          {!ban && onRetry && (
            <Button type="button" size="sm" variant="secondary" onClick={onRetry}>
              <RefreshCw className="w-3.5 h-3.5 mr-1" />
              Tekrar dene
            </Button>
          )}
          {ban && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-amber-700 text-amber-200"
              disabled
            >
              <Timer className="w-3.5 h-3.5 mr-1" />
              Bekleniyor {formatCountdown(remainingMs)}
            </Button>
          )}
          <Button type="button" size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
            {open ? <ChevronUp className="w-3.5 h-3.5 mr-1" /> : <ChevronDown className="w-3.5 h-3.5 mr-1" />}
            Detay
          </Button>
        </div>
        {open && (
          <ul className="text-xs text-zinc-400 list-disc pl-4 space-y-1">
            {detailLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
