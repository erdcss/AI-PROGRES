import { useState, useEffect, useCallback, startTransition, useRef, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, ShoppingCart, Link, Copy, X, Home, Plus, Trash2, Package, Palette, Eye, Image, FileText, Shirt, Bell, ChevronDown, ChevronUp, ArrowLeft, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CSVPreview } from "@/components/CSVPreview";
import { CSVDrawerPreview } from "@/components/CSVDrawerPreview";
import * as Collapsible from "@radix-ui/react-collapsible";

import { ScrapeSourceErrorAlert, type ScrapeErrorMeta } from "@/components/ScrapeSourceErrorAlert";
import { LocalAgentWarningAlert, resolveScrapeSourceWarning } from "@/components/LocalAgentWarningAlert";
import { ScrapeFetchError } from "@/lib/scrape-url-client";
import { toast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useIsMobile } from "@/hooks/use-mobile";
import ShopifySettingsDialog from "@/components/ShopifySettingsDialog";
import MiniBrowser from "@/components/MiniBrowser";
import { UrlHistory } from "@/components/UrlHistory";
import { addRecentUrl, clearRecentUrls } from "@/lib/url-history-client";
import { fetchShopifyCsvStatus } from "@/lib/shopify-csv-download";
import { clearScraperUiStorage } from "@/lib/scraper-state-persist";
import { resolvePreviewImageUrl, resolvePreviewImageUrls, resolvePreviewProxyUrl } from "@/lib/product-image-url";
import { resolveProductPreview } from "@/lib/product-preview-resolver";
import {
  buildIngestFingerprint,
  dedupeNormalizedUrls,
  extractDroppedUrls,
  mergeUrlsIntoQueue,
  normalizeProductUrl,
  parseUrlsFromText,
  shouldSkipDuplicateIngest,
  type UrlIngestSource,
  type UrlQueueItem,
  type UrlQueueStatus,
} from "@/lib/scraper-url-utils";
import {
  buildCsvPreviewEntry,
  fetchScenarioScrapeResult,
  hasCsvPreviewData,
  type ScrapedUrlPayload,
} from "@/lib/scrape-url-client";
import {
  hasRealTrendyolVariants,
  isPlaceholderColor,
  isPlaceholderSize,
  sanitizeTrendyolVariants,
} from "@shared/trendyol-variant-utils";
import { formatOriginalPrice, formatSalePrice, normalizeTrendyolDisplayPrice } from "@/utils/price-utils";


const scrapeSchema = z.object({
  url: z.string().optional(),
});

const multiUrlSchema = z.object({
  urls: z.array(z.object({
    url: z.string().url("Geçerli bir URL giriniz").refine(
      (url) => url.includes("trendyol.com"),
      "Sadece Trendyol URL'leri desteklenmektedir"
    )
  })).min(1, "En az bir URL gerekli")
});

type ScrapeFormData = z.infer<typeof scrapeSchema>;
type MultiUrlFormData = z.infer<typeof multiUrlSchema>;

type ScrapingMode = 'single' | 'multi-url';

const URL_STATUS_LABEL: Record<UrlQueueStatus, string> = {
  pending: 'Bekliyor',
  processing: 'İşleniyor',
  success: 'Başarılı',
  error: 'Hata',
};

function buildCsvShopifyUploadBody(
  preview: {
    productTitle?: string;
    sourceUrl?: string;
    brand?: string;
    description?: string;
    price?: { original?: number; withProfit?: number };
    images?: string[];
    variants?: unknown;
    features?: Array<{ key: string; value: string }>;
    category?: string;
    csvInfo?: unknown;
    csvPreview?: unknown;
  },
  csvContent: string,
  individualTags: string[],
) {
  return {
    productData: {
      title: preview.productTitle,
      brand: preview.brand,
      description: preview.description,
      category: preview.category,
      price: preview.price,
      images: preview.images,
      sourceUrl: preview.sourceUrl,
      variants: preview.variants,
      features: preview.features || [],
      csvContent,
      csvInfo: preview.csvInfo,
      csvPreview: preview.csvPreview,
    },
    csvContent,
    csvInfo: preview.csvInfo,
    productTitle: preview.productTitle,
    sourceUrl: preview.sourceUrl,
    individualTags,
  };
}

interface Product {
  id?: string;
  title: string;
  price?: number | { profitFormatted?: string; formatted?: string; original?: number; withProfit?: number };
  images?: Array<string | { url: string; alt?: string }>;
  description?: string;
  brand?: string;
  variants?: {
    colors?: string[];
    sizes?: string[];
    allVariants?: Array<{
      color: string;
      colorCode?: string;
      size: string;
      inStock: boolean;
    }>;
  };
  stockAnalysis?: {
    totalVariants: number;
    inStockVariants: number;
    outOfStockVariants: number;
    availableSizes: string[];
    unavailableSizes: string[];
  };
  features?: Array<{ key: string; value: string }>;
  tags?: string[];
  category?: string;
  success?: boolean;
  extractionMethod?: string;
  csvContent?: string;
  csvPreview?: {
    headers: string[];
    rows: string[][];
    rowCount?: number;
  };
  csvInfo?: {
    filename: string;
    downloadUrl: string;
    ready: boolean;
    productCount: number;
  };
  usableForCsv?: boolean;
  usableForShopify?: boolean;
  blockedForExport?: boolean;
  partialSuccess?: boolean;
  titleSource?: string;
  finalSuccessReason?: string;
  warnings?: string[];
  sourceUrl?: string;
  originalUrl?: string;
}

