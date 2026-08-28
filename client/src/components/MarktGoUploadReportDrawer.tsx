import { CheckCircle2, FolderTree, Tag, XCircle } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { MarktGoBulkUploadReport } from "@/lib/marktgo-upload-report";

function TagPills({ tags, tone }: { tags: string[]; tone: "auto" | "manual" | "all" }) {
  if (!tags.length) return <span className="text-zinc-500 text-xs">—</span>;
  const cls =
    tone === "auto"
      ? "border-emerald-800/60 bg-emerald-950/40 text-emerald-300"
      : tone === "manual"
        ? "border-sky-800/60 bg-sky-950/40 text-sky-300"
        : "border-zinc-700 bg-zinc-800/60 text-zinc-300";
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <span key={tag} className={`rounded-full border px-2 py-0.5 text-[10px] ${cls}`}>
          {tag}
        </span>
      ))}
    </div>
  );
}

export function MarktGoUploadReportDrawer({
  open,
  onOpenChange,
  report,
  destinationName = "MARKT-GO",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: MarktGoBulkUploadReport | null;
  destinationName?: string;
}) {
  if (!report) return null;

  const maxCategoryCount = Math.max(1, ...report.categorySummary.map((c) => c.count));

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="flex w-full flex-col border-zinc-800 bg-zinc-950 p-0 sm:max-w-lg"
        >
          <SheetHeader className="border-b border-zinc-800 px-5 py-4 text-left">
            <SheetTitle className="flex items-center gap-2 text-zinc-100">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              {destinationName} Aktarım Raporu
            </SheetTitle>
            <SheetDescription className="text-zinc-400">
              {report.successCount} başarılı
              {report.failCount > 0 ? ` · ${report.failCount} hatalı` : ""} — otomatik etiket ve
              kategori eşlemesi
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            {report.items.map((item, index) => (
              <div
                key={`${item.title}-${index}`}
                className={`rounded-xl border p-3 space-y-2 animate-in fade-in slide-in-from-right-2 duration-500 ${
                  item.success
                    ? "border-zinc-800 bg-zinc-900/60"
                    : "border-red-900/50 bg-red-950/20"
                }`}
                style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
              >
                <div className="flex items-start gap-2">
                  {item.success ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-zinc-100 line-clamp-2">{item.title}</p>
                    {item.error ? (
                      <p className="text-xs text-red-400 mt-0.5">{item.error}</p>
                    ) : null}
                  </div>
                </div>

                {item.success ? (
                  <>
                    <div>
                      <p className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wide text-zinc-500">
                        <Tag className="h-3 w-3" /> Otomatik etiketler
                      </p>
                      <TagPills tags={item.autoTags} tone="auto" />
                    </div>
                    {item.manualTags.length > 0 ? (
                      <div>
                        <p className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">
                          Manuel etiketler
                        </p>
                        <TagPills tags={item.manualTags} tone="manual" />
                      </div>
                    ) : null}
                    <div>
                      <p className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wide text-zinc-500">
                        <FolderTree className="h-3 w-3" /> Eşleşen kategoriler
                      </p>
                      {item.matchedCollections.length ? (
                        <div className="flex flex-wrap gap-1">
                          {item.matchedCollections.map((col) => (
                            <span
                              key={col.id}
                              className="rounded-md border border-violet-800/50 bg-violet-950/30 px-2 py-0.5 text-[10px] text-violet-200"
                            >
                              {col.title}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-amber-400/90">
                          Kategori eşleşmesi yok — etiketler kontrol edilmeli
                        </span>
                      )}
                    </div>
                  </>
                ) : null}
              </div>
            ))}
          </div>

          {report.categorySummary.length > 0 ? (
            <div className="border-t border-zinc-800 bg-zinc-900/80 px-5 py-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Kategori dağılımı
              </p>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {report.categorySummary.map((row, i) => (
                  <div
                    key={row.title}
                    className="animate-in fade-in slide-in-from-bottom-1 duration-500"
                    style={{ animationDelay: `${i * 50}ms` }}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                      <span className="truncate text-zinc-200">{row.title}</span>
                      <span className="shrink-0 font-semibold text-emerald-400">{row.count} adet</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-violet-600 to-emerald-400 transition-all duration-700"
                        style={{ width: `${Math.round((row.count / maxCategoryCount) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      {open && report.categorySummary.length > 0 ? (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur-sm px-4 py-2 animate-in slide-in-from-bottom duration-500 sm:right-[min(32rem,100vw)]">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="font-medium text-zinc-400 shrink-0">Kategoriler:</span>
            {report.categorySummary.slice(0, 8).map((row) => (
              <span key={row.title} className="text-zinc-300">
                {row.title}{" "}
                <span className="font-semibold text-emerald-400">({row.count})</span>
              </span>
            ))}
            {report.categorySummary.length > 8 ? (
              <span className="text-zinc-500">+{report.categorySummary.length - 8} daha</span>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
