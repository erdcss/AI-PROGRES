import { useMemo, useState } from "react";
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  Download,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  Star,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { TrendyolReviewItem, TrendyolReviewsStats } from "@/lib/trendyol-reviews-client";

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={`h-3.5 w-3.5 ${
            s <= rating ? "fill-amber-400 text-amber-400" : "text-zinc-600"
          }`}
        />
      ))}
    </div>
  );
}

function exportReviewsCsv(reviews: TrendyolReviewItem[], productTitle: string) {
  const COLS = [
    "title",
    "body",
    "rating",
    "review_date",
    "reviewer_name",
    "reviewer_email",
    "reply",
    "picture_urls",
    "product_handle",
    "product_id",
  ] as const;

  const escapeCell = (v: unknown): string => {
    const s = String(v ?? "").replace(/\r\n|\r/g, "\n");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const rows = reviews.map((r, idx) => {
    const emailIndex = String(idx + 1).padStart(4, "0");
    const email =
      r.reviewer_email && /^[^@]+@[^@]+\.[^@]+$/.test(r.reviewer_email)
        ? r.reviewer_email
        : `review_${emailIndex}@trendyol-import.local`;
    const dateClean = (r.review_date || "").replace(/\s*(UTC|GMT)$/i, "").trim();
    const pics = (r.picture_urls || "")
      .split(/[|\n\r]+/)
      .map((u) => u.trim())
      .filter((u) => /^https?:\/\/.+/.test(u))
      .join(",");

    return COLS.map((col) => {
      if (col === "reviewer_email") return escapeCell(email);
      if (col === "review_date") return escapeCell(dateClean);
      if (col === "picture_urls") return pics ? `"${pics.replace(/"/g, '""')}"` : "";
      return escapeCell((r as any)[col] ?? "");
    }).join(",");
  });

  const csv = [COLS.join(","), ...rows].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  const slug = (productTitle || "urun").replace(/[^\w\-]+/g, "-").slice(0, 48);
  link.download = `trendyol-yorumlar-${slug}-${Date.now()}.csv`;
  link.click();
}

export function ProductReviewsDrawer({
  open,
  onOpenChange,
  productTitle,
  reviews,
  stats,
  loading,
  error,
  onRetry,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productTitle: string;
  reviews: TrendyolReviewItem[];
  stats: TrendyolReviewsStats | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const avg = stats?.avg ?? 0;
  const dist = stats?.dist ?? [0, 0, 0, 0, 0];

  const headerSubtitle = useMemo(() => {
    if (loading) return "Yorumlar çekiliyor…";
    if (error) return error;
    if (!reviews.length) return "Bu ürün için yorum bulunamadı";
    return `${reviews.length} yorum · ortalama ${avg.toFixed(1)}★`;
  }, [loading, error, reviews.length, avg]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col border-zinc-800 bg-zinc-950 p-0 sm:max-w-lg"
      >
        <SheetHeader className="border-b border-zinc-800 px-5 py-4 text-left space-y-2">
          <SheetTitle className="flex items-center gap-2 text-zinc-100">
            <MessageSquare className="h-5 w-5 text-zinc-400" />
            Ürün Yorumları
          </SheetTitle>
          <SheetDescription className="text-zinc-400 line-clamp-2">
            {productTitle || "Ürün"}
          </SheetDescription>
          <p className="text-xs text-zinc-500">{headerSubtitle}</p>
          {stats && reviews.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <div className="flex items-center gap-1.5">
                <StarRating rating={Math.round(avg)} />
                <span className="text-amber-300 text-sm font-semibold tabular-nums">
                  {avg.toFixed(1)}
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {dist.map((count, i) => (
                  <span key={i} className="text-[10px] text-zinc-500 tabular-nums">
                    {i + 1}★:{count}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center gap-2 pt-1">
            {reviews.length > 0 && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 border-zinc-700 text-zinc-200"
                onClick={() => exportReviewsCsv(reviews, productTitle)}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                CSV ({reviews.length})
              </Button>
            )}
            {error && onRetry && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 border-zinc-700 text-zinc-200"
                onClick={onRetry}
              >
                Tekrar dene
              </Button>
            )}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-16 text-zinc-400 text-sm">
              <Loader2 className="h-5 w-5 animate-spin" />
              Yorumlar çekiliyor…
            </div>
          )}

          {!loading && error && (
            <div className="rounded-xl border border-red-900/40 bg-red-950/20 p-4 text-sm text-red-300">
              {error}
            </div>
          )}

          {!loading && !error && reviews.length === 0 && (
            <div className="py-16 text-center text-sm text-zinc-500">
              Henüz yorum yok
            </div>
          )}

          {!loading &&
            reviews.map((review, i) => {
              const isExpanded = expandedId === review.id;
              const pics = review.picture_urls
                ? review.picture_urls
                    .split(/[|,]/)
                    .map((u) => u.trim())
                    .filter(Boolean)
                : [];
              const body = review.body || "";
              const long = body.length > 160;

              return (
                <div
                  key={review.id || i}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 space-y-2 animate-in fade-in slide-in-from-right-2 duration-400"
                  style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-950 text-xs font-semibold text-zinc-300">
                      {(review.reviewer_name?.[0] || "?").toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-zinc-200">
                          {review.reviewer_name || "Anonim"}
                        </span>
                        <StarRating rating={review.rating} />
                        <span className="text-[11px] tabular-nums text-zinc-500">
                          {review.rating}/5
                        </span>
                        {pics.length > 0 && (
                          <Badge
                            variant="outline"
                            className="h-5 border-sky-800/50 text-[10px] text-sky-300"
                          >
                            <ImageIcon className="mr-1 h-3 w-3" />
                            {pics.length}
                          </Badge>
                        )}
                      </div>
                      <p
                        className={`text-sm leading-relaxed text-zinc-300 ${
                          !isExpanded && long ? "line-clamp-3" : ""
                        }`}
                      >
                        {body}
                      </p>
                      {long && (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-500 hover:text-zinc-300"
                          onClick={() => setExpandedId(isExpanded ? null : review.id)}
                        >
                          {isExpanded ? (
                            <>
                              <ChevronUp className="h-3 w-3" /> Daha az
                            </>
                          ) : (
                            <>
                              <ChevronDown className="h-3 w-3" /> Devamını oku
                            </>
                          )}
                        </button>
                      )}
                      {review.reply && (
                        <div className="mt-1 rounded-r border-l-2 border-emerald-700/50 bg-emerald-950/20 py-1.5 pl-2.5">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
                            Satıcı yanıtı
                          </p>
                          <p className="text-xs text-zinc-400">{review.reply}</p>
                        </div>
                      )}
                      {isExpanded && pics.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {pics.map((pic, pi) => (
                            <a key={pi} href={pic} target="_blank" rel="noopener noreferrer">
                              <img
                                src={pic}
                                alt=""
                                className="h-16 w-16 rounded-lg border border-zinc-800 object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = "none";
                                }}
                              />
                            </a>
                          ))}
                        </div>
                      )}
                      {review.review_date && (
                        <p className="flex items-center gap-1 text-[11px] text-zinc-600">
                          <Calendar className="h-3 w-3" />
                          {review.review_date.replace(/\s*(UTC|GMT)$/i, "").trim()}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
