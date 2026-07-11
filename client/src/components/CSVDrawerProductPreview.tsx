import { memo, useMemo, useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Package, Tag, X, Download, ShoppingCart, ChevronDown, ChevronUp, Loader2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { resolvePreviewImagesForEntry, resolvePreviewProxyUrl } from "@/lib/product-image-url";
import { resolvePreviewVariants } from "@/lib/preview-variants";
import { sanitizeTrendyolVariants, pickVariantsForPreview, summarizeVariantStock } from "@shared/trendyol-variant-utils";
import { getTrendyolImageFallbackUrls } from "@shared/trendyol-product-images";
import {
  normalizeTrendyolDisplayPrice,
  formatOriginalPrice,
  formatSalePrice,
  formatProfitPercentage,
} from "@/utils/price-utils";
import { isBlockedShopifyTag } from "@shared/shopify-tag-sanitizer";
import type { CsvStatusResponse } from "@/lib/shopify-csv-download";

function PreviewCarouselImage({
  directUrl,
  alt,
  onFailed,
}: {
  directUrl: string;
  alt: string;
  onFailed?: () => void;
}) {
  const candidates = useMemo(
    () => getTrendyolImageFallbackUrls(directUrl),
    [directUrl],
  );
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [useProxy, setUseProxy] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setCandidateIndex(0);
    setUseProxy(true);
    setFailed(false);
  }, [directUrl]);

  const currentCandidate = candidates[candidateIndex] ?? directUrl;
  const src = useProxy
    ? resolvePreviewProxyUrl(currentCandidate) ?? currentCandidate
    : currentCandidate;

  if (failed || !src) {
    return (
      <div className="w-full h-full flex items-center justify-center text-slate-400">
        <Package className="w-6 h-6" />
      </div>
    );
  }

  return (
    <img
      key={`${currentCandidate}-${useProxy}`}
      src={src}
      alt={alt}
      className="w-full h-full object-cover"
      loading="eager"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => {
        if (useProxy) {
          setUseProxy(false);
          return;
        }
        if (candidateIndex + 1 < candidates.length) {
          setCandidateIndex((index) => index + 1);
          setUseProxy(true);
          return;
        }
        setFailed(true);
        onFailed?.();
      }}
    />
  );
}

const TURKISH_COLOR_SWATCHES: Record<string, string> = {
  siyah: "#171717",
  beyaz: "#f5f5f5",
  gri: "#9ca3af",
  lacivert: "#1e3a8a",
  mavi: "#3b82f6",
  kırmızı: "#dc2626",
  kirmizi: "#dc2626",
  yeşil: "#16a34a",
  yesil: "#16a34a",
  sarı: "#eab308",
  sari: "#eab308",
  turuncu: "#ea580c",
  mor: "#7c3aed",
  pembe: "#ec4899",
  bej: "#d4b896",
  kahverengi: "#78350f",
  bordo: "#7f1d1d",
  haki: "#6b7280",
  ekru: "#e8dcc8",
  antrasit: "#374151",
};

