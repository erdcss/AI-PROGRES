import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, GripVertical, ShoppingCart, Square } from "lucide-react";
import { Button } from "@/components/ui/button";

export type MarktGoUploadPhase =
  | "connecting"
  | "uploading"
  | "verifying"
  | "item_done"
  | "complete";

export type MarktGoUploadOutcome = {
  title: string;
  ok: boolean;
  mode?: string;
  productId?: string;
  adminUrl?: string;
  error?: string;
};

export type MarktGoUploadProgress = {
  index: number;
  total: number;
  successCount: number;
  failCount: number;
  title: string;
  phase: MarktGoUploadPhase;
  detail: string;
  percent: number;
  outcomes: MarktGoUploadOutcome[];
  stopped?: boolean;
};

const STEPS: Array<[MarktGoUploadPhase, string]> = [
  ["connecting", "Bağlantı"],
  ["uploading", "Aktarım"],
  ["verifying", "Doğrulama"],
  ["item_done", "Tamam"],
];

const PHASE_ORDER: MarktGoUploadPhase[] = [
  "connecting",
  "uploading",
  "verifying",
  "item_done",
  "complete",
];

function stripEmojiNoise(text: string): string {
  return text.replace(/^[✅❌⏹✓✗]+\s*/u, "").trim();
}

