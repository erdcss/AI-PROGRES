import { CheckCircle2, ShoppingCart, Square } from "lucide-react";
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

export function MarktGoUploadProgressBanner({
  progress,
  onStop,
  fixed = false,
}: {
  progress: MarktGoUploadProgress;
  onStop?: () => void;
  fixed?: boolean;
}) {
  const isComplete = progress.phase === "complete";
  const isActive = !isComplete;
  const allSucceeded = isComplete && progress.failCount === 0 && !progress.stopped;
  const hasErrors = progress.failCount > 0;
  const wasStopped = Boolean(progress.stopped);

  const shell = (
    <div
      className={`rounded-xl border p-4 space-y-3 transition-all duration-700 ease-out ${
        isComplete
          ? allSucceeded
            ? "border-emerald-400/80 bg-emerald-600/20 shadow-[0_0_32px_rgba(16,185,129,0.35)] scale-[1.01]"
            : wasStopped
              ? "border-amber-500/50 bg-amber-950/25"
              : hasErrors
                ? "border-amber-500/50 bg-amber-950/20 shadow-[0_0_20px_rgba(245,158,11,0.1)]"
                : "border-emerald-500/60 bg-emerald-950/30"
          : "border-emerald-900/40 bg-zinc-900/95 backdrop-blur-sm"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="relative w-11 h-11 shrink-0">
          {isComplete && allSucceeded ? (
            <div className="absolute inset-0 flex items-center justify-center animate-in zoom-in-50 fade-in duration-700">
              <div className="absolute inset-0 rounded-full bg-emerald-400/20 animate-ping" />
              <CheckCircle2 className="relative w-10 h-10 text-emerald-300 drop-shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
            </div>
          ) : isComplete ? (
            <div className="absolute inset-0 flex items-center justify-center animate-in zoom-in-50 fade-in duration-700">
              <CheckCircle2
                className={`w-10 h-10 ${
                  wasStopped ? "text-amber-400" : hasErrors ? "text-amber-400" : "text-emerald-400"
                }`}
              />
            </div>
          ) : (
            <>
              <span className="absolute inset-0 rounded-full border-2 border-emerald-800/50 border-t-emerald-400 animate-spin" />
              <ShoppingCart className="absolute inset-0 m-auto w-5 h-5 text-emerald-400" />
            </>
          )}
        </div>

        <div className="flex-1 min-w-0">
          {isComplete ? (
            <>
              <p
                className={`font-semibold animate-in fade-in slide-in-from-bottom-1 duration-500 ${
                  allSucceeded
                    ? "text-emerald-200 text-base"
                    : wasStopped
                      ? "text-amber-300 text-sm"
                      : hasErrors
                        ? "text-amber-300 text-sm"
                        : "text-emerald-300 text-sm"
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
              <p className="text-zinc-100 text-sm mt-1 animate-in fade-in duration-700 delay-100">
                {progress.detail}
              </p>
            </>
          ) : (
            <>
              <p className="text-emerald-300 font-medium text-sm">
                {progress.index > 0
                  ? `${progress.index} / ${progress.total} ürün`
                  : "Hazırlanıyor..."}
              </p>
              <p className="text-zinc-100 text-sm mt-0.5 truncate font-medium">
                {progress.title || "MARKT-GO aktarımı"}
              </p>
              <p className="text-zinc-500 text-xs mt-1">{progress.detail}</p>
            </>
          )}
        </div>

        <div className="shrink-0 flex items-start gap-3">
          <div className="flex gap-4 text-right animate-in fade-in duration-500">
            <div>
              <span
                className={`text-xl font-bold ${isComplete && allSucceeded ? "text-emerald-200" : "text-emerald-400"}`}
              >
                {progress.successCount}
              </span>
              <span className="text-xs text-zinc-500 block">başarılı</span>
            </div>
            {progress.failCount > 0 && (
              <div>
                <span className="text-xl font-bold text-red-400">{progress.failCount}</span>
                <span className="text-xs text-zinc-500 block">hatalı</span>
              </div>
            )}
            <div>
              <span
                className={`text-xl font-bold ${isComplete && allSucceeded ? "text-emerald-200" : "text-zinc-300"}`}
              >
                {isComplete ? 100 : progress.percent}%
              </span>
              <span className="text-xs text-zinc-500 block">ilerleme</span>
            </div>
          </div>
          {isActive && onStop ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onStop}
              className="shrink-0 border-red-800/60 bg-red-950/30 text-red-300 hover:bg-red-900/40 hover:text-red-200"
            >
              <Square className="h-3.5 w-3.5 mr-1.5 fill-current" />
              Durdur
            </Button>
          ) : null}
        </div>
      </div>

      <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
        <div
          className={`h-full transition-all ease-out ${
            isComplete
              ? allSucceeded
                ? "bg-gradient-to-r from-emerald-500 to-emerald-200 duration-1000"
                : "bg-gradient-to-r from-amber-600 to-emerald-400 duration-700"
              : "bg-gradient-to-r from-emerald-600 to-emerald-400 duration-500"
          }`}
          style={{ width: `${isComplete ? 100 : Math.max(progress.percent, 3)}%` }}
        />
      </div>

      {!allSucceeded || !isComplete ? (
        <div className="flex flex-wrap gap-2 text-[11px]">
          {STEPS.map(([phase, label]) => {
            const done =
              isComplete || PHASE_ORDER.indexOf(progress.phase) > PHASE_ORDER.indexOf(phase);
            const active = !isComplete && progress.phase === phase;
            return (
              <span
                key={phase}
                className={`px-2 py-0.5 rounded-full border transition-all duration-500 ${
                  isComplete && done && allSucceeded
                    ? "border-emerald-400/70 bg-emerald-500/20 text-emerald-100 scale-100"
                    : active
                      ? "border-emerald-500/60 bg-emerald-950/50 text-emerald-300"
                      : done
                        ? "border-zinc-600 text-zinc-400"
                        : "border-zinc-800 text-zinc-600"
                } ${isComplete && done && allSucceeded ? "animate-in fade-in zoom-in-95 duration-500" : ""}`}
                style={
                  isComplete && done && allSucceeded
                    ? { animationDelay: `${PHASE_ORDER.indexOf(phase) * 80}ms` }
                    : undefined
                }
              >
                {done ? "✓ " : active ? "● " : ""}
                {label}
              </span>
            );
          })}
        </div>
      ) : null}

      {progress.outcomes.length > 0 && !allSucceeded ? (
        <div className="space-y-1.5 max-h-36 overflow-y-auto border-t border-zinc-800 pt-2">
          {progress.outcomes.map((outcome, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-2 text-xs bg-zinc-800/40 rounded-lg px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <span className={outcome.ok ? "text-emerald-400" : "text-red-400"}>
                  {outcome.ok ? "✓" : "✗"}
                </span>{" "}
                <span className="text-zinc-300 truncate">{outcome.title}</span>
                {outcome.mode && (
                  <span className="text-zinc-500 ml-1">({outcome.mode})</span>
                )}
                {outcome.error && (
                  <p className="text-red-400/80 mt-0.5 truncate">{outcome.error}</p>
                )}
              </div>
              {outcome.adminUrl && (
                <a
                  href={outcome.adminUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-emerald-400 hover:text-emerald-300 underline"
                >
                  Admin
                </a>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );

  if (fixed) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 px-3 pb-3 sm:px-4 sm:pb-4 pointer-events-none animate-in slide-in-from-bottom duration-500">
        <div className="pointer-events-auto mx-auto max-w-4xl">{shell}</div>
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