function resolveSwatchColor(name: string, colorCode?: string): string {
  const code = colorCode?.trim();
  if (code && /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(code)) return code;
  const mapped = TURKISH_COLOR_SWATCHES[name.toLowerCase().trim()];
  if (mapped) return mapped;
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 42%, 42%)`;
}

function MiniThumb({ url, alt, index }: { url: string; alt: string; index: number }) {
  return (
    <div
      className="w-9 h-9 rounded-md overflow-hidden border border-zinc-700/80 shrink-0 shadow-sm animate-in fade-in zoom-in-95 duration-300 fill-mode-both bg-zinc-900"
      style={{ animationDelay: `${index * 35}ms` }}
    >
      <PreviewCarouselImage directUrl={url} alt={alt} />
    </div>
  );
}

type StatPreviewKind = "image" | "color" | "size" | "variant";

function StatPreviewCard({
  label,
  value,
  kind,
  images,
  colors,
  sizes,
  variants,
  productTitle,
}: {
  label: string;
  value: number;
  kind: StatPreviewKind;
  images: string[];
  colors: Array<{ name: string; inStock: boolean; colorCode?: string }>;
  sizes: Array<{ name: string; inStock: boolean }>;
  variants: Array<{ color: string; size: string; inStock: boolean; colorCode?: string }>;
  productTitle: string;
}) {
  const inStockCount = variants.filter((v) => v.inStock).length;

  return (
    <HoverCard openDelay={100} closeDelay={60}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className="px-2.5 py-1 rounded-md bg-zinc-900/80 border border-zinc-800 text-center min-w-[64px] transition-all duration-200 hover:border-zinc-600 hover:bg-zinc-800/90 hover:scale-[1.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600/40"
        >
          <div className="text-sm font-semibold text-zinc-200">{value}</div>
          <div className="text-[10px] text-zinc-500">{label}</div>
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        side="top"
        align="center"
        sideOffset={8}
        className="w-auto max-w-[300px] p-3 bg-zinc-950/95 border-zinc-700/80 shadow-xl backdrop-blur-sm"
      >
        {kind === "image" && (
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wide text-zinc-500 font-medium">Görseller</p>
            <div className="flex flex-wrap gap-1.5 max-w-[272px] max-h-[220px] overflow-y-auto">
              {images.map((url, i) => (
                <MiniThumb key={`${url}-${i}`} url={url} alt={productTitle} index={i} />
              ))}
            </div>
          </div>
        )}

        {kind === "color" && (
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wide text-zinc-500 font-medium">Renk paleti</p>
            <div className="flex flex-wrap gap-2 max-w-[272px]">
              {colors.map((entry, i) => {
                const fill = resolveSwatchColor(
                  entry.name,
                  variants.find((v) => v.color === entry.name)?.colorCode,
                );
                const light = fill === "#f5f5f5" || fill === "#e8dcc8" || fill === "#d4b896";
                return (
                  <div
                    key={`${entry.name}-${i}`}
                    className="flex flex-col items-center gap-1 animate-in fade-in zoom-in-90 duration-300 fill-mode-both"
                    style={{ animationDelay: `${i * 40}ms` }}
                    title={entry.name}
                  >
                    <div
                      className={`w-7 h-7 rounded-full border-2 shadow-inner transition-transform hover:scale-110 ${
                        entry.inStock ? "border-zinc-600" : "border-zinc-700 opacity-40"
                      } ${light ? "ring-1 ring-zinc-600" : ""}`}
                      style={{ backgroundColor: fill }}
                    />
                    <span className="text-[9px] text-zinc-500 max-w-[48px] truncate">{entry.name}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {kind === "size" && (
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wide text-zinc-500 font-medium">Bedenler</p>
            <div className="flex flex-wrap gap-1.5 max-w-[272px]">
              {sizes.map((entry, i) => (
                <span
                  key={`${entry.name}-${i}`}
                  className={`inline-flex min-w-[2rem] justify-center px-2 py-1 rounded-md text-[11px] font-medium border animate-in fade-in slide-in-from-bottom-1 duration-300 fill-mode-both ${
                    entry.inStock
                      ? "border-emerald-800/50 bg-emerald-950/40 text-emerald-300"
                      : "border-zinc-700 bg-zinc-900/60 text-zinc-500 line-through opacity-60"
                  }`}
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  {entry.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {kind === "variant" && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] uppercase tracking-wide text-zinc-500 font-medium">Varyant özeti</p>
              <span className="text-[10px] text-emerald-400/90 tabular-nums">
                {inStockCount}/{variants.length} stokta
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1 max-h-[140px] overflow-y-auto pr-0.5">
              {variants.slice(0, 24).map((v, i) => {
                const swatch = resolveSwatchColor(v.color, v.colorCode);
                return (
                  <div
                    key={`${v.color}-${v.size}-${i}`}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-[10px] animate-in fade-in slide-in-from-left-1 duration-300 fill-mode-both ${
                      v.inStock
                        ? "border-zinc-700/80 bg-zinc-900/70 text-zinc-300"
                        : "border-zinc-800 bg-zinc-950/50 text-zinc-600 opacity-55"
                    }`}
                    style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0 ring-1 ring-zinc-600/50"
                      style={{ backgroundColor: swatch }}
                    />
                    <span className="truncate flex-1 min-w-0">
                      {v.color && v.size ? `${v.color} · ${v.size}` : v.size || v.color || "—"}
                    </span>
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${v.inStock ? "bg-emerald-500" : "bg-zinc-600"}`}
                    />
                  </div>
                );
              })}
            </div>
            {variants.length > 24 && (
              <p className="text-[10px] text-zinc-500 text-center">+{variants.length - 24} varyant daha</p>
            )}
          </div>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}

export interface CSVPreviewData {
  id: string;
  productTitle: string;
  csvContent: string;
  sourceUrl?: string;
  canonicalProduct?: {
    variants?: Array<{ color: string; size: string; inStock: boolean }>;
    manualReviewRequired?: boolean;
    shopifyUploadBlocked?: boolean;
    blockReason?: string;
  };
  variantBlockReason?: string;
  scrapeRunId?: string;
  variants: {
    colors: string[];
    sizes: string[];
    allVariants?: Array<{
      color: string;
      colorCode: string;
      size: string;
      inStock: boolean;
    }>;
    items?: Array<{
      color: string;
      size: string;
      key: string;
      inStock: boolean;
      disabledReason?: string;
      source?: string;
    }>;
    stockMap?: Record<string, boolean>;
  };
  stockSummary?: {
    productInStock: boolean;
    totalVariants: number;
    inStockVariants: number;
    outOfStockVariants: number;
    confidence: "high" | "medium" | "low";
  };
  images: string[];
  price?: {
    original: number;
    withProfit: number;
  };
  brand?: string;
  createdAt: string;
  description?: string;
  category?: string;
  features?: Array<{ key: string; value: string }>;
  csvPreview?: {
    headers?: string[];
    rows?: string[][];
    rowCount?: number;
  };
  csvInfo?: CsvStatusResponse;
  restoredFromDisk?: boolean;
  approvedForShopify?: boolean;
  shopifyUploadBlocked?: boolean;
  blockReason?: string;
  titleSource?: string;
}

export interface ProductPreviewProps {
  preview: CSVPreviewData;
  imageIndex: number;
  tags: string[];
  onPrevImage: () => void;
  onNextImage: () => void;
  onSelectImage?: (index: number) => void;
  onRemoveTag: (tagIndex: number) => void;
  onAddTag: (tag: string) => void;
  selected?: boolean;
  onSelectChange?: () => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onDownload?: () => void;
  onShopifyUpload?: () => void;
  isUploading?: boolean;
  uploadDisabled?: boolean;
  uploadDisabledReason?: string;
  csvHeaders?: string[];
  csvRows?: string[][];
}

export const ProductPreview = memo(function ProductPreview({
  preview,
  imageIndex,
  tags,
  onPrevImage,
  onNextImage,
  onSelectImage,
  onRemoveTag,
  onAddTag,
  selected,
  onSelectChange,
  isExpanded,
  onToggleExpand,
  onDownload,
  onShopifyUpload,
  isUploading,
  uploadDisabled,
  uploadDisabledReason,
  csvHeaders = [],
  csvRows = [],
}: ProductPreviewProps) {
    const safeTitle =
      typeof preview.productTitle === "string" && preview.productTitle.trim()
        ? preview.productTitle.trim()
        : "Ürün";

    const safeCsvContent =
      typeof preview.csvContent === "string"
        ? preview.csvContent
        : "";

    const safeImages = Array.isArray(preview.images)
      ? preview.images.filter(
          (image): image is string =>
            typeof image === "string" && image.trim().length > 0,
        )
      : [];

    const safeVariants =
      preview.variants && typeof preview.variants === "object"
        ? preview.variants
        : {
            colors: [],
            sizes: [],
            allVariants: [],
          };

    const safePreview: CSVPreviewData = {
      ...preview,
      productTitle: safeTitle,
      csvContent: safeCsvContent,
      images: safeImages,
      variants: safeVariants,
    };

    const parseCsvLine = (line: string): string[] => {
      const result: string[] = [];
      let current = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === "," && !inQuotes) {
          result.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };

    const canonicalPreview = resolvePreviewVariants({
      canonicalProduct: safePreview.canonicalProduct,
      variants: safePreview.variants,
    });

    const variantsFromCsv = (() => {
      const lines = safeCsvContent.split("\n").filter((line) => line.trim());
      if (lines.length < 2) {
        return { colors: [] as string[], sizes: [] as string[], allVariants: [] as Array<{ color: string; size: string; inStock: boolean }> };
      }
      const headers = parseCsvLine(lines[0]).map((h) => h.replace(/^"|"$/g, "").trim());
      const lowerHeaders = headers.map((h) => h.toLowerCase());
      const opt1NameIdx = lowerHeaders.findIndex((h) => h.includes("option1 name") || h === "option1 name");
      const opt1ValIdx = lowerHeaders.findIndex((h) => h.includes("option1 value") || h === "option1 value");
      const opt2ValIdx = lowerHeaders.findIndex((h) => h.includes("option2 value") || h === "option2 value");

      const colors = new Set<string>();
      const sizes = new Set<string>();
      const allVariants: Array<{ color: string; size: string; inStock: boolean }> = [];

      for (const line of lines.slice(1)) {
        const cells = parseCsvLine(line).map((c) => c.replace(/^"|"$/g, "").trim());
        const opt1Name = opt1NameIdx >= 0 ? cells[opt1NameIdx] : "";
        const opt1Val = opt1ValIdx >= 0 ? cells[opt1ValIdx] : "";
        const opt2Val = opt2ValIdx >= 0 ? cells[opt2ValIdx] : "";
        if (!opt1Val && !opt2Val) continue;

        let color = "";
        let size = "";
        if (/renk|color/i.test(opt1Name)) {
          color = opt1Val;
          size = opt2Val;
        } else if (/beden|size/i.test(opt1Name)) {
          size = opt1Val;
          color = opt2Val;
        } else if (opt2Val) {
          color = opt1Val;
          size = opt2Val;
        } else {
          size = opt1Val;
        }

        if (color) colors.add(color);
        if (size) sizes.add(size);
        allVariants.push({ color, size, inStock: true });
      }

      return {
        colors: [...colors],
        sizes: [...sizes],
        allVariants,
      };
    })();

    const sanitizedFromPayload =
      canonicalPreview.variants.length > 0
        ? sanitizeTrendyolVariants(
            {
              colors: [...new Set(canonicalPreview.variants.map((v) => v.color))],
              sizes: canonicalPreview.sizes,
              allVariants: canonicalPreview.variants,
              items: canonicalPreview.variants,
            },
            { productTitle: safeTitle },
          )
        : sanitizeTrendyolVariants(safePreview.variants, {
            productTitle: safeTitle,
          });
    const sanitizedFromCsv = sanitizeTrendyolVariants(variantsFromCsv, {
      productTitle: safeTitle,
    });
    const sanitizedVariants = pickVariantsForPreview(sanitizedFromPayload, sanitizedFromCsv);
    const stockSummary = summarizeVariantStock(sanitizedVariants);
    const { urls: previewImages } = resolvePreviewImagesForEntry({
      images: safeImages,
      csvContent: safeCsvContent,
    });
    const safeImageIndex =
      previewImages.length > 0
        ? Math.min(Math.max(0, imageIndex), previewImages.length - 1)
        : 0;
    const hasMultipleImages = previewImages.length > 1;
    const currentImageUrl = previewImages[safeImageIndex] ?? "";
    
    // Extract tracking ID from CSV
    const getTrackingId = () => {
      const lines = safeCsvContent.split('\n').filter(line => line.trim());
      if (lines.length < 2) return null;
      
      // Parse CSV with proper comma splitting (handling quoted values)
      const parseCSVLine = (line: string) => {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        result.push(current.trim());
        return result;
      };
      
      const headers = parseCSVLine(lines[0]).map(h => h.replace(/"/g, '').trim());
      const firstDataRow = parseCSVLine(lines[1]).map(cell => cell.replace(/"/g, '').trim());
      
      // Find the metafield column
      const metafieldIndex = headers.findIndex(h => 
        h.includes('Metafield') && h.includes('custom.repli_t_id')
      );
      
      if (metafieldIndex !== -1 && firstDataRow[metafieldIndex]) {
        return firstDataRow[metafieldIndex];
      }
      
      return null;
    };
    
    const trackingId = getTrackingId();
    
    // Enhanced price parsing from CSV with multiple strategies
    const parsePriceFromCSV = () => {
      const rawPrice = preview.price as
        | { original?: number; withProfit?: number }
        | number
        | undefined;

      if (typeof rawPrice === "number" && rawPrice > 0) {
        return {
          original: rawPrice,
          withProfit: Math.round(rawPrice * 1.10 * 100) / 100,
        };
      }

      if (rawPrice && typeof rawPrice === "object" && (rawPrice.original ?? 0) > 0) {
        return {
          original: rawPrice.original!,
          withProfit:
            rawPrice.withProfit ??
            Math.round(rawPrice.original! * 1.10 * 100) / 100,
        };
      }
      
      // Try to extract price from CSV content with advanced parsing
      const lines = safeCsvContent.split('\n').filter(line => line.trim());
      if (lines.length < 2) return { original: 0, withProfit: 0 };
      
      // Parse CSV with proper comma splitting (handling quoted values)
      const parseCSVLine = (line: string) => {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        result.push(current.trim());
        return result;
      };
      
      const headers = parseCSVLine(lines[0]).map(h => h.replace(/"/g, '').trim());
      const firstDataRow = parseCSVLine(lines[1]).map(cell => cell.replace(/"/g, '').trim());
      
      const priceIndicators = [
        'Variant Price', 'Price', 'price', 'Fiyat', 'fiyat',
        'Cost', 'cost', 'Amount', 'amount', 'Value', 'value'
      ];
      
      let priceValue = 0;
      
      // Strategy 1: Find price column by header name
      for (const indicator of priceIndicators) {
        const priceIndex = headers.findIndex(h => h.includes(indicator));
        if (priceIndex !== -1 && firstDataRow[priceIndex]) {
          const extracted = parseFloat(firstDataRow[priceIndex].replace(/[^0-9.,]/g, '').replace(',', '.'));
          if (extracted > 0) {
            priceValue = extracted;
            break;
          }
        }
      }
      
      // Strategy 2: Search all cells for price-like values
      if (priceValue === 0) {
        for (const cell of firstDataRow) {
          const cleaned = cell.replace(/[^0-9.,]/g, '').replace(',', '.');
          const extracted = parseFloat(cleaned);
          if (extracted > 10 && extracted < 10000) {
            priceValue = extracted;
            break;
          }
        }
      }
      
      // Strategy 3: Extract from title
      if (priceValue === 0) {
        const title = safeTitle;
        const priceMatch = title.match(/(\d+[.,]\d+|\d+)\s*(?:TL|₺|lira)/i);
        if (priceMatch) {
          priceValue = parseFloat(priceMatch[1].replace(',', '.'));
        }
      }
      
      if (priceValue > 0) {
        return {
          original: Math.round(priceValue), // Use the actual price from CSV
          withProfit: Math.round(priceValue * 1.1) // Apply 10% markup
        };
      }
      
      return { original: 0, withProfit: 0 };
    };
    
    const prices = (() => {
      const fromPreview = normalizeTrendyolDisplayPrice(safePreview.price, 0.1);
      if (fromPreview.original > 0) return fromPreview;
      const fromCsv = parsePriceFromCSV();
      return normalizeTrendyolDisplayPrice(
        { original: fromCsv.original, withProfit: fromCsv.withProfit },
        0.1,
      );
    })();

    const sizeCount = stockSummary.sizes.length;
    const colorCount = stockSummary.colors.length;
    const variantCount = sanitizedVariants.allVariants.length;
    const imageCount = previewImages.length;

    const hasCsvTable = csvHeaders.length > 0 && csvRows.length > 0;

    const colorEntries = stockSummary.colors.map((entry) => ({
      name: entry.name,
      inStock: entry.inStock,
      colorCode: sanitizedVariants.allVariants.find((v) => v.color === entry.name)?.colorCode,
    }));

    const statCards: Array<{
      label: string;
      value: number;
      kind: StatPreviewKind;
      show: boolean;
    }> = [
      { label: "Görsel", value: imageCount, kind: "image", show: imageCount > 0 },
      { label: "Renk", value: colorCount, kind: "color", show: colorCount > 0 },
      { label: "Beden", value: sizeCount, kind: "size", show: sizeCount > 0 },
      { label: "Varyant", value: variantCount, kind: "variant", show: variantCount > 0 },
    ];

    return (
      <Card className="bg-zinc-950/70 border border-zinc-800/90 rounded-xl overflow-hidden shadow-sm hover:border-zinc-700/80 transition-colors">
        <CardContent className="p-0">
          {/* Üst satır — geniş özet */}
          <div className="flex items-stretch gap-0 min-h-[148px]">
            {onSelectChange && (
              <div className="flex items-start pt-5 pl-4 pr-1">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={onSelectChange}
                  className="w-4 h-4 rounded border-zinc-600 text-emerald-500 focus:ring-emerald-600/40 focus:ring-offset-zinc-950 cursor-pointer"
                />
              </div>
            )}

            {/* Görsel */}
            <div className="relative w-[168px] min-w-[168px] m-4 rounded-lg overflow-hidden bg-zinc-900 border border-zinc-800">
              {currentImageUrl ? (
                <>
                  <PreviewCarouselImage
                    directUrl={currentImageUrl}
                    alt={safeTitle}
                    onFailed={() => {
                      if (previewImages.length > 1) {
                        onSelectImage?.((safeImageIndex + 1) % previewImages.length);
                      }
                    }}
                  />
                  {hasMultipleImages && (
                    <>
                      <button
                        type="button"
                        onClick={onPrevImage}
                        className="absolute left-1.5 top-1/2 -translate-y-1/2 bg-black/60 text-white p-1 rounded-full hover:bg-black/80"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={onNextImage}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-black/60 text-white p-1 rounded-full hover:bg-black/80"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                      <div className="absolute bottom-2 left-0 right-0 text-center text-[10px] text-white/80 bg-black/40 py-0.5">
                        {safeImageIndex + 1} / {previewImages.length}
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="w-full h-full min-h-[140px] flex items-center justify-center text-zinc-500">
                  <Package className="w-8 h-8" />
                </div>
              )}
            </div>

            {/* Orta — bilgi */}
            <div className="flex-1 min-w-0 py-4 pr-4 flex flex-col justify-between gap-3">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {preview.brand && (
                    <span className="text-[11px] uppercase tracking-wide text-zinc-500 font-medium">
                      {preview.brand}
                    </span>
                  )}
                  {preview.restoredFromDisk && (
                    <Badge variant="outline" className="border-amber-700/50 text-amber-300 text-[10px] h-5">
                      Diskten geri yüklendi
                    </Badge>
                  )}
                  {trackingId && (
                    <Badge className="bg-violet-950/50 text-violet-300 text-[10px] h-5 font-mono">
                      {trackingId}
                    </Badge>
                  )}
                </div>
                <h3 className="text-zinc-100 font-medium text-base leading-snug line-clamp-2">
                  {safeTitle}
                </h3>

                <div className="flex flex-wrap gap-2">
                  {statCards
                    .filter((s) => s.show)
                    .map((stat) => (
                      <StatPreviewCard
                        key={stat.label}
                        label={stat.label}
                        value={stat.value}
                        kind={stat.kind}
                        images={previewImages}
                        colors={colorEntries}
                        sizes={stockSummary.sizes}
                        variants={sanitizedVariants.allVariants}
                        productTitle={safeTitle}
                      />
                    ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {prices.original > 0 && (
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900/90 border border-zinc-800 text-sm">
                    <span className="text-zinc-500">Alış</span>
                    <span className="text-orange-300 font-semibold tabular-nums">
                      {formatOriginalPrice(prices)}
                    </span>
                    <span className="text-zinc-600">→</span>
                    <span className="text-zinc-500">Satış</span>
                    <span className="text-emerald-400 font-semibold tabular-nums">
                      {formatSalePrice(prices)}
                    </span>
                    <Badge variant="outline" className="border-emerald-800/50 text-emerald-400 text-[10px] h-5">
                      {formatProfitPercentage(prices)}
                    </Badge>
                  </div>
                )}
                {preview.stockSummary && (
                  <span className="text-xs text-zinc-500">
                    Stok:{" "}
                    <span className="text-zinc-300">
                      {preview.stockSummary.inStockVariants}/{preview.stockSummary.totalVariants}
                    </span>{" "}
                    aktarılacak
                  </span>
                )}
              </div>
            </div>

            {/* Sağ — aksiyonlar */}
            <div className="flex flex-col justify-center gap-2 p-4 border-l border-zinc-800/80 bg-zinc-900/30 min-w-[52px]">
              {onDownload && (
                <Button
                  type="button"
                  onClick={onDownload}
                  variant="outline"
                  size="sm"
                  className="h-9 w-9 p-0 border-zinc-700 text-emerald-400 hover:bg-emerald-950/30"
                  title="CSV İndir"
                >
                  <Download className="w-4 h-4" />
                </Button>
              )}
              {onShopifyUpload && (
                <Button
                  type="button"
                  onClick={onShopifyUpload}
                  size="sm"
                  disabled={uploadDisabled || isUploading}
                  className="h-9 w-9 p-0 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50"
                  title={uploadDisabledReason || "Shopify'a Aktar"}
                >
                  {isUploading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ShoppingCart className="w-4 h-4" />
                  )}
                </Button>
              )}
              {onToggleExpand && (
                <Button
                  type="button"
                  onClick={onToggleExpand}
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 p-0 text-zinc-400 hover:text-zinc-200"
                  title={isExpanded ? "Daralt" : "Detayları göster"}
                >
                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </Button>
              )}
            </div>
          </div>

          {/* Etiketler — her zaman görünür, sade şerit */}
          <div className="px-4 pb-3 flex flex-wrap items-center gap-1.5 border-t border-zinc-800/60 pt-3 bg-zinc-900/20">
            <Tag className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
            {tags.map((tag, index) => (
              <Badge
                key={`manual-${index}`}
                variant="outline"
                className="border-cyan-800/40 text-cyan-300 text-xs h-6 gap-1 group"
              >
                {tag}
                <X
                  className="w-3 h-3 cursor-pointer opacity-50 group-hover:opacity-100 text-red-400"
                  onClick={() => onRemoveTag(index)}
                />
              </Badge>
            ))}
            <input
              type="text"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const input = e.target as HTMLInputElement;
                  const newTag = input.value.trim();
                  if (newTag && !isBlockedShopifyTag(newTag)) {
                    onAddTag(newTag);
                    input.value = "";
                  }
                }
              }}
              placeholder="Etiket ekle (Enter)"
              className="h-7 min-w-[140px] flex-1 max-w-xs text-xs bg-zinc-950 border border-zinc-800 rounded-md px-2 text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
              data-testid={`input-add-tag-${preview.id}`}
            />
          </div>

          {/* Genişletilmiş detay */}
          {isExpanded && (
            <div className="border-t border-zinc-800/80 px-4 py-4 space-y-4 bg-zinc-950/50">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                    Renkler ({colorCount})
                  </p>
                  <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
                    {stockSummary.colors.length > 0 ? (
                      stockSummary.colors.map((entry, idx) => (
                        <Badge
                          key={idx}
                          variant="outline"
                          className={
                            entry.inStock
                              ? "border-cyan-800/40 text-cyan-300 text-xs"
                              : "border-zinc-700 text-zinc-500 text-xs line-through opacity-60"
                          }
                        >
                          {entry.name}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-zinc-600">—</span>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                    Bedenler ({sizeCount})
                  </p>
                  <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
                    {stockSummary.sizes.length > 0 ? (
                      stockSummary.sizes.map((entry, idx) => (
                        <Badge
                          key={idx}
                          variant="outline"
                          className={
                            entry.inStock
                              ? "border-emerald-800/40 text-emerald-300 text-xs"
                              : "border-zinc-700 text-zinc-500 text-xs line-through opacity-60"
                          }
                        >
                          {entry.name}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-zinc-600">—</span>
                    )}
                  </div>
                </div>
              </div>

              {hasCsvTable ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <FileText className="w-3.5 h-3.5" />
                    CSV önizleme (ilk {csvRows.length} satır)
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-zinc-800 bg-zinc-900/80">
                          {csvHeaders.slice(0, 8).map((header, index) => (
                            <th
                              key={index}
                              className="text-left p-2.5 text-zinc-400 font-medium whitespace-nowrap"
                            >
                              {header}
                            </th>
                          ))}
                          {csvHeaders.length > 8 && (
                            <th className="p-2.5 text-zinc-500">…</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {csvRows.map((row, rowIndex) => (
                          <tr
                            key={rowIndex}
                            className="border-b border-zinc-900 hover:bg-zinc-900/40"
                          >
                            {row.slice(0, 8).map((cell, cellIndex) => (
                              <td
                                key={cellIndex}
                                className="p-2.5 text-zinc-300 max-w-[180px] truncate"
                              >
                                {cell || "—"}
                              </td>
                            ))}
                            {row.length > 8 && <td className="p-2.5 text-zinc-600">…</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-zinc-500 text-center py-4">
                  CSV henüz oluşturulmadı
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
});