export function MarktGoUploadProgressBanner({
  progress,
  onStop,
  fixed = false,
  draggable = false,
}: {
  progress: MarktGoUploadProgress;
  onStop?: () => void;
  fixed?: boolean;
  /** fixed iken sürükle-bırak konum */
  draggable?: boolean;
}) {
  const isComplete = progress.phase === "complete";
  const isActive = !isComplete;
  const allSucceeded = isComplete && progress.failCount === 0 && !progress.stopped;
  const hasErrors = progress.failCount > 0;
  const wasStopped = Boolean(progress.stopped);
  const detailText = stripEmojiNoise(progress.detail || "");

  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!fixed || !draggable || pos) return;
    // Varsayılan: alt orta
    const w = typeof window !== "undefined" ? window.innerWidth : 800;
    setPos({ x: Math.max(12, (w - 720) / 2), y: Math.max(12, window.innerHeight - 200) });
  }, [fixed, draggable, pos]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!draggable || !pos) return;
      const target = e.target as HTMLElement;
      if (target.closest("button, a, input")) return;
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origX: pos.x,
        origY: pos.y,
      };
    },
    [draggable, pos],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const panel = panelRef.current;
    const pw = panel?.offsetWidth ?? 640;
    const ph = panel?.offsetHeight ?? 160;
    const maxX = Math.max(8, window.innerWidth - pw - 8);
    const maxY = Math.max(8, window.innerHeight - ph - 8);
    setPos({
      x: Math.min(maxX, Math.max(8, dragRef.current.origX + dx)),
      y: Math.min(maxY, Math.max(8, dragRef.current.origY + dy)),
    });
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    dragRef.current = null;
  }, []);

  const shell = (
    <div
      ref={panelRef}
      className={`rounded-xl border px-4 py-3 transition-colors duration-500 select-none ${
        isComplete
          ? allSucceeded
            ? "border-emerald-500/50 bg-zinc-950/95"
            : wasStopped
              ? "border-amber-500/40 bg-zinc-950/95"
              : hasErrors
                ? "border-amber-500/40 bg-zinc-950/95"
                : "border-emerald-500/40 bg-zinc-950/95"
          : "border-emerald-900/40 bg-zinc-950/95 backdrop-blur-sm"
      } ${draggable ? "cursor-grab active:cursor-grabbing shadow-2xl shadow-black/50" : ""}`}
      onPointerDown={draggable ? onPointerDown : undefined}
      onPointerMove={draggable ? onPointerMove : undefined}
      onPointerUp={draggable ? onPointerUp : undefined}
      onPointerCancel={draggable ? onPointerUp : undefined}
    >
      <div className="flex items-center gap-3">
        {draggable ? (
          <GripVertical className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
        ) : null}
        <div className="relative h-9 w-9 shrink-0">
          {isComplete ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <CheckCircle2
                className={`h-8 w-8 ${
                  allSucceeded
                    ? "text-emerald-400"
                    : wasStopped || hasErrors
                      ? "text-amber-400"
                      : "text-emerald-400"
                }`}
              />
            </div>
          ) : (
            <>
              <span className="absolute inset-0 rounded-full border-2 border-emerald-800/50 border-t-emerald-400 animate-spin" />
              <ShoppingCart className="absolute inset-0 m-auto h-4 w-4 text-emerald-400" />
            </>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-0.5">
          {isComplete ? (
            <>
              <p
                className={`truncate text-sm font-semibold ${
                  allSucceeded
                    ? "text-emerald-200"
                    : wasStopped || hasErrors
                      ? "text-amber-200"
                      : "text-emerald-200"
                }`}
              >
                {allSucceeded
                  ? "Ürünler gönderildi"
                  : wasStopped
                    ? "Aktarım durduruldu"
                    : hasErrors
                      ? "Aktarım bitti — bazı ürünler hatalı"
                      : "Aktarım tamamlandı"}
              </p>
              {detailText ? (
                <p className="truncate text-xs text-zinc-400">{detailText}</p>
              ) : null}
            </>
          ) : (
            <>
              <p className="truncate text-sm font-medium text-emerald-300">
                {progress.index > 0
                  ? `${progress.index} / ${progress.total} ürün`
                  : "Hazırlanıyor…"}
                {progress.title ? (
                  <span className="text-zinc-400 font-normal"> · {progress.title}</span>
                ) : null}
              </p>
              {detailText ? (
                <p className="truncate text-xs text-zinc-500">{detailText}</p>
              ) : null}
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <div className="hidden items-center gap-3 text-right sm:flex">
            <div className="min-w-[3rem]">
              <p
                className={`text-lg font-bold tabular-nums leading-none ${
                  allSucceeded ? "text-emerald-300" : "text-emerald-400"
                }`}
              >
                {progress.successCount}
              </p>
              <p className="mt-0.5 text-[10px] text-zinc-500">başarılı</p>
            </div>
            {progress.failCount > 0 ? (
              <div className="min-w-[3rem]">
                <p className="text-lg font-bold tabular-nums leading-none text-red-400">
                  {progress.failCount}
                </p>
                <p className="mt-0.5 text-[10px] text-zinc-500">hatalı</p>
              </div>
            ) : null}
            <div className="min-w-[3.25rem]">
              <p
                className={`text-lg font-bold tabular-nums leading-none ${
                  allSucceeded ? "text-emerald-300" : "text-zinc-200"
                }`}
              >
                {isComplete ? 100 : progress.percent}%
              </p>
              <p className="mt-0.5 text-[10px] text-zinc-500">ilerleme</p>
            </div>
          </div>

          {isActive && onStop ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onStop}
              className="h-8 shrink-0 border-red-800/60 bg-red-950/30 px-2.5 text-red-300 hover:bg-red-900/40 hover:text-red-200"
            >
              <Square className="mr-1.5 h-3 w-3 fill-current" />
              Durdur
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full transition-all duration-500 ease-out ${
            isComplete
              ? allSucceeded
                ? "bg-emerald-400"
                : "bg-gradient-to-r from-amber-500 to-emerald-400"
              : "bg-emerald-500"
          }`}
          style={{ width: `${isComplete ? 100 : Math.max(progress.percent, 3)}%` }}
        />
      </div>

      {isActive ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {STEPS.map(([phase, label]) => {
            const done = PHASE_ORDER.indexOf(progress.phase) > PHASE_ORDER.indexOf(phase);
            const active = progress.phase === phase;
            return (
              <span
                key={phase}
                className={`rounded-full border px-2 py-0.5 text-[10px] transition-colors ${
                  active
                    ? "border-emerald-500/50 bg-emerald-950/40 text-emerald-300"
                    : done
                      ? "border-zinc-700 text-zinc-400"
                      : "border-zinc-800 text-zinc-600"
                }`}
              >
                {done ? "✓ " : active ? "● " : ""}
                {label}
              </span>
            );
          })}
        </div>
      ) : null}

      {progress.outcomes.length > 0 && !allSucceeded ? (
        <div className="mt-2 max-h-32 space-y-1 overflow-y-auto border-t border-zinc-800/80 pt-2">
          {progress.outcomes.map((outcome, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-2 rounded-lg bg-zinc-900/70 px-2.5 py-1.5 text-xs"
            >
              <div className="min-w-0 flex-1">
                <span className={outcome.ok ? "text-emerald-400" : "text-red-400"}>
                  {outcome.ok ? "✓" : "✗"}
                </span>{" "}
                <span className="truncate text-zinc-300">{outcome.title}</span>
                {outcome.mode ? (
                  <span className="ml-1 text-zinc-500">({outcome.mode})</span>
                ) : null}
                {outcome.error ? (
                  <p className="mt-0.5 truncate text-red-400/80">{outcome.error}</p>
                ) : null}
              </div>
              {outcome.adminUrl ? (
                <a
                  href={outcome.adminUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-emerald-400 underline hover:text-emerald-300"
                >
                  Admin
                </a>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );

  if (fixed && draggable && pos) {
    return (
      <div
        className="pointer-events-auto fixed z-[70] w-[min(48rem,calc(100vw-1.5rem))]"
        style={{ left: pos.x, top: pos.y }}
      >
        {shell}
      </div>
    );
  }

  if (fixed) {
    return (
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 px-3 pb-3 sm:px-4 sm:pb-4">
        <div className="pointer-events-auto mx-auto max-w-3xl shadow-2xl shadow-black/40">
          {shell}
        </div>
      </div>
    );
  }

  return shell;
}

export const MARKTGO_UPLOAD_COMPLETE_MS = 6000;

export function buildUploadCompleteProgress(
  base: MarktGoUploadProgress,
  summary: {
    successCount: number;
    failCount: number;
    detail: string;
    title?: string;
    stopped?: boolean;
  },
): MarktGoUploadProgress {
  return {
    ...base,
    index: base.total,
    successCount: summary.successCount,
    failCount: summary.failCount,
    title: summary.title ?? base.title,
    phase: "complete",
    detail: summary.detail,
    percent: 100,
    stopped: summary.stopped,
  };
}
