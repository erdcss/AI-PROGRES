import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import {
  ArrowLeft, Star, Download, Search, Loader2, MessageSquare,
  User, Calendar, Image as ImageIcon, ChevronDown, ChevronUp,
  RefreshCw, CheckCircle, AlertCircle, ExternalLink
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface TrendyolReview {
  id: string;
  title: string;
  body: string;
  rating: number;
  review_date: string;
  reviewer_name: string;
  reviewer_email: string;
  product_id: string;
  product_handle: string;
  reply: string;
  picture_urls: string;
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={`w-4 h-4 ${s <= rating ? "fill-yellow-400 text-yellow-400" : "text-gray-600"}`}
        />
      ))}
    </div>
  );
}

export default function TrendyolReviewsPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [url, setUrl] = useState("");
  const [shopifyProductId, setShopifyProductId] = useState("");
  const [shopifyHandle, setShopifyHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [reviews, setReviews] = useState<TrendyolReview[]>([]);
  const [productTitle, setProductTitle] = useState("");
  const [expandedReview, setExpandedReview] = useState<string | null>(null);
  const [stats, setStats] = useState<{ total: number; avg: number; dist: number[] } | null>(null);

  const scrapeReviews = async () => {
    if (!url.trim()) {
      toast({ title: "Hata", description: "Lütfen bir Trendyol ürün URL'si girin", variant: "destructive" });
      return;
    }
    setLoading(true);
    setReviews([]);
    setStats(null);
    try {
      const response = await fetch("/api/reviews/scrape-trendyol", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          shopifyProductId: shopifyProductId.trim(),
          shopifyHandle: shopifyHandle.trim()
        })
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Yorumlar çekilemedi");
      setReviews(data.reviews || []);
      setProductTitle(data.productTitle || "");
      setStats(data.stats || null);
      toast({
        title: "Yorumlar Çekildi ✅",
        description: `${data.reviews?.length || 0} yorum başarıyla çekildi`
      });
    } catch (err: any) {
      toast({ title: "Hata", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = () => {
    if (!reviews.length) return;

    const COLS = ["title","body","rating","review_date","reviewer_name","reviewer_email","reply","picture_urls","product_handle","product_id"] as const;
    const header = COLS.join(",");

    const escapeCell = (v: unknown): string => {
      const s = String(v ?? "").replace(/\r\n|\r/g, "\n");
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const cleanPictureUrls = (raw: string): string => {
      if (!raw) return "";
      const urls = raw.split(/[|\n\r]+/).map(u => u.trim()).filter(u => /^https?:\/\/.+/.test(u));
      return urls.join(",");
    };

    const rows = reviews.map((r, idx) => {
      const emailIndex = String(idx + 1).padStart(4, "0");
      const email = r.reviewer_email && /^[^@]+@[^@]+\.[^@]+$/.test(r.reviewer_email)
        ? r.reviewer_email
        : `review_${emailIndex}@trendyol-import.local`;

      const dateClean = (r.review_date || "").replace(/\s*(UTC|GMT)$/i, "").trim();

      const pics = cleanPictureUrls(r.picture_urls || "");
      const picsCell = pics ? `"${pics.replace(/"/g, '""')}"` : "";

      const cells: string[] = COLS.map(col => {
        if (col === "reviewer_email") return escapeCell(email);
        if (col === "review_date") return escapeCell(dateClean);
        if (col === "picture_urls") return picsCell;
        return escapeCell((r as any)[col] ?? "");
      });
      return cells.join(",");
    });

    const csv = [header, ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `trendyol-yorumlar-${Date.now()}.csv`;
    link.click();
    toast({ title: "CSV İndirildi ✅", description: `${reviews.length} yorum dışa aktarıldı` });
  };

  const ratingColor = (r: number) =>
    r >= 4 ? "text-emerald-400" : r === 3 ? "text-yellow-400" : "text-red-400";

  return (
    <div className="min-h-screen business-bg">
      {/* Header */}
      <div className="business-bg border-b-2 business-border">
        <div className="max-w-5xl mx-auto px-4 py-5 flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/")}
            className="text-white hover:bg-white/10"
          >
            <ArrowLeft className="w-4 h-4 mr-1" /> Geri
          </Button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-pink-600 rounded-xl flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black text-white">ÜRÜN YORUM ÇIKARICI</h1>
              <p className="text-purple-300 text-xs font-bold">Trendyol yorumlarını CSV olarak dışa aktar</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

        {/* Input Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="business-card p-6 space-y-5"
        >
          <h2 className="text-white font-black text-lg flex items-center gap-2">
            <Search className="w-5 h-5 text-purple-400" />
            Ürün URL Gir
          </h2>

          <div className="space-y-3">
            <div>
              <label className="text-white text-sm font-bold mb-1.5 block">Trendyol Ürün URL'si *</label>
              <Input
                placeholder="https://www.trendyol.com/marka/urun-p-12345678/yorumlar"
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === "Enter" && scrapeReviews()}
                className="business-input h-11 text-sm"
              />
              <p className="text-white/50 text-xs mt-1">Ürün sayfası veya /yorumlar sayfası URL'si girin</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-white text-sm font-bold mb-1.5 block">Shopify Ürün ID (opsiyonel)</label>
                <Input
                  placeholder="gshop__123456"
                  value={shopifyProductId}
                  onChange={e => setShopifyProductId(e.target.value)}
                  className="business-input h-11 text-sm"
                />
              </div>
              <div>
                <label className="text-white text-sm font-bold mb-1.5 block">Shopify Handle (opsiyonel)</label>
                <Input
                  placeholder="urun-adi-handle"
                  value={shopifyHandle}
                  onChange={e => setShopifyHandle(e.target.value)}
                  className="business-input h-11 text-sm"
                />
              </div>
            </div>
          </div>

          <Button
            onClick={scrapeReviews}
            disabled={loading}
            className="w-full h-12 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-black text-base"
          >
            {loading ? (
              <><Loader2 className="w-5 h-5 animate-spin mr-2" /> Yorumlar Çekiliyor...</>
            ) : (
              <><MessageSquare className="w-5 h-5 mr-2" /> YORUMLARI ÇEK</>
            )}
          </Button>
        </motion.div>

        {/* Stats + Export */}
        <AnimatePresence>
          {reviews.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="business-card p-5"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  {productTitle && (
                    <p className="text-white font-black text-base truncate max-w-lg">{productTitle}</p>
                  )}
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-purple-600/30 text-purple-300 border-purple-500/30 font-bold">
                        {reviews.length} yorum
                      </Badge>
                    </div>
                    {stats && (
                      <>
                        <div className="flex items-center gap-1.5">
                          <StarRating rating={Math.round(stats.avg)} />
                          <span className="text-yellow-400 font-bold text-sm">{stats.avg.toFixed(1)}</span>
                        </div>
                        <div className="flex gap-1">
                          {stats.dist.map((count, i) => (
                            <span key={i} className="text-xs text-white/60">
                              {i + 1}★:{count}
                            </span>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <Button
                  onClick={exportCSV}
                  className="bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white font-bold px-6 h-10 shrink-0"
                >
                  <Download className="w-4 h-4 mr-2" />
                  CSV OLARAK İNDİR ({reviews.length})
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Reviews List */}
        <AnimatePresence>
          {reviews.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-3"
            >
              {reviews.map((review, i) => {
                const isExpanded = expandedReview === review.id;
                const pics = review.picture_urls ? review.picture_urls.split("|").filter(Boolean) : [];
                return (
                  <motion.div
                    key={review.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="business-card p-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center shrink-0 text-white font-black text-sm">
                        {review.reviewer_name?.[0]?.toUpperCase() || "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-white font-bold text-sm">{review.reviewer_name}</span>
                          <StarRating rating={review.rating} />
                          <span className={`text-xs font-bold ${ratingColor(review.rating)}`}>
                            {review.rating}/5
                          </span>
                          {pics.length > 0 && (
                            <Badge className="bg-blue-600/20 text-blue-300 border-blue-500/20 text-xs px-1.5 py-0">
                              <ImageIcon className="w-3 h-3 mr-1" />{pics.length} foto
                            </Badge>
                          )}
                        </div>
                        {review.title && (
                          <p className="text-purple-300 font-bold text-sm mb-1">{review.title}</p>
                        )}
                        <p className={`text-white/80 text-sm leading-relaxed ${!isExpanded && review.body.length > 160 ? "line-clamp-2" : ""}`}>
                          {review.body}
                        </p>
                        {review.body.length > 160 && (
                          <button
                            onClick={() => setExpandedReview(isExpanded ? null : review.id)}
                            className="text-purple-400 text-xs font-bold mt-1 flex items-center gap-1 hover:text-purple-300"
                          >
                            {isExpanded ? <><ChevronUp className="w-3 h-3" />Daha az</> : <><ChevronDown className="w-3 h-3" />Devamını oku</>}
                          </button>
                        )}

                        {/* Reply */}
                        {review.reply && (
                          <div className="mt-2 pl-3 border-l-2 border-emerald-500/40 bg-emerald-900/10 rounded-r p-2">
                            <p className="text-emerald-400 text-xs font-bold mb-0.5">Satıcı yanıtı:</p>
                            <p className="text-white/70 text-xs">{review.reply}</p>
                          </div>
                        )}

                        {/* Images */}
                        {isExpanded && pics.length > 0 && (
                          <div className="mt-3 flex gap-2 flex-wrap">
                            {pics.map((pic, pi) => (
                              <a key={pi} href={pic} target="_blank" rel="noopener noreferrer">
                                <img
                                  src={pic}
                                  alt={`Yorum fotoğrafı ${pi + 1}`}
                                  className="w-16 h-16 object-cover rounded-lg border border-white/10 hover:opacity-80 transition-opacity"
                                  onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                                />
                              </a>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center gap-3 mt-2">
                          <span className="text-white/40 text-xs flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {review.review_date.replace(" UTC", "")}
                          </span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Empty State */}
        {!loading && reviews.length === 0 && (
          <div className="business-card p-12 text-center">
            <MessageSquare className="w-12 h-12 text-purple-400/40 mx-auto mb-4" />
            <p className="text-white/40 font-bold">Yorum çekmek için yukarıya bir Trendyol URL'si girin</p>
          </div>
        )}
      </div>
    </div>
  );
}