function ScraperPage() {
  const [product, setProduct] = useState<Product | null>(null);
  const [, setLocation] = useLocation();
  const [scrapingMode, setScrapingMode] = useState<ScrapingMode>('single');
  const [allImages, setAllImages] = useState<any[]>([]);
  const [productFeatures, setProductFeatures] = useState<any[]>([]);
  const [urlQueue, setUrlQueue] = useState<UrlQueueItem[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [csvPreviews, setCsvPreviews] = useState<any[]>([]);
  const [individualTags, setIndividualTags] = useState<{[key: string]: string[]}>({});
  const extractAllColors = true; // Always extract all colors automatically
  const [isVariantsOpen, setIsVariantsOpen] = useState(false);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{current: number; total: number} | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{current: number; total: number; successCount: number; failCount: number; currentTitle: string} | null>(null);
  const [failedUploads, setFailedUploads] = useState<{title: string; error: string}[]>([]);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [scrapeErrorMeta, setScrapeErrorMeta] = useState<ScrapeErrorMeta | null>(null);
  const [localAgentWarningDetail, setLocalAgentWarningDetail] = useState<string | null>(null);
  const [scrapeSourceWarning, setScrapeSourceWarning] = useState<string | null>(null);
  const [lastScrapeUrl, setLastScrapeUrl] = useState<string | null>(null);
  const [workflowStep, setWorkflowStep] = useState<string | null>(null);
  const [lastShopifyResult, setLastShopifyResult] = useState<{
    adminUrl?: string;
    shopifyId?: string;
    error?: string;
  } | null>(null);
  const [scrapedOriginalTitle, setScrapedOriginalTitle] = useState<string | null>(null);
  const [titleApproved, setTitleApproved] = useState(false);
  const isMobile = useIsMobile();
  const urlQueueRef = useRef<UrlQueueItem[]>([]);
  const lastUrlIngestRef = useRef<{ fingerprint: string; at: number } | null>(null);
  urlQueueRef.current = urlQueue;
  
  const singleForm = useForm<ScrapeFormData>({
    resolver: zodResolver(scrapeSchema),
    defaultValues: {
      url: "",
    },
  });

  const multiForm = useForm<MultiUrlFormData>({
    resolver: zodResolver(multiUrlSchema),
    defaultValues: {
      urls: [{ url: "" }]
    },
  });

  useEffect(() => {
    clearScraperUiStorage();
    clearRecentUrls();
  }, []);


  const singleScrapeMutation = useMutation({
    onMutate: () => {
      setScrapeError(null);
      setScrapeErrorMeta(null);
      setLocalAgentWarningDetail(null);
      setScrapeSourceWarning(null);
      setWorkflowStep('URL alındı → Ürün çekiliyor...');
      toast({
        title: "⚙️ Arka Planda Çalışıyor",
        description: "Ürün verisi çekiliyor. Bu sayfa açık kaldığı sürece işlem devam eder.",
        duration: 6000,
      });
    },
    mutationFn: async (data: ScrapeFormData & { onlyExtractData?: boolean }) => {
      const scrapeUrl = normalizeProductUrl(data.url ?? "");
      setLastScrapeUrl(scrapeUrl || null);
      if (!scrapeUrl) {
        throw new Error("Geçerli bir Trendyol, Arçelik veya PttAVM URL'si gerekli");
      }

      // Shopify URL'lerini tespit et ve doğru endpoint'e yönlendir
      if (scrapeUrl.includes('.myshopify.com') || scrapeUrl.includes('shopify.com')) {
        // Bu bir Shopify URL'si - CSV generation endpoint'ine git
        console.log('🛒 Shopify URL detected, redirecting to CSV generation');
        const response = await fetch("/api/generate-multi-variant-csv", {
          method: "POST", 
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ 
            productData: { 
              url: scrapeUrl, 
              title: "Shopify Product",
              tags: []
            }
          }),
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || `HTTP ${response.status}`);
        }
        const result = await response.json();
        return { ...result, originalUrl: scrapeUrl };
      }
      
      // Toplu çekim ile aynı normalize + poll mantığı
      return fetchScenarioScrapeResult(scrapeUrl, data.onlyExtractData ?? true);
    },
    onSuccess: async (data: ScrapedUrlPayload | Record<string, unknown>) => {
      // Shopify CSV yolu farklı payload döner
      if (!("price" in data) || typeof (data as ScrapedUrlPayload).price?.original !== "number") {
        const legacy = data as Record<string, unknown>;
        if (legacy.success === false) {
          const errMsg = String(legacy.message || legacy.error || "Ürün verileri çekilemedi");
          setScrapeError(errMsg);
          setWorkflowStep(null);
          toast({ title: "⚠️ Ürün Verileri Çekilemedi", description: errMsg, variant: "destructive" });
          return;
        }
      }

      const scraped = data as ScrapedUrlPayload;
      console.log("🎯 Single scrape successful (normalized):", {
        title: scraped.title,
        imagesCount: scraped.images.length,
        price: scraped.price,
      });

      setWorkflowStep("Ürün normalize edildi");
      setScrapeError(null);

      const sourceWarning = resolveScrapeSourceWarning(scraped.warnings);
      setScrapeSourceWarning(sourceWarning);
      setLocalAgentWarningDetail(
        sourceWarning
          ? scraped.stageErrors?.find((e) => e.includes("browser-worker") || e.includes("local-agent")) ??
              sourceWarning
          : null,
      );

      let csvInfo = scraped.csvInfo as Product["csvInfo"];
      try {
        const csvStatus = await fetchShopifyCsvStatus();
        if (csvStatus.ready) {
          csvInfo = {
            filename: csvStatus.filename || "shopify-urunler.csv",
            downloadUrl: csvStatus.downloadUrl || "/api/download/shopify-urunler.csv",
            ready: true,
            productCount: csvStatus.productCount ?? 0,
          };
        } else if (!csvInfo) {
          csvInfo = {
            filename: "shopify-urunler.csv",
            downloadUrl: "/api/download/shopify-urunler.csv",
            ready: false,
            productCount: 0,
          };
        }
      } catch (statusError) {
        console.warn("CSV status doğrulaması başarısız:", statusError);
      }

      const csvReady = csvInfo?.ready === true;
      const sourceUrl =
        scraped.sourceUrl || scraped.originalUrl || singleForm.getValues("url");

      const transformedProduct: Product = {
        id: `product-${Date.now()}`,
        title: scraped.title,
        brand: scraped.brand || "",
        price: scraped.price,
        description: scraped.description || "",
        images: scraped.images,
        variants: scraped.variants,
        features: scraped.features || [],
        stockAnalysis: scraped.stockAnalysis,
        tags: scraped.tags || [],
        category: scraped.category || "",
        success: scraped.success !== false,
        partialSuccess: scraped.partialSuccess,
        extractionMethod: scraped.extractionMethod,
        csvContent: scraped.csvContent,
        csvPreview: scraped.csvPreview,
        csvInfo,
        usableForCsv: scraped.usableForCsv,
        usableForShopify: scraped.usableForShopify,
        blockedForExport: scraped.blockedForExport,
        titleSource: scraped.titleSource,
        finalSuccessReason: scraped.finalSuccessReason,
        warnings: scraped.warnings,
        sourceUrl,
        originalUrl: scraped.originalUrl,
      };

      setProduct(transformedProduct);
      setScrapedOriginalTitle(scraped.title);
      setTitleApproved(false);
      if (sourceUrl) {
        addRecentUrl(sourceUrl);
      }
      setWorkflowStep(
        csvReady
          ? "Ürün hazır — Shopify'a gönderebilirsiniz"
          : "Ürün çekildi ama CSV oluşturulamadı",
      );

      requestAnimationFrame(() => {
        document
          .getElementById("product-preview-section")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });

      const newCSVPreview = buildCsvPreviewEntry(scraped, sourceUrl, "csv");
      setCsvPreviews((prev) => [newCSVPreview, ...prev]);

      const isPartial = scraped.partialSuccess === true || scraped.success === false;
      const missingParts: string[] = [];
      if (!scraped.price?.original || scraped.price.original <= 0) missingParts.push("fiyat yok");
      if (!scraped.images?.length) missingParts.push("görsel yok");
      if (scraped.titleSource === "url-slug") missingParts.push("başlık yalnızca URL'den");
      if (sourceWarning) missingParts.push("HTML/varyant eksik — Worker/Agent kontrol edin");

      toast({
        title: sourceWarning
          ? sourceWarning === "browser_worker_unreachable"
            ? "Kısmi Veri (Browser Worker)"
            : "Kısmi Veri (Local Agent)"
          : isPartial
            ? "Kısmi Veri"
            : csvReady
              ? "Başarılı"
              : "Uyarı",
        description: isPartial
          ? `Ürün kısmen çekildi${missingParts.length ? ` — ${missingParts.join(", ")}` : ""}. Shopify aktarımı için fiyat zorunludur.`
          : csvReady
            ? "Ürün hazır — Shopify'a gönderebilirsiniz"
            : scraped.price?.original && scraped.price.original > 0
              ? "Ürün çekildi ama CSV oluşturulamadı"
              : "Fiyat alınamadığı için Shopify aktarımı engellendi",
        variant: isPartial || !csvReady ? "default" : "default",
      });
    },
    onError: (error: any) => {
      const msg = error.message || "Bilinmeyen hata";
      setScrapeError(msg);
      if (error instanceof ScrapeFetchError) {
        setScrapeErrorMeta({
          reason: error.reason,
          userMessage: error.userMessage,
          stageErrors: error.stageErrors,
          stageErrorsHuman: error.stageErrorsHuman,
          finalSuccessReason: error.finalSuccessReason,
        });
      } else {
        setScrapeErrorMeta(null);
      }
      setWorkflowStep(null);
      toast({
        title: "Hata",
        description: msg,
        variant: "destructive",
      });
    },
  });

  // Toplu Shopify yükleme mutation'ı
  const bulkUploadMutation = useMutation({
    mutationFn: async () => {
      const results = [];
      for (const preview of csvPreviews) {
        try {
          // Manuel eklenen etiketleri al
          const allTags = individualTags[preview.id] || [];
          
          console.log('🏷️ Uploading with tags:', {
            previewId: preview.id,
            individualTags: allTags,
            totalTags: allTags.length
          });
          
          // ✅ MANUEL ETİKETLERİ CSV'YE EKLE (handleCSVShopifyUpload'dan kopyalandı)
          let csvToUpload = preview.csvContent;
          const manualTags = allTags;
          
          if (manualTags.length > 0) {
            // RFC 4180 uyumlu CSV satır ayırıcı — çok satırlı quoted alanları korur
            const splitCSVRows = (csv: string): string[] => {
              const rows: string[] = [];
              let current = '';
              let inQuotes = false;
              for (let i = 0; i < csv.length; i++) {
                const ch = csv[i];
                if (ch === '"') {
                  // "" → escaped quote içinde, ikisini de ekle
                  if (inQuotes && csv[i + 1] === '"') {
                    current += '""';
                    i++;
                  } else {
                    inQuotes = !inQuotes;
                    current += ch;
                  }
                } else if (ch === '\n' && !inQuotes) {
                  if (current.trim()) rows.push(current);
                  current = '';
                } else {
                  current += ch;
                }
              }
              if (current.trim()) rows.push(current);
              return rows;
            };

            const parseCSVLine = (line: string) => {
              const result: string[] = [];
              let current = '';
              let inQuotes = false;
              for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') {
                  if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++;
                  } else {
                    inQuotes = !inQuotes;
                  }
                } else if (char === ',' && !inQuotes) {
                  result.push(current);
                  current = '';
                } else {
                  current += char;
                }
              }
              result.push(current);
              return result;
            };

            const rows = splitCSVRows(csvToUpload);
            if (rows.length >= 2) {
              const headers = parseCSVLine(rows[0]).map(h => h.trim());
              const tagsIndex = headers.findIndex(h => h.toLowerCase() === 'tags');

              if (tagsIndex !== -1) {
                const updatedRows = [rows[0]];

                for (let i = 1; i < rows.length; i++) {
                  const cells = parseCSVLine(rows[i]);

                  if (cells[tagsIndex] !== undefined) {
                    const existingTags = cells[tagsIndex].trim();
                    const allTagsStr = existingTags
                      ? `${existingTags}, ${manualTags.join(', ')}`
                      : manualTags.join(', ');
                    cells[tagsIndex] = allTagsStr;
                  }

                  const newLine = cells.map(cell => {
                    if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
                      return `"${cell.replace(/"/g, '""')}"`;
                    }
                    return cell;
                  }).join(',');

                  updatedRows.push(newLine);
                }

                csvToUpload = updatedRows.join('\n');
                console.log(`✅ BULK UPLOAD: Manuel etiketler tüm CSV satırlarına eklendi: ${manualTags.join(', ')}`);
              }
            }
          }
          
          // 3 dakika timeout — büyük ürünlerde paralel işlemler zaman alabilir
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3 * 60 * 1000);

          let response: Response;
          try {
            response = await fetch("/api/shopify/upload-csv-product", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: controller.signal,
              body: JSON.stringify(
                buildCsvShopifyUploadBody(preview, csvToUpload, allTags),
              ),
            });
          } finally {
            clearTimeout(timeoutId);
          }

          if (response.ok) {
            const result = await response.json();
            // Hem success:true hem de shopifyId/productId varsa başarılı say
            if (result.success || result.shopifyId || result.productId) {
              results.push({ success: true, title: preview.productTitle, shopifyId: result.shopifyId || result.productId });
            } else if (result.error && result.error.includes('yakın zamanda yüklendi')) {
              // Duplicate check — aslında başarılı upload, sadece tekrar denemesi
              results.push({ success: true, title: preview.productTitle, shopifyId: 'duplicate-blocked' });
            } else {
              results.push({ success: false, title: preview.productTitle, error: result.error || result.message || 'Bilinmeyen hata' });
            }
          } else {
            const errorData = await response.json().catch(() => ({})) as any;
            const errMsg = errorData.error || errorData.message || `HTTP ${response.status}`;
            // 409 = zaten yüklendi → başarı olarak say
            if (response.status === 409 || errMsg.includes('yakın zamanda')) {
              results.push({ success: true, title: preview.productTitle, shopifyId: 'already-exists' });
            } else {
              throw new Error(errMsg);
            }
          }
        } catch (error: any) {
          if (error?.name === 'AbortError') {
            // Timeout — sunucu büyük ihtimalle başarıyla tamamladı, ağ zaman aşımına uğradı
            console.warn('⏱️ Upload timeout — sunucu yüklemeyi tamamlamış olabilir:', preview.productTitle);
            results.push({ success: true, title: preview.productTitle, shopifyId: 'timeout-check-shopify', warning: 'Zaman aşımı — Shopify panelini kontrol edin' });
          } else {
            results.push({ success: false, title: preview.productTitle, error: error.message });
          }
        }
      }
      return results;
    },
    onError: (error) => {
      console.error('Bulk upload error:', error);
      toast({
        title: "Toplu Yükleme Hatası",
        description: "Shopify'a yüklenirken bir hata oluştu",
        variant: "destructive"
      });
    },
    onSuccess: (results) => {
      const successCount = results.filter(r => r.success).length;
      const failCount = results.length - successCount;
      
      toast({
        title: "Toplu Yükleme Tamamlandı",
        description: `${successCount} ürün başarıyla yüklendi${failCount > 0 ? `, ${failCount} ürün başarısız` : ''}`
      });
    }
  });

  const uploadToShopifyMutation = useMutation({
    mutationFn: async (opts?: { dryRun?: boolean }) => {
      if (!product) {
        throw new Error("Önce ürün verisi çekilmelidir");
      }

      setWorkflowStep('Shopify bağlantısı kontrol ediliyor...');
      const connRes = await fetch("/api/shopify/connection-test", { method: "POST" });
      const connData = await connRes.json().catch(() => ({}));
      if (!connRes.ok || !connData.connected) {
        throw new Error(connData.message || 'Shopify bağlantısı kurulamadı — Bağlantı Ayarlarından token girin');
      }

      setWorkflowStep(opts?.dryRun ? 'Dry-run: payload hazırlanıyor...' : 'Shopify\'a gönderiliyor...');
      const response = await fetch(
        opts?.dryRun ? "/api/shopify/products?dryRun=true" : "/api/shopify/products",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productData: product,
            csvContent: product.csvContent,
            csvInfo: product.csvInfo,
            productTitle: product.title,
            sourceUrl: product.sourceUrl || product.originalUrl,
            individualTags: product.tags,
            approvedForShopify: titleApproved || titleEdited,
            titleEdited,
            titleSource: product.titleSource,
            scrapedTitle: scrapedOriginalTitle,
            dryRun: opts?.dryRun,
          }),
        }
      );

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.error || data.message || `HTTP ${response.status}`);
      }
      return data;
    },
    onSuccess: (data) => {
      setLastShopifyResult({
        adminUrl: data.adminUrl,
        shopifyId: data.shopifyId || data.shopifyProductId,
      });
      setWorkflowStep(data.dryRun ? 'Dry-run başarılı' : 'Shopify\'a yüklendi ✅');
      toast({
        title: data.dryRun ? "Dry-run Başarılı" : "Başarılı",
        description: data.dryRun
          ? `Payload doğrulandı — ${data.payload?.variantCount || 0} varyant, ${data.payload?.imageCount || 0} görsel`
          : `Ürün Shopify'a yüklendi (ID: ${data.shopifyId || data.shopifyProductId})`,
      });
    },
    onError: (error: any) => {
      setLastShopifyResult({ error: error.message });
      setWorkflowStep('Shopify yükleme hatası');
      toast({
        title: "Hata",
        description: error.message,
        variant: "destructive"
      });
    }
  });



  const multiUrlScrapeMutation = useMutation({
    mutationFn: async (data: MultiUrlFormData) => {
      const response = await fetch("/api/multi-url-scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ urls: data.urls, mode: 'multi-url' }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }
      const result = await response.json();
      return { ...result, originalUrl: data.urls?.[0]?.url || '' };
    },
    onSuccess: (data) => {
      setProduct(data);
      
      // Multi-URL ürün için CSV preview ekle
      if (data.csvContent) {
        // Multi-URL için unique ID oluştur (title'dan)
        const uniqueId = `csv-multi-${(data.title || 'multi').toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 30)}`;
        
        const newCSVPreview = {
          id: uniqueId,
          productTitle: data.title || 'Multi-Variant Product',
          csvContent: data.csvContent,
          sourceUrl: data.sourceUrl || data.originalUrl || data.url || data.urls?.[0] || '',
          variants: {
            colors: data.variants?.colors || [],
            sizes: data.variants?.sizes || [],
            allVariants: data.variants?.allVariants || []
          },
          images: data.images?.map((img: any) => typeof img === 'string' ? img : img.url) || [],
          createdAt: new Date().toISOString(),
          price: data.price || null // Fiyat bilgisini ekle
        };
        
        // Aynı ID'li preview varsa güncelle, yoksa ekle
        setCsvPreviews(prev => {
          const existingIndex = prev.findIndex(p => p.id === uniqueId);
          if (existingIndex >= 0) {
            const updated = [...prev];
            updated[existingIndex] = newCSVPreview;
            console.log('♻️ Updated existing multi-URL CSV preview');
            return updated;
          } else {
            console.log('➕ Added new multi-URL CSV preview');
            return [newCSVPreview, ...prev];
          }
        });
        
        toast({
          title: "Başarılı",
          description: `${data.variants?.colors?.length || 0} renk varyantı birleştirildi ve CSV eklendi`
        });
      } else {
        toast({
          title: "Başarılı",
          description: `${data.variants?.colors?.length || 0} renk varyantı birleştirildi`
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Hata",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // All Images extraction mutation
  const extractAllImagesMutation = useMutation({
    mutationFn: async (url: string) => {
      const response = await fetch("/api/comprehensive-images", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }
      return response.json();
    },
    onSuccess: (data) => {
      setAllImages(data.images || []);
      toast({
        title: "Tüm Görseller Çıkarıldı",
        description: `${data.totalImages} görsel bulundu ve kategorize edildi`
      });
    },
    onError: (error: any) => {
      toast({
        title: "Görsel Çıkarma Hatası",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Product features extraction mutation
  const extractFeaturesMutation = useMutation({
    mutationFn: async (url: string) => {
      const response = await fetch("/api/scenario-scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }
      return response.json();
    },
    onSuccess: (data) => {
      setProductFeatures(data.features || []);
      
      // extractFeaturesMutation sadece özellik çıkarma için kullanılıyor, CSV ekleme yapmıyor
      // CSV önizlemesi sadece singleScrapeMutation tarafından ekleniyor
      
      toast({
        title: "Ürün Özellikleri Çıkarıldı",
        description: `${data.features?.length || 0} özellik bulundu`
      });
    },
    onError: (error: any) => {
      toast({
        title: "Özellik Çıkarma Hatası",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const updateUrlQueueItem = useCallback(
    (targetUrl: string, patch: Partial<UrlQueueItem>) => {
      setUrlQueue((prev) => {
        const next = prev.map((item) =>
          item.url === targetUrl ? { ...item, ...patch } : item,
        );
        urlQueueRef.current = next;
        return next;
      });
    },
    [],
  );

  const appendPendingUrls = useCallback((rawUrls: string[]): number => {
    const normalized = dedupeNormalizedUrls(rawUrls);
    if (normalized.length === 0) return 0;

    const { next, added } = mergeUrlsIntoQueue(urlQueueRef.current, normalized);
    if (added === 0) return 0;

    urlQueueRef.current = next;
    setUrlQueue(next);
    return added;
  }, []);

  const ingestUrls = useCallback(
    (source: UrlIngestSource, rawUrls: string[]): number => {
      const normalized = dedupeNormalizedUrls(rawUrls);
      if (normalized.length === 0) return 0;

      const fingerprint = buildIngestFingerprint(source, normalized);
      if (shouldSkipDuplicateIngest(lastUrlIngestRef.current, fingerprint)) {
        return 0;
      }
      lastUrlIngestRef.current = { fingerprint, at: Date.now() };

      return appendPendingUrls(normalized);
    },
    [appendPendingUrls],
  );

  const processAllUrls = async (items: UrlQueueItem[]) => {
    const queue = items
      .map((item) => ({ ...item, url: normalizeProductUrl(item.url) }))
      .filter((item): item is UrlQueueItem & { url: string } => Boolean(item.url));

    if (queue.length === 0) {
      toast({
        title: "Hata",
        description: "İşlemek için geçerli URL eklemeniz gerekiyor",
        variant: "destructive",
      });
      return;
    }

    setIsBulkProcessing(true);
    setBulkProgress({ current: 0, total: queue.length });

    toast({
      title: "🚀 Toplu Çekim Başladı",
      description: `${queue.length} ürün teker teker işlenecek...`,
      duration: 6000,
    });

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < queue.length; i++) {
      const { url } = queue[i];
      setBulkProgress({ current: i + 1, total: queue.length });
      updateUrlQueueItem(url, { status: "processing", error: undefined });

      try {
        const scraped = await fetchScenarioScrapeResult(url, true);
        const newPreview = buildCsvPreviewEntry(scraped, url, "bulk");
        setCsvPreviews((prev) => [newPreview, ...prev]);
        updateUrlQueueItem(url, { status: "success", error: undefined });
        successCount++;

        toast({
          title: `✅ ${i + 1}/${queue.length} tamamlandı`,
          description: scraped.title || url,
          duration: 3000,
        });
      } catch (error) {
        failCount++;
        updateUrlQueueItem(url, {
          status: "error",
          error: error instanceof Error ? error.message : "Bilinmeyen hata",
        });
        toast({
          title: `❌ ${i + 1}/${queue.length} başarısız`,
          description: error instanceof Error ? error.message : "Bilinmeyen hata",
          variant: "destructive",
          duration: 4000,
        });
      }
    }

    setIsBulkProcessing(false);
    setBulkProgress(null);

    toast({
      title: "Toplu İşlem Tamamlandı",
      description: `✅ Başarılı: ${successCount}, ❌ Hatalı: ${failCount}`,
      duration: 8000,
    });
  };

  const handleFetchProducts = useCallback(async () => {
    if (singleScrapeMutation.isPending || isBulkProcessing) return;

    const inputUrl = normalizeProductUrl(singleForm.getValues("url") ?? "");
    let queue = [...urlQueue];

    if (inputUrl && !queue.some((item) => item.url === inputUrl)) {
      queue = [...queue, { url: inputUrl, status: "pending" as const }];
      urlQueueRef.current = queue;
      setUrlQueue(queue);
      singleForm.setValue("url", "");
    }

    const pendingCount = queue.filter((item) => item.status === "pending" || item.status === "error").length;
    if (queue.length === 0 && !inputUrl) {
      toast({
        title: "URL gerekli",
        description: "Sürükleyin, yapıştırıp Ekle'ye basın veya URL alanına yazın",
        variant: "destructive",
      });
      return;
    }

    if (queue.length === 1) {
      updateUrlQueueItem(queue[0].url, { status: "processing" });
      singleScrapeMutation.mutate(
        { url: queue[0].url, onlyExtractData: true },
        {
          onSettled: (_data, error) => {
            updateUrlQueueItem(queue[0].url, {
              status: error ? "error" : "success",
              error: error instanceof Error ? error.message : undefined,
            });
          },
        },
      );
      return;
    }

    if (pendingCount === 0) {
      toast({
        title: "Bekleyen URL yok",
        description: "Yeni URL ekleyin veya hatalı satırları silip tekrar deneyin",
        variant: "destructive",
      });
      return;
    }

    await processAllUrls(queue.filter((item) => item.status === "pending" || item.status === "error"));
  }, [urlQueue, isBulkProcessing, singleForm, singleScrapeMutation, updateUrlQueueItem]);

  const onSingleSubmit = singleForm.handleSubmit(() => {
    void handleFetchProducts();
  });

  const titleEdited =
    Boolean(product?.title && scrapedOriginalTitle) &&
    product.title.trim().toLowerCase() !== scrapedOriginalTitle.trim().toLowerCase();

  const shopifyUploadBlockedReason = (() => {
    if (!product) return null;
    const priceOriginal =
      typeof product.price === "object" && product.price !== null
        ? (product.price as { original?: number }).original ?? 0
        : typeof product.price === "number"
          ? product.price
          : 0;
    if (priceOriginal <= 0) {
      return "Fiyat alınamadığı için Shopify aktarımı engellendi";
    }

    const imageCount = Array.isArray(product.images)
      ? product.images.filter((img) => {
          const url = typeof img === "string" ? img : img?.url;
          return typeof url === "string" && url.startsWith("http");
        }).length
      : 0;
    if (imageCount === 0) {
      return "En az 1 geçerli görsel gerekli";
    }

    const sourceUrl = product.sourceUrl || product.originalUrl || singleForm.getValues("url");
    if (!sourceUrl?.trim()) {
      return "Geçerli kaynak URL bulunamadı";
    }

    if ((product.title || "").trim().length < 8) {
      return "Başlık çok kısa (en az 8 karakter gerekli)";
    }

    if (
      product.titleSource === "url-slug" &&
      !titleApproved &&
      !titleEdited
    ) {
      return "Başlık URL'den üretildi, Shopify'a göndermeden önce başlığı onaylayın.";
    }

    return null;
  })();

  const shopifyUploadWarning =
    product?.titleSource === "url-slug" && !shopifyUploadBlockedReason
      ? "Başlık URL slug'ından türetildi — Shopify'da yayınlamadan önce başlığı kontrol etmeniz önerilir."
      : null;

  const canShopifyUpload = Boolean(product) && !shopifyUploadBlockedReason;

  // Shopify transfer mutation
  const shopifyTransferMutation = useMutation({
    mutationFn: async () => {
      if (!product) throw new Error('Önce ürün verisi çekilmelidir');
      if (shopifyUploadBlockedReason) {
        throw new Error(shopifyUploadBlockedReason);
      }

      setWorkflowStep('Shopify bağlantısı kontrol ediliyor...');
      const connRes = await fetch('/api/shopify/connection-test', { method: 'POST' });
      const connData = await connRes.json().catch(() => ({}));
      if (!connRes.ok || !connData.connected) {
        throw new Error(connData.message || 'Shopify bağlantısı kurulamadı');
      }

      setWorkflowStep('Shopify\'a gönderiliyor...');
      const cleanVariants = sanitizeTrendyolVariants(product.variants, {
        productTitle: product.title,
      });
      const sourceUrl =
        product.sourceUrl || product.originalUrl || singleForm.getValues('url');

      const response = await fetch('/api/shopify/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productData: {
            ...product,
            variants: cleanVariants,
            sourceUrl,
            scrapedTitle: scrapedOriginalTitle || product.title,
          },
          sourceUrl,
          productTitle: product.title,
          approvedForShopify: titleApproved,
          titleEdited,
          titleSource: product.titleSource,
          scrapedTitle: scrapedOriginalTitle || product.title,
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        const err = new Error(result.error || result.message || `HTTP ${response.status}`) as Error & {
          httpStatus?: number;
          step?: string;
        };
        err.httpStatus = response.status;
        err.step = result.step;
        throw err;
      }
      return result;
    },
    onSuccess: (data) => {
      setLastShopifyResult({
        adminUrl: data.adminUrl,
        shopifyId: data.shopifyId || data.shopifyProductId,
      });
      setWorkflowStep(`Shopify'a yüklendi ✅ (${data.status || 'draft'})`);
      toast({
        title: 'Başarılı!',
        description: data.adminUrl
          ? `Ürün draft olarak yüklendi. Admin panelinden açabilirsiniz.`
          : `Ürün Shopify'a eklendi (ID: ${data.shopifyId || data.shopifyProductId})`,
      });
    },
    onError: (error: any) => {
      const status = error.httpStatus;
      let description = error.message || 'Bilinmeyen hata';
      if (status === 401) description = 'Shopify token hatası — ayarlardan token/OAuth kontrol edin';
      if (status === 403) description = 'Shopify yetki/scope hatası — write_products iznini kontrol edin';
      if (status === 422) description = error.message || 'Shopify payload doğrulama hatası';
      if (status === 500) description = error.message || 'Sunucu hatası — logları kontrol edin';

      setLastShopifyResult({ error: description });
      setWorkflowStep('Shopify aktarım hatası');
      toast({
        title: 'Hata',
        description,
        variant: 'destructive',
      });
    },
  });

  const onShopifyTransfer = () => {
    if (!product) {
      toast({ title: 'Ürün yok', description: 'Önce ürün verilerini çekin', variant: 'destructive' });
      return;
    }
    if (shopifyUploadBlockedReason) {
      toast({
        title: 'Shopify aktarımı engellendi',
        description: shopifyUploadBlockedReason,
        variant: 'destructive',
      });
      return;
    }
    shopifyTransferMutation.mutate();
  };


  // Sürükle-bırak fonksiyonları
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    setIsDragOver(true);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const urls = extractDroppedUrls(e);

    if (urls.length > 0) {
      const added = ingestUrls("drop", urls);
      if (added > 0) {
        toast({
          title: "URL'ler Eklendi",
          description: `${added} yeni URL eklendi`,
        });
      } else {
        toast({
          title: "Zaten Ekli",
          description: urls.length === 1 ? "Bu URL zaten listede" : "Bu URL'ler zaten listede",
        });
      }
      return;
    }

    toast({
      title: "Geçersiz URL",
      description: "Trendyol, Arçelik veya PttAVM linki sürükleyin",
      variant: "destructive",
    });
  };

  const handlePasteUrls = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData("text");
    const urls = parseUrlsFromText(pasted);
    if (urls.length === 0) return;
    e.preventDefault();
    const added = ingestUrls("paste", urls);
    if (added > 0) {
      toast({
        title: "URL'ler Eklendi",
        description: `${added} URL yapıştırılarak eklendi`,
      });
    } else {
      toast({
        title: "Zaten Ekli",
        description: "Bu URL zaten listede",
      });
    }
  };

  const pendingUrlCount = urlQueue.filter((item) => item.status === "pending" || item.status === "error").length;
  const canStartScrape = pendingUrlCount > 0 || Boolean(normalizeProductUrl(singleForm.watch("url") ?? ""));

  const addUrlManually = () => {
    const raw = singleForm.getValues("url") ?? "";
    const normalized = normalizeProductUrl(raw);

    if (!normalized) {
      toast({
        title: "Geçersiz URL",
        description: "Trendyol, Arçelik veya PttAVM linki girin",
        variant: "destructive",
      });
      return;
    }

    const added = ingestUrls("manual", [normalized]);
    if (added > 0) {
      singleForm.setValue("url", "");
      toast({
        title: "URL Eklendi",
        description: "URL listeye eklendi",
      });
    } else {
      toast({
        title: "Zaten Ekli",
        description: "Bu URL zaten listede",
      });
    }
  };

  const removeUrl = (indexToRemove: number) => {
    setUrlQueue((prev) => {
      const next = prev.filter((_, index) => index !== indexToRemove);
      urlQueueRef.current = next;
      return next;
    });
  };

  const clearScraperWorkspace = useCallback(() => {
    singleForm.reset({ url: "" });
    multiForm.setValue("urls", [{ url: "" }]);

    setProduct(null);
    setCsvPreviews([]);
    setAllImages([]);
    setProductFeatures([]);
    setUrlQueue([]);
    urlQueueRef.current = [];
    setScrapedOriginalTitle(null);
    setTitleApproved(false);
    setWorkflowStep(null);
    setLastScrapeUrl(null);
    setLastShopifyResult(null);
    setScrapeError(null);
    setScrapeErrorMeta(null);
    setIsBulkProcessing(false);
    setBulkProgress(null);
    setUploadProgress(null);
    setFailedUploads([]);
    setUploadingId(null);
    setIndividualTags({});
    setScrapingMode("single");
    lastUrlIngestRef.current = null;

    clearScraperUiStorage();
    clearRecentUrls();

    toast({
      title: "Temizlendi",
      description: "Tüm URL'ler ve geçici ön izleme verileri temizlendi.",
    });
  }, [singleForm, multiForm]);

  const clearAllUrls = clearScraperWorkspace;

  // CSV tag uygulama yardımcısı — hem tekil hem toplu yüklemede kullanılır
  const applyTagsToCSV = useCallback((csvContent: string, tags: string[]): string => {
    if (!tags.length) return csvContent;
    const lines = csvContent.split('\n').filter(l => l.trim());
    if (lines.length < 2) return csvContent;
    const parseCSVLine = (line: string) => {
      const res: string[] = []; let cur = ''; let inQ = false;
      for (const ch of line) {
        if (ch === '"') inQ = !inQ;
        else if (ch === ',' && !inQ) { res.push(cur.trim()); cur = ''; }
        else cur += ch;
      }
      res.push(cur.trim()); return res;
    };
    const headers = parseCSVLine(lines[0]).map(h => h.replace(/"/g, '').trim());
    const tagsIdx = headers.findIndex(h => h.toLowerCase() === 'tags');
    if (tagsIdx === -1) return csvContent;
    const updated = [lines[0]];
    for (let i = 1; i < lines.length; i++) {
      const cells = parseCSVLine(lines[i]);
      if (cells[tagsIdx] !== undefined) {
        const existing = cells[tagsIdx].replace(/"/g, '').trim();
        cells[tagsIdx] = `"${existing ? `${existing}, ${tags.join(', ')}` : tags.join(', ')}"`;
      }
      updated.push(cells.map(c => (c.includes(',') || c.includes('"') || c.includes('\n')) ? `"${c.replace(/"/g, '""')}"` : c).join(','));
    }
    return updated.join('\n');
  }, []);

  // Tüm CSV'leri Shopify'a yükleme fonksiyonu
  const uploadAllCSVsToShopify = async () => {
    if (csvPreviews.length === 0) {
      toast({ title: "Hata", description: "Yüklenecek CSV dosyası bulunamadı", variant: "destructive" });
      return;
    }
    if (uploadProgress) return; // zaten çalışıyor

    const total = csvPreviews.length;
    setUploadProgress({ current: 0, total, successCount: 0, failCount: 0, currentTitle: '' });
    setFailedUploads([]);

    let successCount = 0;
    let failCount = 0;
    const failedList: {title: string; error: string}[] = [];

    const pushProgress = (next: NonNullable<typeof uploadProgress>) => {
      startTransition(() => setUploadProgress(next));
    };

    for (let i = 0; i < csvPreviews.length; i++) {
      const preview = csvPreviews[i];
      pushProgress({ current: i + 1, total, successCount, failCount, currentTitle: preview.productTitle });

      try {
        const tags = individualTags[preview.id] || [];
        const csvToUpload = applyTagsToCSV(preview.csvContent, tags);
        const body = JSON.stringify(
          buildCsvShopifyUploadBody(preview, csvToUpload, tags),
        );

        // Retry up to 3 attempts total for 502/503/504 gateway errors
        const MAX_ATTEMPTS = 3;
        let lastErrMsg = '';
        let uploaded = false;

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          if (attempt > 1) {
            const retryDelay = attempt * 6000; // 12s, 18s
            pushProgress({ current: i + 1, total, successCount, failCount, currentTitle: `${preview.productTitle} (deneme ${attempt}/${MAX_ATTEMPTS}...)` });
            await new Promise(r => setTimeout(r, retryDelay));
          }

          let response: Response;
          try {
            const controller = new AbortController();
            const tid = setTimeout(() => controller.abort(), 3 * 60 * 1000);
            try {
              response = await fetch("/api/shopify/upload-csv-product", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                signal: controller.signal,
                body,
              });
            } finally { clearTimeout(tid); }
          } catch (fetchErr: any) {
            if (fetchErr?.name === 'AbortError') { successCount++; uploaded = true; break; }
            lastErrMsg = fetchErr?.message || 'Bağlantı hatası';
            continue;
          }

          if (response.ok) {
            const result = await response.json();
            if (result.success || result.shopifyId || result.productId || result.error?.includes('yakın zamanda')) {
              successCount++;
            } else {
              lastErrMsg = result.error || result.message || 'Bilinmeyen hata';
              failCount++;
              failedList.push({ title: preview.productTitle, error: lastErrMsg });
            }
            uploaded = true;
            break;
          } else if (response.status === 409) {
            successCount++;
            uploaded = true;
            break;
          } else if (response.status === 502 || response.status === 503 || response.status === 504) {
            // Gateway errors — worth retrying
            lastErrMsg = `HTTP ${response.status}`;
            continue;
          } else {
            try {
              const errData = await response.json();
              const errMsg = errData.error || errData.message || '';
              if (errMsg.includes('yakın zamanda') || errMsg.includes('already')) {
                successCount++;
                uploaded = true;
                break;
              }
              lastErrMsg = errMsg || `HTTP ${response.status}`;
            } catch {
              lastErrMsg = `HTTP ${response.status}`;
            }
            failCount++;
            failedList.push({ title: preview.productTitle, error: lastErrMsg });
            uploaded = true;
            break;
          }
        }

        // If all retry attempts were gateway errors
        if (!uploaded) {
          failCount++;
          failedList.push({ title: preview.productTitle, error: `${lastErrMsg} (${MAX_ATTEMPTS} denemede başarısız)` });
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          successCount++;
        } else {
          failCount++;
          failedList.push({ title: preview.productTitle, error: err?.message || 'Bağlantı hatası' });
        }
      }

      pushProgress({ current: i + 1, total, successCount, failCount, currentTitle: preview.productTitle });
    }

    startTransition(() => setUploadProgress(null));
    setFailedUploads(failedList);
    window.setTimeout(() => {
      toast({
        title: "Toplu Yükleme Tamamlandı",
        description: `✅ Başarılı: ${successCount}, ❌ Hatalı: ${failCount}`,
        duration: 8000,
      });
    }, 50);
  };

  const onMultiSubmit = multiForm.handleSubmit((data) => {
    multiUrlScrapeMutation.mutate(data);
  });

  const addUrlField = () => {
    const currentUrls = multiForm.getValues('urls');
    multiForm.setValue('urls', [...currentUrls, { url: '' }]);
  };

  const removeUrlField = (index: number) => {
    const currentUrls = multiForm.getValues('urls');
    if (currentUrls.length > 1) {
      multiForm.setValue('urls', currentUrls.filter((_, i) => i !== index));
    }
  };

  // CSV indirme fonksiyonu
  const downloadCSV = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleExportAllCSV = () => {
    if (csvPreviews.length === 0) return;

    const robustParseCSVLine = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      let i = 0;
      while (i < line.length) {
        const char = line[i];
        if (inQuotes) {
          if (char === '"') {
            if (i + 1 < line.length && line[i + 1] === '"') {
              current += '"';
              i += 2;
              continue;
            } else {
              inQuotes = false;
              i++;
              continue;
            }
          } else {
            current += char;
            i++;
          }
        } else {
          if (char === '"') {
            inQuotes = true;
            i++;
          } else if (char === ',') {
            result.push(current);
            current = '';
            i++;
          } else {
            current += char;
            i++;
          }
        }
      }
      result.push(current);
      return result;
    };

    const escapeCSVField = (field: string): string => {
      if (field.includes(',') || field.includes('"') || field.includes('\n')) {
        return `"${field.replace(/"/g, '""')}"`;
      }
      return field;
    };

    const applyManualTags = (csv: string, tags: string[]): string => {
      if (tags.length === 0) return csv;
      const lines = csv.split('\n').filter((l: string) => l.trim());
      if (lines.length < 2) return csv;

      const headerCells = robustParseCSVLine(lines[0]);
      const tagsIndex = headerCells.findIndex(h => h.replace(/"/g, '').trim().toLowerCase() === 'tags');
      if (tagsIndex === -1) return csv;

      const updatedLines = [lines[0]];
      for (let i = 1; i < lines.length; i++) {
        const cells = robustParseCSVLine(lines[i]);
        if (cells[tagsIndex] !== undefined) {
          const existing = cells[tagsIndex].trim();
          cells[tagsIndex] = existing
            ? `${existing}, ${tags.join(', ')}`
            : tags.join(', ');
        }
        updatedLines.push(cells.map(escapeCSVField).join(','));
      }
      return updatedLines.join('\n');
    };

    let combinedCSV = '';

    csvPreviews.forEach((preview, idx) => {
      const manualTags = individualTags[preview.id] || [];
      const csv = applyManualTags(preview.csvContent, manualTags);
      const lines = csv.split('\n').filter((l: string) => l.trim());
      if (lines.length === 0) return;

      if (idx === 0) {
        combinedCSV = lines.join('\n');
      } else {
        const dataLines = lines.slice(1);
        if (dataLines.length > 0) {
          combinedCSV += '\n' + dataLines.join('\n');
        }
      }
    });

    if (combinedCSV) {
      const now = new Date();
      const dateStr = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
      downloadCSV(combinedCSV, `shopify-urunler-${dateStr}.csv`);
      toast({
        title: "CSV Dışa Aktarıldı",
        description: `${csvPreviews.length} ürün tek CSV dosyasında birleştirildi`
      });
    }
  };

  // CSV indirme fonksiyonu - Manuel etiketleri ekleyerek
  const handleCSVDownload = useCallback((id: string, filename: string) => {
    const preview = csvPreviews.find(p => p.id === id);
    if (preview) {
      // Manuel etiketleri CSV'ye ekle
      const manualTags = individualTags[id] || [];
      let csvToDownload = preview.csvContent;
      
      if (manualTags.length > 0) {
        const lines = csvToDownload.split('\n').filter(line => line.trim());
        if (lines.length >= 2) {
          // CSV parse fonksiyonu
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
          const tagsIndex = headers.findIndex(h => h.toLowerCase() === 'tags');

          if (tagsIndex !== -1) {
            const updatedLines = [lines[0]];
            
            for (let i = 1; i < lines.length; i++) {
              const cells = parseCSVLine(lines[i]);
              
              // Etiketleri sadece ilk satıra değil, TÜM satırlara ekle (multi-variant için gerekli)
              if (cells[tagsIndex] !== undefined) {
                const existingTags = cells[tagsIndex].replace(/"/g, '').trim();
                const allTags = existingTags 
                  ? `${existingTags}, ${manualTags.join(', ')}` 
                  : manualTags.join(', ');
                cells[tagsIndex] = `"${allTags}"`;
              }
              
              const newLine = cells.map(cell => {
                if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
                  return `"${cell.replace(/"/g, '""')}"`;
                }
                return cell;
              }).join(',');
              
              updatedLines.push(newLine);
            }
            
            csvToDownload = updatedLines.join('\n');
            console.log(`✅ Manuel etiketler tüm CSV satırlarına eklendi: ${manualTags.join(', ')}`);
          }
        }
      }
      
      downloadCSV(csvToDownload, filename);
    }
  }, [csvPreviews, individualTags]);

  // CSV Shopify upload fonksiyonu  
  const handleCSVShopifyUpload = useCallback(async (id: string, individualTags?: string[]) => {
    const preview = csvPreviews.find(p => p.id === id);
    if (!preview) return;

    setUploadingId(id);
    try {
      const csvToUpload = applyTagsToCSV(preview.csvContent, individualTags || []);
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 3 * 60 * 1000);
      let response: Response;
      try {
        response = await fetch("/api/shopify/upload-csv-product", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify(
            buildCsvShopifyUploadBody(preview, csvToUpload, individualTags || []),
          ),
        });
      } finally { clearTimeout(tid); }

      if (response.ok) {
        const result = await response.json();
        if (result.success || result.shopifyId || result.productId) {
          toast({
            title: "Shopify'a Yüklendi ✅",
            description: `${preview.productTitle.substring(0, 40)}... başarıyla yüklendi`
          });
        } else if (result.error?.includes('yakın zamanda')) {
          toast({ title: "Zaten Yüklendi", description: `${preview.productTitle.substring(0, 40)}... daha önce yüklendi` });
        } else {
          throw new Error(result.error || result.message || 'Sunucu başarısız yanıt döndü');
        }
      } else if (response.status === 409) {
        toast({ title: "Zaten Yüklendi", description: `${preview.productTitle.substring(0, 40)}... daha önce yüklendi` });
      } else {
        const errData = await response.json().catch(() => ({} as any));
        const errMsg = errData.error || errData.message || `HTTP ${response.status}`;
        if (errMsg.includes('yakın zamanda') || errMsg.includes('already')) {
          toast({ title: "Zaten Yüklendi", description: `${preview.productTitle.substring(0, 40)}... daha önce yüklendi` });
        } else {
          throw new Error(errMsg);
        }
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        toast({ title: "Yükleme Devam Ediyor", description: `${preview.productTitle.substring(0, 30)}... Shopify panelini kontrol edin` });
      } else {
        toast({ title: "Yükleme Hatası", description: error.message, variant: "destructive" });
      }
    } finally {
      setUploadingId(null);
    }
  }, [csvPreviews, applyTagsToCSV]);

  const uploadToShopify = async (csvContent: string, productTitle: string, preview?: { sourceUrl?: string; images?: string[]; price?: { original?: number; withProfit?: number }; brand?: string }) => {
    try {
      if (!csvContent || csvContent.trim().length === 0) {
        throw new Error('CSV içeriği bulunamadı veya boş');
      }

      const response = await fetch('/api/shopify/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...buildCsvShopifyUploadBody(
            {
              productTitle,
              sourceUrl: preview?.sourceUrl || product?.sourceUrl,
              brand: preview?.brand || product?.brand,
              price: preview?.price || (product?.price as { original?: number; withProfit?: number }),
              images: preview?.images || resolvePreviewImageUrls(product?.images ?? []),
              variants: product?.variants,
              csvInfo: product?.csvInfo,
              csvPreview: product?.csvPreview,
            },
            csvContent,
            product?.tags || [],
          ),
          approvedForShopify: true,
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        toast({
          title: "Shopify'a Yüklendi!",
          description: result.adminUrl
            ? `Ürün draft olarak eklendi.`
            : `Ürün Shopify mağazanıza eklendi. ID: ${result.shopifyProductId || result.productId || 'N/A'}`,
          duration: 5000,
        });
      } else {
        throw new Error(result.error || result.message || "Shopify'a yüklenirken hata oluştu");
      }
    } catch (error) {
      toast({
        title: "Shopify Yükleme Hatası",
        description: error instanceof Error ? error.message : "Shopify'a yüklenirken bağlantı hatası oluştu",
        variant: "destructive",
        duration: 5000,
      });
    }
  };

  const primaryCsvPreview = csvPreviews[0] ?? null;

  const resolvedPreview = useMemo(
    () =>
      resolveProductPreview({
        product,
        csvPreview: primaryCsvPreview,
      }),
    [product, primaryCsvPreview],
  );

  const productPreviewImages = resolvedPreview.images;

  const displayPrice = useMemo(() => {
    if (!resolvedPreview.hasPrice || resolvedPreview.priceOriginal == null) return null;
    return normalizeTrendyolDisplayPrice(
      {
        original: resolvedPreview.priceOriginal,
        withProfit: resolvedPreview.priceWithProfit ?? resolvedPreview.priceOriginal,
      },
      0.1,
    );
  }, [resolvedPreview]);

  const displayVariants = useMemo(
    () =>
      product
        ? sanitizeTrendyolVariants(product.variants, { productTitle: product.title })
        : { colors: [], sizes: [], allVariants: [] },
    [product?.variants, product?.title],
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-slate-900 to-cyan-900">
      {/* Header */}
      <div className="bg-gradient-to-r from-black/95 via-slate-900/90 to-cyan-900/80 backdrop-blur-sm border-b border-cyan-800/30">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                onClick={() => setLocation('/')}
                variant="outline"
                className="business-button px-4 py-2"
                data-testid="button-home"
              >
                <Home className="w-4 h-4 mr-2" />
                Ana Sayfa
              </Button>
              <Button
                onClick={() => setLocation('/telegram-notifications')}
                variant="outline"
                className="bg-blue-600/10 border-blue-600/30 text-blue-400 hover:bg-blue-600/20 hover:border-blue-600/50 px-4 py-2"
                data-testid="button-telegram-notifications"
              >
                <Bell className="w-4 h-4 mr-2" />
                Telegram Bildirimleri
              </Button>
              <ShopifySettingsDialog />
              <Button
                onClick={clearScraperWorkspace}
                variant="outline"
                className="bg-red-600/10 border-red-600/30 text-red-400 hover:bg-red-600/20 hover:border-red-600/50 px-4 py-2"
                disabled={singleScrapeMutation.isPending || shopifyTransferMutation.isPending}
                data-testid="button-clear-all"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Tümünü Sil
              </Button>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 flex items-center justify-center">
                  <svg 
                    width="64" 
                    height="64" 
                    viewBox="0 0 200 200" 
                    className="rounded-lg"
                  >
                    <rect width="200" height="200" rx="25" fill="#FF6000"/>
                    <rect x="0" y="65" width="200" height="70" fill="#000000"/>
                    <text 
                      x="100" 
                      y="110" 
                      textAnchor="middle" 
                      fill="white" 
                      fontSize="32" 
                      fontFamily="Arial, sans-serif" 
                      fontWeight="bold"
                    >
                      trendyol
                    </text>
                  </svg>
                </div>
                <div>
                  <h1 className="text-white font-thin text-xl tracking-wider">TRENDYOL</h1>
                  <p className="text-cyan-400/80 text-sm font-thin">Ürün Çıkarıcı</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className={`mx-auto ${isMobile ? 'px-4 py-6 max-w-full' : 'max-w-6xl px-6 py-8'}`}>
        <div className={`grid grid-cols-1 ${isMobile ? 'gap-6' : 'gap-8'}`}>
          
          {/* Main Content Section */}
          <div>
            {/* Mode Selection - Hidden, only single mode available */}

            {/* Single Mode Form */}
            <div>
              <Card className="business-card bg-gradient-to-br from-slate-900/90 via-slate-800/50 to-slate-900/90 backdrop-blur border border-cyan-800/30">
                <CardHeader className={`business-header ${isMobile ? 'px-4 py-4' : 'px-6 py-4'}`}>
                  <CardTitle className={`text-white font-thin flex items-center gap-2 ${
                    isMobile ? 'text-lg' : 'text-lg'
                  }`}>
                    <Package className={`text-cyan-400/70 ${isMobile ? 'w-5 h-5' : 'w-5 h-5'}`} />
                    <span className="leading-tight">Tek Varyant Ürün</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className={`${isMobile ? 'p-4' : 'p-6'}`}>
                  <form
                    onSubmit={onSingleSubmit}
                    className={`${isMobile ? 'space-y-6' : 'space-y-4'}`}
                  >
                    {/* Sürükle-Bırak Alanı */}
                    <div className={`${isMobile ? 'space-y-4' : 'space-y-3'}`}>
                      <label className={`text-white font-thin block ${
                        isMobile ? 'text-base mb-2' : 'text-sm'
                      }`}>
                        Ürün URL'leri - Sürükle Bırak veya Manuel Ekle
                      </label>
                      
                      {/* Sürükle-Bırak Alanı */}
                      <div
                        className={`border-2 border-dashed transition-all duration-200 rounded-lg flex items-center justify-center select-none ${
                          isDragOver
                            ? "border-cyan-400 bg-cyan-900/20"
                            : "border-slate-600 bg-slate-800/50"
                        } ${isMobile ? "min-h-[72px] px-4 py-5" : "min-h-[80px] px-6 py-6"}`}
                        onDragEnter={handleDragEnter}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onPaste={handlePasteUrls}
                      >
                        <p
                          className={`font-medium leading-none ${
                            isDragOver ? "text-cyan-300" : "text-slate-300"
                          } ${isMobile ? "text-base" : "text-lg"}`}
                        >
                          url sürükle
                        </p>
                      </div>

                      {/* Manuel URL Ekleme */}
                      <div className={`w-full ${isMobile ? 'space-y-4' : 'flex gap-2'}`}>
                        <div className={`relative ${isMobile ? 'w-full' : 'flex-1'}`}>
                          <Input
                            placeholder="https://www.trendyol.com/..."
                            {...singleForm.register("url")}
                            type="url"
                            className={`business-input w-full ${
                              isMobile 
                                ? 'h-14 text-base pl-4 pr-16 rounded-lg' 
                                : 'h-12 text-base pl-4 pr-20'
                            }`}
                            disabled={singleScrapeMutation.isPending}
                            data-testid="input-product-url"
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className={`absolute right-2 top-1/2 transform -translate-y-1/2 text-white hover:bg-blue-800 transition-all duration-200 active:scale-95 rounded-md ${
                              isMobile ? 'h-10 w-10 p-0' : 'h-8 w-8 p-0'
                            }`}
                            onClick={() => {
                              navigator.clipboard.readText().then(text => {
                                singleForm.setValue('url', text);
                                toast({
                                  title: "Yapıştırıldı",
                                  description: "URL panodan alındı"
                                });
                              });
                            }}
                            data-testid="button-paste-url"
                          >
                            <Copy className={`${isMobile ? 'w-5 h-5' : 'w-4 h-4'}`} />
                          </Button>
                        </div>
                        <Button
                          type="button"
                          onClick={addUrlManually}
                          disabled={singleScrapeMutation.isPending}
                          className={`bg-blue-600 hover:bg-blue-700 text-white transition-all duration-200 active:scale-95 rounded-lg ${
                            isMobile 
                              ? 'w-full h-14 text-base font-semibold px-4 flex items-center justify-center' 
                              : 'px-4 h-12 flex items-center'
                          }`}
                          data-testid="button-add-url"
                        >
                          <Plus className={`${isMobile ? 'w-5 h-5 mr-2' : 'w-4 h-4 mr-2'}`} />
                          <span className="font-semibold">Ekle</span>
                        </Button>
                      </div>

                      {/* Eklenen URL listesi — hemen görünür */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-white font-thin text-sm">
                            Eklenmiş URL&apos;ler ({urlQueue.length})
                          </label>
                          {urlQueue.length > 0 && (
                            <Button
                              type="button"
                              onClick={clearAllUrls}
                              variant="ghost"
                              className="text-red-400 hover:text-red-300 text-xs h-6 px-2"
                            >
                              Tümünü Sil
                            </Button>
                          )}
                        </div>
                        {urlQueue.length > 0 ? (
                          <div className="max-h-44 overflow-y-auto space-y-2 rounded-lg border border-cyan-800/30 bg-slate-800/40 p-3">
                            {urlQueue.map((item, index) => (
                              <div
                                key={item.url}
                                className="flex items-center gap-2 rounded-md bg-slate-700/50 px-3 py-2"
                              >
                                <span className="text-cyan-400 text-xs font-mono">#{index + 1}</span>
                                <span className="text-white text-xs flex-1 truncate" title={item.url}>
                                  {item.url}
                                </span>
                                <span
                                  className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 ${
                                    item.status === "pending"
                                      ? "bg-slate-600/60 text-slate-300"
                                      : item.status === "processing"
                                        ? "bg-amber-900/50 text-amber-300"
                                        : item.status === "success"
                                          ? "bg-emerald-900/50 text-emerald-300"
                                          : "bg-red-900/50 text-red-300"
                                  }`}
                                  title={item.error}
                                >
                                  {URL_STATUS_LABEL[item.status]}
                                </span>
                                <Button
                                  type="button"
                                  onClick={() => removeUrl(index)}
                                  variant="ghost"
                                  className="h-6 w-6 p-0 text-red-400 hover:text-red-300"
                                >
                                  <X className="w-3 h-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-slate-500 text-xs px-1">
                            Henüz URL eklenmedi. Sürükleyin veya alttan ekleyin.
                          </p>
                        )}
                      </div>

                      <UrlHistory onSelect={(url) => singleForm.setValue("url", url, { shouldDirty: true })} />
                    </div>

                    {/* Dahili Mini Tarayıcı */}
                    <MiniBrowser
                      onExtract={(url) => {
                        const added = ingestUrls("browser", [url]);
                        if (added > 0) {
                          toast({ title: "URL Eklendi", description: "Tarayıcıdan URL listeye eklendi" });
                        } else {
                          toast({ title: "Zaten Ekli", description: "Bu URL zaten listede mevcut" });
                        }
                      }}
                    />
                    
                    <div className="space-y-3">
                      {/* Toplu çekim yükleme banner'ı */}
                      {isBulkProcessing && (
                        <div className="relative overflow-hidden rounded-xl border border-emerald-500/40 bg-gradient-to-r from-emerald-900/60 via-green-900/60 to-emerald-900/60 p-4">
                          {/* Hareketli arka plan dalgası */}
                          <span className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-emerald-400/10 to-transparent pointer-events-none" />
                          <div className="flex items-center gap-3">
                            {/* Dönen ikon */}
                            <div className="relative w-10 h-10 shrink-0">
                              <span className="absolute inset-0 rounded-full border-2 border-emerald-400/30 border-t-emerald-400 animate-spin" />
                              <span className="absolute inset-2 rounded-full bg-emerald-500/20 animate-pulse" />
                              <Package className="absolute inset-0 m-auto w-4 h-4 text-emerald-300" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-emerald-300 font-semibold text-sm">
                                {bulkProgress ? `${bulkProgress.current}. ürün işleniyor...` : 'Başlatılıyor...'}
                              </p>
                              <p className="text-emerald-400/70 text-xs mt-0.5">
                                Lütfen sayfayı kapatmayın
                              </p>
                            </div>
                            {/* Adet göstergesi */}
                            <div className="shrink-0 text-right">
                              <span className="text-2xl font-bold text-emerald-300">
                                {bulkProgress ? bulkProgress.current : 0}
                              </span>
                              <span className="text-xs text-emerald-400/70 block">/ {urlQueue.length}</span>
                            </div>
                          </div>
                          {/* Alt ilerleme çubuğu */}
                          <div className="mt-3 h-1.5 rounded-full bg-emerald-900/60 overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-emerald-500 to-green-400 transition-all duration-700"
                              style={{width: bulkProgress ? `${(bulkProgress.current / bulkProgress.total) * 100}%` : '5%'}}
                            />
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="relative">
                          {(singleScrapeMutation.isPending || isBulkProcessing) && (
                            <>
                              <span className="absolute inset-0 rounded-md animate-ping bg-green-400 opacity-20 pointer-events-none" />
                              <span className="absolute inset-0 rounded-md animate-pulse bg-green-300 opacity-10 pointer-events-none" />
                            </>
                          )}
                          <Button
                            type="button"
                            onClick={() => void handleFetchProducts()}
                            disabled={
                              singleScrapeMutation.isPending ||
                              isBulkProcessing ||
                              shopifyTransferMutation.isPending ||
                              !canStartScrape
                            }
                            className={`relative w-full overflow-hidden bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white h-14 text-lg font-medium transition-all duration-300 ${singleScrapeMutation.isPending || isBulkProcessing ? "shadow-lg shadow-green-500/40 scale-[1.01]" : ""}`}
                          >
                            {(singleScrapeMutation.isPending || isBulkProcessing) && (
                              <span className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />
                            )}
                            {singleScrapeMutation.isPending || isBulkProcessing ? (
                              <div className="flex items-center gap-3">
                                <div className="relative w-5 h-5 shrink-0">
                                  <span className="absolute inset-0 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                                  <span className="absolute inset-1 rounded-full bg-white/20 animate-pulse" />
                                </div>
                                <span className="flex flex-col items-start leading-tight">
                                  <span className="text-sm font-semibold">Veriler Çekiliyor...</span>
                                  <span className="text-xs font-normal opacity-75">
                                    {urlQueue.length > 0 ? `${urlQueue.length} URL` : "Lütfen bekleyin"}
                                  </span>
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <Package className="w-5 h-5" />
                                <span>
                                  ÜRÜN VERİLERİNİ ÇEK
                                  {urlQueue.length > 0 ? ` (${pendingUrlCount || urlQueue.length})` : ""}
                                </span>
                              </div>
                            )}
                          </Button>
                        </div>

                        <Button
                          type="button"
                          onClick={onShopifyTransfer}
                          disabled={
                            singleScrapeMutation.isPending ||
                            shopifyTransferMutation.isPending ||
                            isBulkProcessing ||
                            !canShopifyUpload
                          }
                          title={shopifyUploadBlockedReason ?? undefined}
                          className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white h-14 text-lg font-medium disabled:opacity-50"
                        >
                          {shopifyTransferMutation.isPending ? (
                            <div className="flex items-center gap-2">
                              <Loader2 className="w-5 h-5 animate-spin" />
                              <span>Shopify&apos;a Aktarılıyor...</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <ShoppingCart className="w-5 h-5" />
                              <span>SHOPIFY&apos;A AKTAR</span>
                            </div>
                          )}
                        </Button>
                      </div>

                      {(shopifyUploadBlockedReason || shopifyUploadWarning) && (
                        <div
                          className={`rounded-lg border px-4 py-3 text-sm ${
                            shopifyUploadBlockedReason
                              ? "border-amber-500/40 bg-amber-900/20 text-amber-100"
                              : "border-cyan-500/30 bg-cyan-900/10 text-cyan-100"
                          }`}
                        >
                          {shopifyUploadBlockedReason || shopifyUploadWarning}
                        </div>
                      )}

                    </div>
                  </form>
                </CardContent>
              </Card>
            </div>
          </div>


        </div>

        {/* Workflow / error status — never blank */}
        {(singleScrapeMutation.isPending || workflowStep || scrapeError || lastShopifyResult) && (
          <div className="mt-6">
            <Card className="border border-slate-700/50 bg-slate-900/80">
              <CardContent className="p-4 space-y-2">
                {singleScrapeMutation.isPending && (
                  <div className="flex items-center gap-2 text-cyan-300 text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{workflowStep || 'İşlem devam ediyor...'}</span>
                  </div>
                )}
                {!singleScrapeMutation.isPending && workflowStep && (
                  <p className="text-sm text-green-400">✓ {workflowStep}</p>
                )}
                {scrapeError && (
                  <ScrapeSourceErrorAlert
                    message={scrapeError}
                    details={scrapeError}
                    meta={scrapeErrorMeta ?? undefined}
                    onRetry={() => singleForm.handleSubmit((d) => singleScrapeMutation.mutate(d))()}
                  />
                )}
                {lastShopifyResult?.adminUrl && (
                  <p className="text-sm text-green-400">
                    Shopify:{' '}
                    <a href={lastShopifyResult.adminUrl} target="_blank" rel="noreferrer" className="underline">
                      Admin panelinde aç
                    </a>
                  </p>
                )}
                {lastShopifyResult?.error && (
                  <p className="text-sm text-red-300">{lastShopifyResult.error}</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {singleScrapeMutation.isPending && (
          <div className="mt-8">
            <Card className="business-card border border-cyan-800/30">
              <CardContent className="p-8 flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
                <p className="text-white text-sm">{workflowStep || "Ürün verisi çekiliyor..."}</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* CSV Drawer Preview - Tüm CSV'ler */}
        {(csvPreviews.length > 0 || (product && hasCsvPreviewData(product))) && (
          <div className="mt-8 space-y-4">
            {scrapeSourceWarning && (
              <LocalAgentWarningAlert warningCode={scrapeSourceWarning} detail={localAgentWarningDetail ?? undefined} />
            )}
            <CSVDrawerPreview 
              csvPreviews={csvPreviews}
              onDownload={handleCSVDownload}
              onShopifyUpload={handleCSVShopifyUpload}
              individualTags={individualTags}
              setIndividualTags={setIndividualTags}
              uploadingId={uploadingId}
            />
            
            {/* Toplu Yükleme Progress Banner */}
            {uploadProgress && (
              <div className="mt-4 relative overflow-hidden rounded-xl border border-blue-500/40 bg-gradient-to-r from-blue-900/60 via-purple-900/60 to-blue-900/60 p-4">
                <span className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-blue-400/10 to-transparent pointer-events-none" />
                <div className="flex items-center gap-3">
                  <div className="relative w-10 h-10 shrink-0">
                    <span className="absolute inset-0 rounded-full border-2 border-blue-400/30 border-t-blue-400 animate-spin" />
                    <span className="absolute inset-2 rounded-full bg-blue-500/20 animate-pulse" />
                    <ShoppingCart className="absolute inset-0 m-auto w-4 h-4 text-blue-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-blue-300 font-semibold text-sm">
                      {uploadProgress.current}. ürün yükleniyor...
                    </p>
                    <p className="text-blue-400/70 text-xs mt-0.5 truncate">
                      {uploadProgress.currentTitle || 'Shopify\'a aktarılıyor'}
                    </p>
                  </div>
                  <div className="shrink-0 flex gap-3 text-right">
                    <div>
                      <span className="text-xl font-bold text-emerald-400">{uploadProgress.successCount}</span>
                      <span className="text-xs text-emerald-400/70 block">başarılı</span>
                    </div>
                    {uploadProgress.failCount > 0 && (
                      <div>
                        <span className="text-xl font-bold text-red-400">{uploadProgress.failCount}</span>
                        <span className="text-xs text-red-400/70 block">hatalı</span>
                      </div>
                    )}
                    <div>
                      <span className="text-xl font-bold text-blue-300">{uploadProgress.current}</span>
                      <span className="text-xs text-blue-400/70 block">/ {uploadProgress.total}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-3 h-1.5 rounded-full bg-blue-900/60 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-purple-400 transition-all duration-700"
                    style={{width: `${(uploadProgress.current / uploadProgress.total) * 100}%`}}
                  />
                </div>
              </div>
            )}

            {/* Hatalı Yüklemeler Listesi */}
            {failedUploads.length > 0 && (
              <div className="mt-4 rounded-xl border border-red-500/30 bg-red-900/10 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-red-400 font-bold text-sm flex items-center gap-1.5">
                    <span>❌</span> {failedUploads.length} Ürün Yüklenemedi
                  </span>
                  <button
                    onClick={() => setFailedUploads([])}
                    className="text-red-400/50 hover:text-red-400 text-xs"
                  >kapat</button>
                </div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {failedUploads.map((f, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs bg-red-900/20 rounded-lg px-3 py-2">
                      <span className="text-red-400 shrink-0 mt-0.5">•</span>
                      <div className="min-w-0">
                        <p className="text-red-300 font-medium truncate">{f.title}</p>
                        <p className="text-red-400/70 mt-0.5 break-words">{f.error}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Toplu İşlem Butonları */}
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <Button
                onClick={handleExportAllCSV}
                className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-medium px-8 py-3"
              >
                <div className="flex items-center gap-2">
                  <Download className="w-5 h-5" />
                  CSV OLARAK DIŞA AKTAR ({csvPreviews.length})
                </div>
              </Button>
              <Button
                onClick={uploadAllCSVsToShopify}
                disabled={!!uploadProgress}
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-medium px-8 py-3"
              >
                {uploadProgress ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {uploadProgress.current}/{uploadProgress.total} Yükleniyor... (✅{uploadProgress.successCount}{uploadProgress.failCount > 0 ? ` ❌${uploadProgress.failCount}` : ''})
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="w-5 h-5" />
                    TÜM ÜRÜNLERİ SHOPIFY'A YÜKLE ({csvPreviews.length})
                  </div>
                )}
                        </Button>
                      </div>

                      {(shopifyUploadBlockedReason || shopifyUploadWarning) && (
                        <div
                          className={`rounded-lg border px-4 py-3 text-sm ${
                            shopifyUploadBlockedReason
                              ? "border-amber-500/40 bg-amber-900/20 text-amber-100"
                              : "border-cyan-500/30 bg-cyan-900/10 text-cyan-100"
                          }`}
                        >
                          {shopifyUploadBlockedReason || shopifyUploadWarning}
                        </div>
                      )}
                    </div>
        )}
      </div>
    </div>
  );
}

// URL Önizleme Kartı Komponenti
function UrlPreviewCard({ url, index }: { url: string; index: number }) {
  const [previewData, setPreviewData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchPreview = async () => {
    if (!url || isLoading) return;
    
    setIsLoading(true);
    try {
      const response = await fetch('/api/scenario-scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url })
      });
      
      if (response.ok) {
        const data = await response.json();
        setPreviewData(data);
      }
    } catch (error) {
      console.error('Preview fetch error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (url) {
        fetchPreview();
      }
    }, 500); // Debounce URL changes

    return () => clearTimeout(timer);
  }, [url]);

  if (isLoading) {
    return (
      <Card className="business-card h-25">
        <CardContent className="p-4 h-full flex items-center justify-center">
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
            <span className="text-slate-400 text-xs">Yükleniyor...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!previewData) {
    return (
      <Card className="business-card h-25">
        <CardContent className="p-4 h-full flex items-center justify-center">
          <div className="flex items-center gap-2 text-slate-500">
            <Eye className="w-6 h-6" />
            <span className="text-xs">Önizleme bekleniyor...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const primaryImage = previewData.images?.[0];
  const imageUrl = resolvePreviewImageUrl(primaryImage);
  const previewVariants = sanitizeTrendyolVariants(previewData.variants, {
    productTitle: previewData.title,
  });
  const detectedColor = previewData.detectedColor || previewData.extractedColor || 'Renk Tespit Edilmedi';
  const availableSizes =
    previewData.stockAnalysis?.availableSizes ||
    previewVariants.allVariants.filter((v) => v.inStock && v.size).map((v) => v.size) ||
    previewVariants.sizes ||
    [];
  const outOfStockSizes =
    previewData.stockAnalysis?.unavailableSizes ||
    previewVariants.allVariants.filter((v) => !v.inStock && v.size).map((v) => v.size) ||
    [];
  const features = previewData.features || [];

  return (
    <Card className="business-card h-25 overflow-hidden">
      <CardContent className="p-0 h-full">
        {/* 300x100 Yatay Layout - Görsel Sol, Bilgiler Sağ */}
        <div className="flex h-full">
          {/* Sol Taraf - Görsel Alanı */}
          <div className="w-32 h-25 bg-slate-800 relative overflow-hidden flex-shrink-0">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={previewData.title}
                className="w-full h-full object-cover"
                onError={(e) => {
                  const img = e.currentTarget;
                  const proxy = imageUrl ? resolvePreviewProxyUrl(imageUrl) : null;
                  if (proxy && img.dataset.fallback !== "proxy") {
                    img.dataset.fallback = "proxy";
                    img.src = proxy;
                    return;
                  }
                  img.src = "/placeholder-image.jpg";
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Image className="w-6 h-6 text-slate-600" />
              </div>
            )}
            {/* Sıra Numarası */}
            <div className="absolute top-1 left-1 bg-blue-600 text-white px-1 py-0.5 rounded text-xs font-bold">
              #{index + 1}
            </div>
          </div>

          {/* Sağ Taraf - Ürün Bilgileri */}
          <div className="flex-1 p-2 space-y-1 overflow-hidden">
            {/* Marka ve Başlık */}
            <div>
              {previewData.brand && (
                <p className="text-blue-400 text-xs font-semibold uppercase">
                  {previewData.brand}
                </p>
              )}
              <h3 className="text-white text-xs font-bold line-clamp-2 leading-tight">
                {previewData.title || 'Başlık bulunamadı'}
              </h3>
            </div>

            {/* Tespit Edilen Renkler */}
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full"></div>
              <span className="text-slate-300 text-xs font-medium truncate">
                {previewVariants.colors.length > 0 
                  ? `${previewVariants.colors.length} Renk: ${previewVariants.colors.slice(0, 2).join(', ')}${previewVariants.colors.length > 2 ? '...' : ''}`
                  : detectedColor
                }
              </span>
            </div>

            {/* Tüm Bedenler - Stokta olanlar yeşil, olmayanlar gri */}
            {(availableSizes.length > 0 || outOfStockSizes.length > 0) && (
              <div>
                <div className="flex flex-wrap gap-0.5">
                  {/* Stokta olan bedenler - yeşil */}
                  {availableSizes.map((size: string, idx: number) => (
                    <span
                      key={`available-${idx}`}
                      className="bg-green-900 text-green-300 px-1 py-0.5 rounded text-xs font-medium"
                    >
                      {size}
                    </span>
                  ))}
                  {/* Stokta olmayan bedenler - gri */}
                  {outOfStockSizes.map((size: string, idx: number) => (
                    <span
                      key={`out-of-stock-${idx}`}
                      className="bg-gray-800 text-gray-500 px-1 py-0.5 rounded text-xs font-medium opacity-70"
                    >
                      {size}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Fiyat */}
            {previewData.price && typeof previewData.price === 'object' && (
              <div className="flex items-center gap-1">
                <span className="text-yellow-400 text-xs font-semibold">
                  {(previewData.price as any).formatted || (previewData.price as any).profitFormatted || ''}
                </span>
              </div>
            )}

            {/* Özellikler - Tek Satır */}
            {features.length > 0 && (
              <div className="text-xs text-slate-400 truncate">
                {features[0]?.key}: {features[0]?.value}
                {features.length > 1 && ` +${features.length - 1}`}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default ScraperPage;