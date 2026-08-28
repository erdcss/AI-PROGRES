import { CheckCircle2, ShoppingCart } from "lucide-react";

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
}: {
  progress: MarktGoUploadProgress;
}) {
  const isComplete = progress.phase === "complete";
  const allSucceeded = isComplete && progress.failCount === 0;
  const hasErrors = progress.failCount > 0;

  return (
    <div
      className={`mt-4 rounded-xl border p-4 space-y-3 transition-all duration-700 ease-out ${
        isComplete
          ? allSucceeded
            ? "border-emerald-500/70 bg-emerald-950/35 shadow-[0_0_24px_rgba(16,185,129,0.15)]"
            : hasErrors
              ? "border-amber-500/50 bg-amber-950/20 shadow-[0_0_20px_rgba(245,158,11,0.1)]"
              : "border-emerald-500/60 bg-emerald-950/30"
          : "border-emerald-900/40 bg-zinc-900/90"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="relative w-11 h-11 shrink-0">
          {isComplete ? (
            <div className="absolute inset-0 flex items-center justify-center animate-in zoom-in-50 fade-in duration-700">
              <CheckCircle2
                className={`w-10 h-10 ${
                  allSucceeded ? "text-emerald-400" : hasErrors ? "text-amber-400" : "text-emerald-400"
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
                className={`font-semibold text-sm animate-in fade-in slide-in-from-bottom-1 duration-500 ${
                  allSucceeded ? "text-emerald-300" : hasErrors ? "text-amber-300" : "text-emerald-300"
                }`}
              >
                {allSucceeded
                  ? "Aktarım tamamlandı"
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

        <div className="shrink-0 flex gap-4 text-right animate-in fade-in duration-500">
          <div>
            <span className={`text-xl font-bold ${isComplete ? "text-emerald-300" : "text-emerald-400"}`}>
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
            <span className={`text-xl font-bold ${isComplete ? "text-emerald-300" : "text-zinc-300"}`}>
              {isComplete ? 100 : progress.percent}%
            </span>
            <span className="text-xs text-zinc-500 block">ilerleme</span>
          </div>
        </div>
      </div>

      <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
        <div
          className={`h-full transition-all ease-out ${
            isComplete
              ? allSucceeded
                ? "bg-gradient-to-r from-emerald-600 to-emerald-300 duration-700"
                : "bg-gradient-to-r from-amber-600 to-emerald-400 duration-700"
              : "bg-gradient-to-r from-emerald-600 to-emerald-400 duration-500"
          }`}
          style={{ width: `${isComplete ? 100 : Math.max(progress.percent, 3)}%` }}
        />
      </div>

      <div className="flex flex-wrap gap-2 text-[11px]">
        {STEPS.map(([phase, label]) => {
          const done =
            isComplete || PHASE_ORDER.indexOf(progress.phase) > PHASE_ORDER.indexOf(phase);
          const active = !isComplete && progress.phase === phase;
          return (
            <span
              key={phase}
              className={`px-2 py-0.5 rounded-full border transition-all duration-500 ${
                isComplete && done
                  ? "border-emerald-500/60 bg-emerald-950/50 text-emerald-300 scale-100"
                  : active
                    ? "border-emerald-500/60 bg-emerald-950/50 text-emerald-300"
                    : done
                      ? "border-zinc-600 text-zinc-400"
                      : "border-zinc-800 text-zinc-600"
              } ${isComplete && done ? "animate-in fade-in zoom-in-95 duration-500" : ""}`}
              style={
                isComplete && done
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

      {progress.outcomes.length > 0 && (
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
      )}
    </div>
  );
}

export const MARKTGO_UPLOAD_COMPLETE_MS = 4000;

export function buildUploadCompleteProgress(
  base: MarktGoUploadProgress,
  summary: { successCount: number; failCount: number; detail: string; title?: string },
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
  };
}
