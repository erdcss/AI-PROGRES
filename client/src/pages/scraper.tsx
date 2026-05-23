import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Loader2, ShoppingCart, Link, Copy, X, Home, Plus, Trash2, Package, Palette, Eye, Image, FileText, Shirt, Bell, ChevronDown, ChevronUp, ArrowLeft, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CSVPreview } from "@/components/CSVPreview";
import { CSVDrawerPreview } from "@/components/CSVDrawerPreview";
import * as Collapsible from "@radix-ui/react-collapsible";

import { toast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useIsMobile } from "@/hooks/use-mobile";
import ShopifySettingsDialog from "@/components/ShopifySettingsDialog";
import MiniBrowser from "@/components/MiniBrowser";


const scrapeSchema = z.object({
  url: z.string().url("Geçerli bir URL giriniz").refine(
    (url) => url.includes("trendyol.com"),
    "Sadece Trendyol URL'leri desteklenmektedir"
  ),
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
}

function ScraperPage() {
  const [product, setProduct] = useState<Product | null>(null);
  const [, setLocation] = useLocation();
  const [scrapingMode, setScrapingMode] = useState<ScrapingMode>('single');
  const [allImages, setAllImages] = useState<any[]>([]);
  const [productFeatures, setProductFeatures] = useState<any[]>([]);
  const [draggedUrls, setDraggedUrls] = useState<string[]>([]);
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
  const isMobile = useIsMobile();
  
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

  const singleScrapeMutation = useMutation({
    onMutate: () => {
      toast({
        title: "⚙️ Arka Planda Çalışıyor",
        description: "Ürün verisi çekiliyor. Bu sayfa açık kaldığı sürece işlem devam eder.",
        duration: 6000,
      });
    },
    mutationFn: async (data: ScrapeFormData & { onlyExtractData?: boolean }) => {
      // Shopify URL'lerini tespit et ve doğru endpoint'e yönlendir
      if (data.url.includes('.myshopify.com') || data.url.includes('shopify.com')) {
        // Bu bir Shopify URL'si - CSV generation endpoint'ine git
        console.log('🛒 Shopify URL detected, redirecting to CSV generation');
        const response = await fetch("/api/generate-multi-variant-csv", {
          method: "POST", 
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ 
            productData: { 
              url: data.url, 
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
        return { ...result, originalUrl: data.url };
      }
      
      // Normal Trendyol/Arçelik URL'leri için scenario-scrape (async job pattern)
      const startResp = await fetch("/api/scenario-scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          url: data.url, 
          mode: 'single', 
          onlyExtractData: data.onlyExtractData || false
        }),
      });
      if (!startResp.ok) {
        const errorData = await startResp.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${startResp.status}`);
      }
      const startData = await startResp.json();
      // If server returned synchronous result (non-async path), use it directly
      if (!startData.jobId) {
        return { ...startData, originalUrl: data.url };
      }
      // Poll for job completion
      const { jobId } = startData;
      const maxWait = 180000; // 3 minutes
      const pollInterval = 2500;
      const deadline = Date.now() + maxWait;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, pollInterval));
        const pollResp = await fetch(`/api/scrape-job/${jobId}`);
        if (!pollResp.ok) throw new Error(`Polling failed: HTTP ${pollResp.status}`);
        const pollData = await pollResp.json();
        if (pollData.status === 'done') {
          const result = pollData.result;
          if (result?.success === false) throw new Error(result.message || 'Extraction failed');
          return { ...result, originalUrl: data.url };
        }
        if (pollData.status === 'error') throw new Error(pollData.error || 'Scraping failed');
        // status === 'processing' → continue polling
      }
      throw new Error('Zaman aşımı — lütfen tekrar deneyin.');
    },
    onSuccess: (data) => {
      console.log('🎯 Single scrape mutation onSuccess received:', data);
      
      // Check if extraction actually succeeded
      if (!data || !data.success) {
        console.log('❌ Single scrape failed or blocked:', data);
        toast({
          title: "⚠️ Ürün Verileri Çekilemedi",
          description: "Sistem hatası veya site engellemesi tespit edildi. Lütfen URL'yi kontrol edin veya 10-15 dakika sonra tekrar deneyin.",
          variant: "destructive"
        });
        return;
      }
      
      // ULTRA FAST BLOCKING CHECK: Just check if we have minimum data for preview
      const hasMinimumData = data.title && data.title !== "trendyol.com" && data.title.length > 5;
      
      // Check if we have CSV content even for blocked responses
      const hasCSVData = data.csvContent && data.csvContent.length > 100;
      
      if (!hasMinimumData && !hasCSVData) {
        console.log('❌ NO USABLE DATA:', {
          title: data.title,
          titleLength: data.title?.length || 0,
          hasCSV: !!data.csvContent
        });
        
        toast({
          title: "🚫 Veri Alınamadı",
          description: `Sistem geçici olarak engellenmiş. Farklı bir URL deneyin.`,
          variant: "destructive"
        });
        return;
      }
      
      // Show warning for blocked responses but still process CSV
      if (!hasMinimumData && hasCSVData) {
        console.log('⚠️ BLOCKED RESPONSE with CSV data:', {
          title: data.title,
          hasCSV: !!data.csvContent
        });
        
        toast({
          title: "⚠️ Kısmi Veri",
          description: "Trendyol engellemesi tespit edildi ancak CSV oluşturuldu",
          variant: "default"
        });
      }
      
      // Always proceed if we have basic title data
      console.log('✅ MINIMUM DATA AVAILABLE - proceeding with preview');
      
      // Generate minimal CSV if missing
      if (!data.csvContent && data.title) {
        console.log('📋 Frontend: Creating minimal CSV for preview...');
        data.csvContent = `Handle,Title,Vendor,Price,Image Src,Status
${data.title.toLowerCase().replace(/[^a-z0-9]/g, '-')},${data.title},${data.brand || ''},${data.price?.original || 100},${data.images?.[0]?.url || data.images?.[0] || ''},active`;
      }
      
      console.log('✅ Single scrape successful, setting product data');
      console.log('🔍 Raw data received:', {
        title: data.title,
        brand: data.brand,
        price: data.price,
        imagesCount: data.images?.length,
        variantsColors: data.variants?.colors?.length,
        csvContent: !!data.csvContent
      });
      
      // ✅ DEBUG: Log images from API response
      console.log('📸 FRONTEND: Received images from API:', data.images);
      console.log('📸 FRONTEND: Images length:', data.images?.length);
      console.log('📸 FRONTEND: First image:', data.images?.[0]);
      
      // Transform the received data to match our Product interface
      const transformedProduct: Product = {
        id: data.id || `product-${Date.now()}`,
        title: data.title || 'Ürün Başlığı Bulunamadı',
        brand: data.brand || '',
        price: data.price || { profitFormatted: 'Fiyat Yok' },
        description: data.description || '',
        images: data.images || [],
        variants: {
          colors: data.variants?.colors || [],
          sizes: data.variants?.sizes || [],
          allVariants: data.variants?.allVariants || []
        },
        features: data.features || [],
        tags: data.tags || [],
        category: data.category || '',
        success: data.success,
        extractionMethod: data.extractionMethod,
        csvContent: data.csvContent
      };
      
      console.log('📸 FRONTEND: transformedProduct.images:', transformedProduct.images);
      console.log('📸 FRONTEND: transformedProduct.images.length:', transformedProduct.images?.length);
      
      console.log('🔄 Setting transformed product:', {
        id: transformedProduct.id,
        title: transformedProduct.title,
        imagesCount: transformedProduct.images?.length,
        csvContent: !!transformedProduct.csvContent
      });
      
      setProduct(transformedProduct);
      
      // Her başarılı çekme için CSV preview ekle
      if (data.csvContent) {
        console.log('🎯 Single URL CSV Content found, adding to previews:', data.title);
        
        // URL'e göre unique ID oluştur
        const urlHash = data.url?.split('?')[0] || Date.now().toString();
        const uniqueId = `csv-${urlHash.split('/').pop() || Date.now()}`;
        
        const newCSVPreview = {
          id: uniqueId,
          productTitle: data.title || 'Ürün',
          csvContent: data.csvContent,
          sourceUrl: data.sourceUrl || data.originalUrl || data.url || '',
          variants: {
            colors: data.variants?.colors || ['Standart'],
            sizes: data.variants?.sizes || ['Tek Beden']
          },
          images: data.images?.map((img: any) => typeof img === 'string' ? img : img.url) || [],
          createdAt: new Date().toISOString()
        };
        
        console.log('📋 Adding/Updating Single URL CSV preview:', newCSVPreview.id, newCSVPreview.productTitle);
        
        // Aynı ID'li preview varsa güncelle, yoksa ekle
        setCsvPreviews(prev => {
          const existingIndex = prev.findIndex(p => p.id === uniqueId);
          if (existingIndex >= 0) {
            // Mevcut preview'ı güncelle
            const updated = [...prev];
            updated[existingIndex] = newCSVPreview;
            console.log('♻️ Updated existing CSV preview');
            return updated;
          } else {
            // Yeni preview ekle
            console.log('➕ Added new CSV preview');
            return [newCSVPreview, ...prev];
          }
        });
        
        toast({
          title: "Başarılı", 
          description: "Ürün verisi çekildi ve CSV önizleme eklendi"
        });
      } else {
        toast({
          title: "Başarılı",
          description: "Ürün verisi çekildi"
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
              body: JSON.stringify({
                csvContent: csvToUpload,
                productTitle: preview.productTitle,
                sourceUrl: preview.sourceUrl,
                individualTags: allTags
              }),
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
    mutationFn: async () => {
      if (!product) {
        throw new Error("Önce ürün verisi çekilmelidir");
      }
      
      const response = await fetch("/api/shopify/upload-product", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ productData: product }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Başarılı",
        description: `Ürün Shopify'a başarıyla yüklendi (ID: ${data.shopifyId})`
      });
    },
    onError: (error: any) => {
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

  const onSingleSubmit = singleForm.handleSubmit((data) => {
    // Start the main scraping process - ONLY EXTRACT DATA (no tracking/transfer)
    singleScrapeMutation.mutate({ ...data, onlyExtractData: true });
    
    // No need for additional comprehensive image extraction since scenario-based scraper already extracts all needed images
    // Removed: extractAllImagesMutation.mutate(data.url); to prevent "Görsel Çıkarma Hatası" notifications
  });

  // Shopify transfer mutation
  const shopifyTransferMutation = useMutation({
    mutationFn: async (data: ScrapeFormData) => {
      console.log('🛒 Shopify transfer starting...');
      console.log('CSV previews available:', csvPreviews.length);
      const response = await fetch("/api/shopify-upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          productData: product,
          productUrl: data.url
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return response.json();
    },
    onSuccess: (data) => {
      console.log('📤 Shopify response:', data);
      if (data.success) {
        toast({
          title: "Başarılı!",
          description: `Ürün Shopify'a eklendi. ID: ${data.productId}`,
        });
      } else {
        toast({
          title: "Hata",
          description: data.message || "Shopify'a aktarım başarısız",
          variant: "destructive",
        });
      }
    },
    onError: (error) => {
      console.error('❌ Shopify transfer error:', error);
      toast({
        title: "Hata",
        description: `Shopify aktarımı başarısız: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const onShopifyTransfer = singleForm.handleSubmit((data) => {
    shopifyTransferMutation.mutate(data);
  });


  // Sürükle-bırak fonksiyonları
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const text = e.dataTransfer.getData('text/plain');
    const urls = text.split('\n').filter(line => 
      line.trim() && 
      (line.includes('trendyol.com') || line.includes('arcelik.com.tr'))
    );
    
    if (urls.length > 0) {
      const newUrls = urls.filter(url => !draggedUrls.includes(url.trim()));
      setDraggedUrls(prev => [...prev, ...newUrls.map(url => url.trim())]);
      toast({
        title: "URL'ler Eklendi",
        description: `${newUrls.length} yeni URL eklendi`
      });
    }
  };

  const addUrlManually = () => {
    const url = singleForm.getValues('url');
    if (url.trim() && !draggedUrls.includes(url.trim())) {
      setDraggedUrls(prev => [...prev, url.trim()]);
      singleForm.setValue('url', '');
      toast({
        title: "URL Eklendi",
        description: "URL listeye eklendi"
      });
    }
  };

  const removeUrl = (indexToRemove: number) => {
    setDraggedUrls(prev => prev.filter((_, index) => index !== indexToRemove));
  };

  const clearAllUrls = () => {
    setDraggedUrls([]);
    setCsvPreviews([]); // CSV önizlemelerini de temizle
    toast({
      title: "Temizlendi",
      description: "Tüm URL'ler ve CSV önizlemeleri silindi"
    });
  };

  // Comprehensive clear all function to reset the entire page
  const clearAllData = () => {
    // Reset all forms
    singleForm.reset();
    multiForm.setValue('urls', [{ url: '' }]);
    
    // Clear all state
    setProduct(null);
    setCsvPreviews([]);
    setAllImages([]);
    setProductFeatures([]);
    setDraggedUrls([]);
    
    // Reset mode to single
    setScrapingMode('single');
    
    toast({
      title: "Sayfa Temizlendi",
      description: "Tüm veriler ve formlar sıfırlandı"
    });
  };

  // CSV tag uygulama yardımcısı — hem tekil hem toplu yüklemede kullanılır
  const applyTagsToCSV = (csvContent: string, tags: string[]): string => {
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
  };

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

    for (let i = 0; i < csvPreviews.length; i++) {
      const preview = csvPreviews[i];
      setUploadProgress({ current: i + 1, total, successCount, failCount, currentTitle: preview.productTitle });

      try {
        const tags = individualTags[preview.id] || [];
        const csvToUpload = applyTagsToCSV(preview.csvContent, tags);
        const body = JSON.stringify({ csvContent: csvToUpload, productTitle: preview.productTitle, sourceUrl: preview.sourceUrl, individualTags: tags });

        // Retry up to 3 attempts total for 502/503/504 gateway errors
        const MAX_ATTEMPTS = 3;
        let lastErrMsg = '';
        let uploaded = false;

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          if (attempt > 1) {
            const retryDelay = attempt * 6000; // 12s, 18s
            setUploadProgress(prev => prev ? { ...prev, currentTitle: `${preview.productTitle} (deneme ${attempt}/${MAX_ATTEMPTS}...)` } : null);
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

      setUploadProgress(prev => prev ? { ...prev, successCount, failCount } : null);
    }

    setUploadProgress(null);
    setFailedUploads(failedList);
    toast({
      title: "Toplu Yükleme Tamamlandı",
      description: `✅ Başarılı: ${successCount}, ❌ Hatalı: ${failCount}`,
      duration: 8000,
    });
  };

  const processAllUrls = async () => {
    if (draggedUrls.length === 0) {
      toast({
        title: "Hata",
        description: "İşlemek için URL eklemeniz gerekiyor",
        variant: "destructive"
      });
      return;
    }

    setIsBulkProcessing(true);
    setBulkProgress({ current: 0, total: draggedUrls.length });

    toast({
      title: "🚀 Toplu Çekim Başladı",
      description: `${draggedUrls.length} ürün teker teker işlenecek...`,
      duration: 6000,
    });

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < draggedUrls.length; i++) {
      const url = draggedUrls[i].trim();
      if (!url) continue;

      setBulkProgress({ current: i + 1, total: draggedUrls.length });

      try {
        console.log(`📦 [${i + 1}/${draggedUrls.length}] Processing: ${url}`);

        // Start the scrape job (same pattern as singleScrapeMutation)
        const startResp = await fetch("/api/scenario-scrape", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, mode: 'single', onlyExtractData: true }),
        });

        if (!startResp.ok) {
          const errData = await startResp.json().catch(() => ({}));
          throw new Error(errData.message || `HTTP ${startResp.status}`);
        }

        const startData = await startResp.json();
        let data: any;

        if (!startData.jobId) {
          // Synchronous result
          data = { ...startData, originalUrl: url };
        } else {
          // Poll for job completion
          const { jobId } = startData;
          const maxWait = 180000;
          const pollInterval = 2500;
          const deadline = Date.now() + maxWait;
          while (Date.now() < deadline) {
            await new Promise(r => setTimeout(r, pollInterval));
            const pollResp = await fetch(`/api/scrape-job/${jobId}`);
            if (!pollResp.ok) throw new Error(`Polling hatası: HTTP ${pollResp.status}`);
            const pollData = await pollResp.json();
            if (pollData.status === 'done') {
              if (pollData.result?.success === false) throw new Error(pollData.result.message || 'Çekim başarısız');
              data = { ...pollData.result, originalUrl: url };
              break;
            }
            if (pollData.status === 'error') throw new Error(pollData.error || 'Scraping başarısız');
          }
          if (!data) throw new Error('Zaman aşımı — lütfen tekrar deneyin.');
        }

        if (!data || !data.title) {
          throw new Error('Ürün verisi alınamadı');
        }

        // If no csvContent returned, generate a minimal one
        let csvContent = data.csvContent;
        if (!csvContent && data.title) {
          const handle = data.title.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
          const price = data.price?.original || '';
          const img = data.images?.[0];
          const imgUrl = typeof img === 'string' ? img : img?.url || '';
          csvContent = `Title,URL handle,Description,Vendor,Product category,Type,Tags,Published on online store,Status,SKU,Barcode,Option1 name,Option1 value,Option1 Linked To,Option2 name,Option2 value,Option2 Linked To,Option3 name,Option3 value,Option3 Linked To,Price,Compare-at price,Cost per item,Charge tax,Tax code,Unit price total measure,Unit price total measure unit,Unit price base measure,Unit price base measure unit,Inventory tracker,Inventory quantity,Continue selling when out of stock,Weight value (grams),Weight unit for display,Requires shipping,Fulfillment service,Product image URL,Image position,Image alt text,Variant image URL,Gift card,SEO title,SEO description,Color (product.metafields.shopify.color-pattern),Google Shopping / Google product category,Google Shopping / Gender,Google Shopping / Age group,Google Shopping / Manufacturer part number (MPN),Google Shopping / Ad group name,Google Shopping / Ads labels,Google Shopping / Condition,Google Shopping / Custom product,Google Shopping / Custom label 0,Google Shopping / Custom label 1,Google Shopping / Custom label 2,Google Shopping / Custom label 3,Google Shopping / Custom label 4\n"${data.title}","${handle}",,,"${data.brand || ''}","Kategori","Kategori","","TRUE","active",,,,,,,,,,,,"${price}","","","TRUE","","","","","","shopify","0","CONTINUE","","g","TRUE","manual","${imgUrl}","1","${data.title}","","FALSE","${data.title}","${data.title}","","","","","","","","","","","","","",""`;
        }

        // Add CSV preview for this URL immediately
        const urlSlug = url.split('/').pop()?.split('?')[0] || `url-${i}`;
        const previewId = `bulk-${urlSlug}-${Date.now()}`;
        const newPreview = {
          id: previewId,
          productTitle: data.title || `Ürün ${i + 1}`,
          csvContent: csvContent,
          sourceUrl: url,
          variants: {
            colors: data.variants?.colors || [],
            sizes: data.variants?.sizes || [],
          },
          images: data.images?.map((img: any) => typeof img === 'string' ? img : img?.url).filter(Boolean) || [],
          price: data.price?.original || null,
          createdAt: new Date().toISOString()
        };

        setCsvPreviews(prev => [newPreview, ...prev]);
        successCount++;

        toast({
          title: `✅ ${i + 1}/${draggedUrls.length} tamamlandı`,
          description: data.title || url,
          duration: 3000,
        });

      } catch (error) {
        failCount++;
        console.error(`❌ [${i + 1}/${draggedUrls.length}] Error:`, error);
        toast({
          title: `❌ ${i + 1}/${draggedUrls.length} başarısız`,
          description: error instanceof Error ? error.message : 'Bilinmeyen hata',
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
  const handleCSVDownload = (id: string, filename: string) => {
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
  };

  // CSV Shopify upload fonksiyonu  
  const handleCSVShopifyUpload = async (id: string, individualTags?: string[]) => {
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
          body: JSON.stringify({
            csvContent: csvToUpload,
            productTitle: preview.productTitle,
            sourceUrl: preview.sourceUrl,
            individualTags: individualTags || []
          }),
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
  };

  // Shopify'a yükleme fonksiyonu
  const uploadToShopify = async (csvContent: string, productTitle: string) => {
    try {
      console.log('🛒 Shopify upload başlatılıyor...');
      console.log('CSV Content length:', csvContent?.length);
      console.log('Product title:', productTitle);
      
      if (!csvContent || csvContent.trim().length === 0) {
        throw new Error('CSV içeriği bulunamadı veya boş');
      }
      
      const response = await fetch('/api/shopify-upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          csvContent: csvContent,
          productTitle: productTitle || 'Multi-Color Product'
        })
      });

      const result = await response.json();
      console.log('📤 Shopify response:', result);

      if (response.ok && result.success) {
        toast({
          title: "Shopify'a Yüklendi!",
          description: `Ürün başarıyla Shopify mağazanıza eklendi. ID: ${result.productId || 'N/A'}`,
          duration: 5000
        });
      } else {
        throw new Error(result.error || result.message || "Shopify'a yüklenirken hata oluştu");
      }
    } catch (error) {
      console.error('❌ Shopify yükleme hatası:', error);
      toast({
        title: "Shopify Yükleme Hatası",
        description: error instanceof Error ? error.message : "Shopify'a yüklenirken bağlantı hatası oluştu",
        variant: "destructive",
        duration: 5000
      });
    }
  };

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
                onClick={clearAllData}
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
                  <motion.form 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
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
                        className={`border-2 border-dashed transition-all duration-200 rounded-lg text-center ${
                          isDragOver 
                            ? 'border-cyan-400 bg-cyan-900/20' 
                            : 'border-slate-600 bg-slate-800/50'
                        } ${isMobile ? 'p-6' : 'p-8'}`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                      >
                        <div className={`flex flex-col items-center ${isMobile ? 'gap-3' : 'gap-3'}`}>
                          <Package className={`text-cyan-400/70 ${isMobile ? 'w-8 h-8' : 'w-8 h-8'}`} />
                          <div className="text-center">
                            <p className={`text-white font-medium leading-tight ${
                              isMobile ? 'text-base' : 'text-base'
                            }`}>
                              Trendyol veya Arçelik URL'lerini buraya sürükleyin
                            </p>
                            <p className={`text-slate-400 mt-2 leading-tight ${
                              isMobile ? 'text-sm' : 'text-sm'
                            }`}>
                              Veya aşağıdaki alandan manuel olarak ekleyin
                            </p>
                          </div>
                        </div>
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
                    </div>

                    {/* Dahili Mini Tarayıcı */}
                    <MiniBrowser
                      onExtract={(url) => {
                        const trimmed = url.trim();
                        if (!trimmed) return;
                        if (!draggedUrls.includes(trimmed)) {
                          setDraggedUrls(prev => [...prev, trimmed]);
                          toast({ title: "URL Eklendi", description: "Tarayıcıdan URL listeye eklendi" });
                        } else {
                          toast({ title: "Zaten Ekli", description: "Bu URL zaten listede mevcut" });
                        }
                      }}
                    />

                    {/* URL Listesi */}
                    {draggedUrls.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-white font-thin text-sm">
                            Eklenmiş URL'ler ({draggedUrls.length})
                          </label>
                          <Button
                            type="button"
                            onClick={clearAllUrls}
                            variant="ghost"
                            className="text-red-400 hover:text-red-300 text-xs h-6 px-2"
                          >
                            Tümünü Sil
                          </Button>
                        </div>
                        <div className="max-h-40 overflow-y-auto space-y-2 bg-slate-800/30 rounded-lg p-3">
                          {draggedUrls.map((url, index) => (
                            <div key={index} className="flex items-center gap-2 bg-slate-700/50 px-3 py-2 rounded-md">
                              <span className="text-cyan-400 text-xs font-mono">#{index + 1}</span>
                              <span className="text-white text-xs flex-1 truncate">{url}</span>
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
                      </div>
                    )}
                    
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
                              <span className="text-xs text-emerald-400/70 block">/ {draggedUrls.length}</span>
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

                      {draggedUrls.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="relative">
                            {/* Nabız halkası animasyonu */}
                            {isBulkProcessing && (
                              <>
                                <span className="absolute inset-0 rounded-md animate-ping bg-green-400 opacity-20 pointer-events-none" />
                                <span className="absolute inset-0 rounded-md animate-pulse bg-green-300 opacity-10 pointer-events-none" />
                              </>
                            )}
                            <Button 
                              type="button"
                              onClick={processAllUrls}
                              disabled={isBulkProcessing}
                              className={`relative w-full overflow-hidden bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white h-14 text-lg font-medium transition-all duration-300 ${isBulkProcessing ? "shadow-lg shadow-green-500/40 scale-[1.01]" : ""}`}
                            >
                              {/* Hareketli shimmer şeridi */}
                              {isBulkProcessing && (
                                <span className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />
                              )}
                              {isBulkProcessing ? (
                                <div className="flex items-center gap-3">
                                  <div className="relative w-5 h-5 shrink-0">
                                    <span className="absolute inset-0 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                                    <span className="absolute inset-1 rounded-full bg-white/20 animate-pulse" />
                                  </div>
                                  <span className="flex flex-col items-start leading-tight">
                                    <span className="text-sm font-semibold">Veriler Çekiliyor...</span>
                                    <span className="text-xs font-normal opacity-75">{draggedUrls.length} ürün işleniyor</span>
                                  </span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <Package className="w-5 h-5" />
                                  ÜRÜN VERİLERİNİ ÇEK ({draggedUrls.length})
                                </div>
                              )}
                            </Button>
                          </div>
                          

                        </div>
                        
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="relative">
                            {singleScrapeMutation.isPending && (
                              <>
                                <span className="absolute inset-0 rounded-md animate-ping bg-green-400 opacity-20 pointer-events-none" />
                                <span className="absolute inset-0 rounded-md animate-pulse bg-green-300 opacity-10 pointer-events-none" />
                              </>
                            )}
                            <Button
                              type="submit"
                              disabled={singleScrapeMutation.isPending || shopifyTransferMutation.isPending}
                              className={`relative w-full overflow-hidden bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white h-14 text-lg font-medium transition-all duration-300 ${singleScrapeMutation.isPending ? "shadow-lg shadow-green-500/40 scale-[1.01]" : ""}`}
                            >
                              {singleScrapeMutation.isPending && (
                                <span className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />
                              )}
                              {singleScrapeMutation.isPending ? (
                                <div className="flex items-center gap-3">
                                  <div className="relative w-5 h-5 shrink-0">
                                    <span className="absolute inset-0 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                                    <span className="absolute inset-1 rounded-full bg-white/20 animate-pulse" />
                                  </div>
                                  <span className="flex flex-col items-start leading-tight">
                                    <span className="text-sm font-semibold">Ürün Verisi Çekiliyor...</span>
                                    <span className="text-xs font-normal opacity-75">Lütfen bekleyin</span>
                                  </span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <Package className="w-5 h-5" />
                                  <span>ÜRÜN VERİLERİNİ ÇEK</span>
                                </div>
                              )}
                            </Button>
                          </div>
                          
                          <Button
                            type="button"
                            onClick={onShopifyTransfer}
                            disabled={singleScrapeMutation.isPending || shopifyTransferMutation.isPending || !product}
                            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white h-14 text-lg font-medium disabled:opacity-50"
                          >
                            {shopifyTransferMutation.isPending ? (
                              <div className="flex items-center gap-2">
                                <Loader2 className="w-5 h-5 animate-spin" />
                                <span>Shopify'a Aktarılıyor...</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <ShoppingCart className="w-5 h-5" />
                                <span>SHOPIFY'A AKTAR</span>
                              </div>
                            )}
                          </Button>
                          

                          

                          

                        </div>
                      )}


                    </div>
                  </motion.form>
                </CardContent>
              </Card>
            </div>
          </div>


        </div>

        {/* Product Preview Section */}
        {product && (
          <div className="mt-8">

            <Card className="business-card bg-gradient-to-br from-slate-900/90 via-slate-800/50 to-slate-900/90 backdrop-blur border border-cyan-800/30">
              <CardHeader className="business-header">
                <CardTitle className="text-white font-thin text-lg flex items-center gap-2">
                  <Package className="w-5 h-5 text-cyan-400/70" />
                  Ürün Ön İzleme
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Sol Taraf - Görseller */}
                  <div className="space-y-4">
                    {product.images && product.images.length > 0 && (
                      <>
                        {/* Ana Büyük Görsel */}
                        <div className="relative aspect-square rounded-lg overflow-hidden border-2 border-cyan-800/40 bg-slate-900/50">
                          {product.images && product.images.length > 0 && product.images[0] ? (
                            <>
                              <img
                                src={typeof product.images[0] === 'string' ? product.images[0] : product.images[0].url}
                                alt={product.title}
                                className="w-full h-full object-cover"
                                data-testid="img-main-product"
                                onError={(e) => {
                                  e.currentTarget.src = 'https://via.placeholder.com/400?text=Görsel+Yüklenemedi';
                                }}
                              />
                              <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm px-3 py-1 rounded-full">
                                <span className="text-white text-sm font-medium flex items-center gap-1">
                                  <Image className="w-4 h-4" />
                                  {product.images.length} Görsel
                                </span>
                              </div>
                            </>
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <div className="text-center">
                                <Image className="w-16 h-16 mx-auto text-slate-600 mb-2" />
                                <p className="text-slate-400 text-sm">Görsel bulunamadı</p>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Tüm Resim Galerisi - Grid Layout */}
                        {product.images.length > 1 && (
                          <div className="space-y-2">
                            <span className="text-white/70 text-xs">Tüm Görseller ({product.images.length}):</span>
                            <div className="grid grid-cols-4 gap-2 max-h-96 overflow-y-auto p-1 bg-slate-900/30 rounded-lg border border-cyan-800/20">
                              {product.images.map((image, index) => {
                                const imageUrl = typeof image === 'string' ? image : image.url;
                                return (
                                  <div
                                    key={index}
                                    className="aspect-square rounded-md overflow-hidden border border-cyan-800/30 hover:border-cyan-500/60 transition-all cursor-pointer bg-slate-900/50 group relative"
                                    data-testid={`img-gallery-${index}`}
                                  >
                                    <img
                                      src={imageUrl}
                                      alt={`${product.title} ${index + 1}`}
                                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                                      onError={(e) => {
                                        e.currentTarget.style.display = 'none';
                                      }}
                                    />
                                    <div className="absolute bottom-1 right-1 bg-black/70 px-1.5 py-0.5 rounded text-white text-xs">
                                      {index + 1}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Varyant Seçenekleri - Collapsible Drawer */}
                        {product.variants && (product.variants.colors?.length > 0 || product.variants.sizes?.length > 0) && (
                          <Collapsible.Root 
                            open={isVariantsOpen} 
                            onOpenChange={setIsVariantsOpen}
                            className="space-y-2 mt-4"
                          >
                            <Collapsible.Trigger asChild>
                              <button
                                className="w-full flex items-center justify-between p-3 bg-gradient-to-r from-purple-900/30 to-indigo-900/30 hover:from-purple-800/40 hover:to-indigo-800/40 border border-purple-500/30 hover:border-purple-500/50 rounded-lg transition-all group"
                                data-testid="button-toggle-variants"
                              >
                                <div className="flex items-center gap-2">
                                  <Palette className="w-4 h-4 text-purple-400" />
                                  <span className="text-purple-200 text-sm font-medium">
                                    Varyant Seçenekleri
                                  </span>
                                  {product.variants.allVariants && (
                                    <span className="bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded text-xs">
                                      {product.variants.allVariants.length}
                                    </span>
                                  )}
                                </div>
                                {isVariantsOpen ? (
                                  <ChevronUp className="w-4 h-4 text-purple-400 group-hover:text-purple-300 transition-colors" />
                                ) : (
                                  <ChevronDown className="w-4 h-4 text-purple-400 group-hover:text-purple-300 transition-colors" />
                                )}
                              </button>
                            </Collapsible.Trigger>

                            <Collapsible.Content className="overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2">
                              <div className="bg-gradient-to-br from-purple-900/20 to-indigo-900/20 border border-purple-500/20 rounded-lg p-4 space-y-4">
                                
                                {/* Renk Bazlı Beden Detayları */}
                                {product.variants.colors && product.variants.colors.length > 0 && product.variants.allVariants && (
                                  <div className="space-y-2">
                                    {product.variants.colors.map((color, colorIndex) => {
                                      const colorVariants = product.variants.allVariants?.filter(v => v.color === color) || [];
                                      const inStockSizes = colorVariants.filter(v => v.inStock).map(v => v.size);
                                      const outOfStockSizes = colorVariants.filter(v => !v.inStock).map(v => v.size);
                                      const hasAnyStock = inStockSizes.length > 0;
                                      
                                      return (
                                        <div 
                                          key={colorIndex}
                                          className={`
                                            rounded-lg border p-2 transition-all
                                            ${hasAnyStock 
                                              ? 'bg-purple-800/10 border-purple-500/30' 
                                              : 'bg-slate-700/10 border-slate-600/20 opacity-60'
                                            }
                                          `}
                                          data-testid={`drawer-color-${colorIndex}`}
                                        >
                                          {/* Renk Başlığı */}
                                          <div className="flex items-center gap-2 mb-1.5">
                                            <div className={`w-3 h-3 rounded-full ${
                                              hasAnyStock 
                                                ? 'bg-gradient-to-br from-purple-400 to-pink-400' 
                                                : 'bg-slate-500'
                                            }`}></div>
                                            <span className={`font-medium text-xs ${
                                              hasAnyStock ? 'text-purple-200' : 'text-slate-400'
                                            }`}>
                                              {color}
                                            </span>
                                            <span className="text-xs text-slate-400">
                                              ({inStockSizes.length}/{colorVariants.length})
                                            </span>
                                          </div>
                                          
                                          {/* Bedenler */}
                                          <div className="flex flex-wrap gap-1 ml-5">
                                            {inStockSizes.map((size, idx) => (
                                              <span
                                                key={`in-${idx}`}
                                                className="bg-green-900/40 border border-green-600/50 text-green-200 px-1.5 py-0.5 rounded text-xs flex items-center gap-0.5"
                                                data-testid={`drawer-size-in-${colorIndex}-${idx}`}
                                              >
                                                <span className="text-green-400 text-xs">✓</span>
                                                {size}
                                              </span>
                                            ))}
                                            {outOfStockSizes.map((size, idx) => (
                                              <span
                                                key={`out-${idx}`}
                                                className="bg-slate-700/40 border border-slate-600/50 text-slate-400 px-1.5 py-0.5 rounded text-xs flex items-center gap-0.5 opacity-50"
                                                data-testid={`drawer-size-out-${colorIndex}-${idx}`}
                                              >
                                                <span className="text-slate-500 text-xs">✗</span>
                                                {size}
                                              </span>
                                            ))}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}

                                {/* Özet */}
                                {product.stockAnalysis && (
                                  <div className="flex items-center justify-between pt-2 border-t border-purple-500/20 text-xs">
                                    <div className="flex items-center gap-2">
                                      <span className="text-green-300">✓ {product.stockAnalysis.inStockVariants} Stokta</span>
                                      <span className="text-slate-400">•</span>
                                      <span className="text-red-300">✗ {product.stockAnalysis.outOfStockVariants} Tükendi</span>
                                    </div>
                                    <span className="text-slate-400">
                                      Toplam: {product.stockAnalysis.totalVariants}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </Collapsible.Content>
                          </Collapsible.Root>
                        )}
                      </>
                    )}
                  </div>
                  
                  {/* Sağ Taraf - Bilgiler */}
                  <div className="space-y-4">
                    {/* Marka */}
                    {product.brand && (
                      <div>
                        <span className="text-blue-400 text-sm font-semibold uppercase">
                          {product.brand}
                        </span>
                      </div>
                    )}
                    
                    {/* Başlık */}
                    <h2 className="text-white text-2xl font-bold leading-tight">
                      {product.title}
                    </h2>
                    
                    {/* Fiyatlar - Hem Orijinal Hem Karlı */}
                    {product.price && (
                      <div className="space-y-2 border-t border-b border-cyan-800/30 py-4">
                        {typeof product.price === 'object' && (
                          <>
                            {product.price.formatted && (
                              <div className="flex items-center justify-between">
                                <span className="text-white/70 text-sm">Orijinal Fiyat:</span>
                                <span className="text-white/50 text-lg line-through" data-testid="text-original-price">
                                  {product.price.formatted}
                                </span>
                              </div>
                            )}
                            {product.price.profitFormatted && (
                              <div className="flex items-center justify-between">
                                <span className="text-white/70 text-sm">Karlı Fiyat:</span>
                                <span className="text-yellow-400 text-2xl font-bold" data-testid="text-profit-price">
                                  {product.price.profitFormatted}
                                </span>
                              </div>
                            )}
                          </>
                        )}
                        {typeof product.price !== 'object' && (
                          <span className="text-yellow-400 text-2xl font-bold">
                            {product.price} TL
                          </span>
                        )}
                      </div>
                    )}

                    {/* Enhanced Variant Display - Color Based Size Details */}
                    {product.variants && (product.variants.colors?.length > 0 || product.variants.sizes?.length > 0) && (
                      <div className="bg-gradient-to-br from-indigo-900/30 via-purple-900/20 to-pink-900/30 rounded-xl border-2 border-indigo-500/30 p-4 space-y-4 shadow-lg">
                        <div className="flex items-center gap-2 border-b border-indigo-500/20 pb-2">
                          <Shirt className="w-5 h-5 text-indigo-400" />
                          <span className="text-indigo-300 font-semibold text-base">Detaylı Varyant Bilgileri</span>
                          {product.variants.allVariants && (
                            <span className="ml-auto bg-indigo-500/20 text-indigo-300 px-2 py-1 rounded-md text-xs font-medium">
                              {product.variants.allVariants.length} Varyant
                            </span>
                          )}
                        </div>
                        
                        {/* Renk Bazlı Beden Detayları */}
                        {product.variants.colors && product.variants.colors.length > 0 && product.variants.allVariants && (
                          <div className="space-y-3">
                            {product.variants.colors.map((color, colorIndex) => {
                              // Bu renkteki tüm varyantları bul
                              const colorVariants = product.variants.allVariants?.filter(v => v.color === color) || [];
                              const inStockSizes = colorVariants.filter(v => v.inStock).map(v => v.size);
                              const outOfStockSizes = colorVariants.filter(v => !v.inStock).map(v => v.size);
                              const hasAnyStock = inStockSizes.length > 0;
                              
                              return (
                                <div 
                                  key={colorIndex}
                                  className={`
                                    bg-gradient-to-r rounded-lg border-2 p-3 transition-all
                                    ${hasAnyStock 
                                      ? 'from-purple-900/20 to-indigo-900/20 border-purple-500/30' 
                                      : 'from-slate-800/20 to-slate-700/20 border-slate-600/30 opacity-70'
                                    }
                                  `}
                                  data-testid={`color-variant-${colorIndex}`}
                                >
                                  {/* Renk Başlığı */}
                                  <div className="flex items-center gap-2 mb-2">
                                    <div className={`w-4 h-4 rounded-full ${
                                      hasAnyStock 
                                        ? 'bg-gradient-to-br from-purple-400 to-pink-400 shadow-lg shadow-purple-500/50' 
                                        : 'bg-slate-500'
                                    }`}></div>
                                    <span className={`font-semibold text-sm ${
                                      hasAnyStock ? 'text-purple-200' : 'text-slate-400'
                                    }`}>
                                      {color}
                                    </span>
                                    <span className="text-xs text-slate-400">
                                      ({inStockSizes.length} / {colorVariants.length} stokta)
                                    </span>
                                    {!hasAnyStock && (
                                      <span className="ml-auto text-xs text-red-400 bg-red-900/30 px-2 py-0.5 rounded">
                                        Tükendi
                                      </span>
                                    )}
                                  </div>
                                  
                                  {/* Bu Rengin Bedenleri */}
                                  <div className="flex flex-wrap gap-1.5 ml-6">
                                    {/* Stokta Olan Bedenler */}
                                    {inStockSizes.map((size, sizeIdx) => (
                                      <div
                                        key={`in-${sizeIdx}`}
                                        className="bg-green-900/40 border border-green-600/50 text-green-200 px-2 py-1 rounded text-xs font-medium flex items-center gap-1"
                                        data-testid={`size-in-stock-${colorIndex}-${sizeIdx}`}
                                      >
                                        <span className="text-green-400">✓</span>
                                        {size}
                                      </div>
                                    ))}
                                    
                                    {/* Stokta Olmayan Bedenler */}
                                    {outOfStockSizes.map((size, sizeIdx) => (
                                      <div
                                        key={`out-${sizeIdx}`}
                                        className="bg-slate-700/40 border border-slate-600/50 text-slate-400 px-2 py-1 rounded text-xs font-medium flex items-center gap-1 opacity-60"
                                        data-testid={`size-out-stock-${colorIndex}-${sizeIdx}`}
                                      >
                                        <span className="text-slate-500">✗</span>
                                        {size}
                                      </div>
                                    ))}
                                    
                                    {colorVariants.length === 0 && (
                                      <span className="text-slate-500 text-xs italic">Beden bilgisi yok</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        
                        {/* Genel Özet - Tüm Renkler ve Bedenler */}
                        {product.variants.colors && product.variants.sizes && (
                          <div className="bg-indigo-900/20 rounded-lg border border-indigo-500/20 p-3 space-y-2">
                            <div className="text-indigo-300 text-xs font-semibold mb-2">📊 Genel Özet</div>
                            
                            {/* Tüm Renkler */}
                            <div className="flex items-start gap-2">
                              <Palette className="w-3 h-3 text-purple-400 mt-0.5" />
                              <div className="flex-1">
                                <div className="text-white/60 text-xs mb-1">Renkler ({product.variants.colors.length}):</div>
                                <div className="flex flex-wrap gap-1">
                                  {product.variants.colors.map((color, idx) => {
                                    const hasStock = product.variants.allVariants?.some(v => v.color === color && v.inStock);
                                    return (
                                      <span 
                                        key={idx}
                                        className={`text-xs px-1.5 py-0.5 rounded ${
                                          hasStock 
                                            ? 'bg-purple-500/30 text-purple-200' 
                                            : 'bg-slate-600/30 text-slate-400 line-through'
                                        }`}
                                      >
                                        {color}
                                      </span>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                            
                            {/* Tüm Bedenler */}
                            <div className="flex items-start gap-2">
                              <Shirt className="w-3 h-3 text-green-400 mt-0.5" />
                              <div className="flex-1">
                                <div className="text-white/60 text-xs mb-1">Bedenler ({product.variants.sizes.length}):</div>
                                <div className="flex flex-wrap gap-1">
                                  {product.variants.sizes.map((size, idx) => {
                                    const stockCount = product.variants.allVariants?.filter(v => v.size === size && v.inStock).length || 0;
                                    return (
                                      <span 
                                        key={idx}
                                        className={`text-xs px-1.5 py-0.5 rounded ${
                                          stockCount > 0 
                                            ? 'bg-green-500/30 text-green-200' 
                                            : 'bg-slate-600/30 text-slate-400'
                                        }`}
                                      >
                                        {size} {stockCount > 0 && `(${stockCount})`}
                                      </span>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {/* Stok Özeti */}
                        {product.stockAnalysis && (
                          <div className="flex items-center gap-4 pt-2 border-t border-indigo-500/20 text-xs">
                            <div className="flex items-center gap-1.5">
                              <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                              <span className="text-green-300 font-medium">{product.stockAnalysis.inStockVariants} Stokta</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <div className="w-2 h-2 bg-red-400 rounded-full"></div>
                              <span className="text-red-300 font-medium">{product.stockAnalysis.outOfStockVariants} Tükendi</span>
                            </div>
                            <div className="ml-auto text-slate-400">
                              Toplam: {product.stockAnalysis.totalVariants} varyant
                            </div>
                          </div>
                        )}
                      </div>
                    )}


                    {/* Ürün Açıklaması */}
                    {product.description && product.description.trim() && (
                      <div className="space-y-2">
                        <span className="text-white/70 text-sm flex items-center gap-2">
                          <FileText className="w-4 h-4" />
                          Ürün Açıklaması:
                        </span>
                        <div className="bg-slate-800/30 rounded-lg border border-cyan-800/30 p-4 max-h-40 overflow-y-auto">
                          <p className="text-white/80 text-sm leading-relaxed whitespace-pre-wrap">
                            {product.description}
                          </p>
                        </div>
                      </div>
                    )}


                    {/* Kategori */}
                    {product.category && (
                      <div className="flex items-center gap-2">
                        <span className="text-white/70 text-sm">Kategori:</span>
                        <span className="bg-purple-900/30 text-purple-300 px-3 py-1.5 rounded-md text-sm border border-purple-800/40">
                          {product.category}
                        </span>
                      </div>
                    )}

                    {/* Varyant Bilgileri - Kompakt Alan */}
                    {(() => {
                      const colors = product.variants?.colors?.filter(c => c && c !== 'Standart' && c !== 'Tek Renk') || [];
                      const sizes = product.variants?.sizes?.filter(s => s && s !== 'Tek Beden') || [];
                      const hasRealVariants = colors.length > 0 || sizes.length > 0;

                      if (!hasRealVariants) return null;

                      return (
                        <div className="bg-gradient-to-r from-slate-800/40 to-slate-700/40 rounded-lg border border-cyan-800/30 p-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <Shirt className="w-4 h-4 text-cyan-400" />
                            <span className="text-cyan-300 text-sm font-medium">Varyant Bilgileri</span>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-3">
                            {/* Renkler */}
                            {colors.length > 0 && (
                              <div className="space-y-1">
                                <span className="text-white/60 text-xs">Renkler ({colors.length})</span>
                                <div className="flex flex-wrap gap-1">
                                  {colors.slice(0, 3).map((color, idx) => (
                                    <span 
                                      key={idx}
                                      className="bg-purple-900/30 text-purple-300 px-2 py-0.5 rounded text-xs border border-purple-800/40"
                                    >
                                      {color}
                                    </span>
                                  ))}
                                  {colors.length > 3 && (
                                    <span className="text-purple-400 text-xs px-1">+{colors.length - 3}</span>
                                  )}
                                </div>
                              </div>
                            )}
                            
                            {/* Bedenler */}
                            {sizes.length > 0 && (
                              <div className="space-y-1">
                                <span className="text-white/60 text-xs">Bedenler ({sizes.length})</span>
                                <div className="flex flex-wrap gap-1">
                                  {sizes.slice(0, 4).map((size, idx) => (
                                    <span 
                                      key={idx}
                                      className="bg-green-900/30 text-green-300 px-2 py-0.5 rounded text-xs border border-green-800/40"
                                    >
                                      {size}
                                    </span>
                                  ))}
                                  {sizes.length > 4 && (
                                    <span className="text-green-400 text-xs px-1">+{sizes.length - 4}</span>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                    

                    {/* Renk ve Beden Özeti (varyant detayı yoksa) */}
                    {(!product.variants?.allVariants || product.variants.allVariants.length === 0) && (
                      <>
                        {product.variants?.colors && product.variants.colors.length > 0 && (
                          <div>
                            <span className="text-white/70 text-sm">Renk Seçenekleri:</span>
                            <div className="flex flex-wrap gap-2 mt-1">
                              {product.variants.colors.map((color, index) => (
                                <span 
                                  key={index}
                                  className="bg-cyan-900/30 text-cyan-300 px-2 py-1 rounded-md text-xs border border-cyan-800/40"
                                >
                                  {color}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {product.variants?.sizes && product.variants.sizes.length > 0 && (
                          <div>
                            <span className="text-white/70 text-sm">Beden Seçenekleri:</span>
                            <div className="flex flex-wrap gap-2 mt-1">
                              {product.variants.sizes.map((size, index) => (
                                <span 
                                  key={index}
                                  className="bg-green-900/30 text-green-300 px-2 py-1 rounded-md text-xs border border-green-800/40"
                                >
                                  {size}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* Ürün Özellikleri */}
                    {product.features && product.features.length > 0 && (
                      <div className="space-y-2">
                        <span className="text-white/70 text-sm flex items-center gap-2">
                          <FileText className="w-4 h-4" />
                          Ürün Özellikleri:
                        </span>
                        <div className="bg-slate-800/30 rounded-lg border border-cyan-800/30 p-3 max-h-32 overflow-y-auto">
                          {product.features.map((feature, index) => (
                            <div key={index} className="flex gap-2 text-xs py-1">
                              <span className="text-cyan-400 min-w-[100px]">{feature.key}:</span>
                              <span className="text-white/70">{feature.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {product.csvContent && (
                  <div className="mt-4 pt-4 border-t border-cyan-800/30">
                    <Button
                      onClick={() => {
                        const filename = `${(product.title || 'urun').slice(0, 40).replace(/[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ ]/g, '').trim().replace(/\s+/g, '-')}-shopify.csv`;
                        downloadCSV(product.csvContent, filename);
                        toast({ title: "CSV İndirildi", description: filename });
                      }}
                      className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-medium"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      CSV Olarak Dışa Aktar
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Variant Preview Section */}
        {product && product.variants && (
          (() => {
            // Handle both array and object variant formats
            let variants = product.variants;
            let allVariants = [];
            
            if (Array.isArray(product.variants)) {
              // Backend array format
              allVariants = product.variants;
              const colors = [...new Set(allVariants.map(v => v.color))];
              const sizes = [...new Set(allVariants.map(v => v.size))];
              variants = { colors, sizes, allVariants };
            } else if (product.variants.allVariants && Array.isArray(product.variants.allVariants)) {
              // Object format with allVariants array
              allVariants = product.variants.allVariants;
            } else if (product.variants.colors && product.variants.sizes) {
              // Object format with separate colors/sizes arrays
              for (const color of product.variants.colors) {
                for (const size of product.variants.sizes) {
                  allVariants.push({
                    color,
                    size,
                    inStock: true // Default to in stock if no specific info
                  });
                }
              }
            }

            // Convert array format to object format after processing
            if (Array.isArray(product.variants) && allVariants.length > 0) {
              const colors = [...new Set(allVariants.map(v => v.color))];
              const sizes = [...new Set(allVariants.map(v => v.size))];
              variants = { colors, sizes, allVariants };
              console.log('🔄 Array variants converted to object format:', variants);
            }

            // Debug variants structure
            console.log('🔧 FRONTEND DEBUG: product.variants type:', typeof product.variants);
            console.log('🔧 FRONTEND DEBUG: product.variants:', JSON.stringify(product.variants, null, 2));
            console.log('🔧 FRONTEND DEBUG: allVariants length:', allVariants.length);
            console.log('🔧 FRONTEND DEBUG: variants object:', variants);

            // Only show if we have actual variants  
            const hasVariants = allVariants.length > 0 || 
                               (variants?.colors?.length > 0) || 
                               (variants?.sizes?.length > 0) ||
                               (variants?.allVariants?.length > 0);
            
            console.log('🔧 FRONTEND DEBUG: hasVariants:', hasVariants);
            
            if (!hasVariants) {
              console.log('❌ No variants found to display');
              return null;
            }
            
            return hasVariants ? (
              <div className="mt-8">
                <Card className="business-card bg-gradient-to-br from-slate-900/90 via-slate-800/50 to-slate-900/90 backdrop-blur border border-cyan-800/30">
                  <CardHeader className="business-header">
                    <CardTitle className="text-white font-thin text-lg flex items-center gap-2">
                      <Palette className="w-5 h-5 text-purple-400/70" />
                      Ürün Varyantları
                      {allVariants.length > 0 && (
                        <span className="text-purple-400 text-sm bg-purple-400/10 px-2 py-1 rounded">
                          {allVariants.length} varyant
                        </span>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="space-y-6">
                      
                      {/* Color Options */}
                      {variants?.colors && variants.colors.length > 0 && (
                        <div>
                          <h3 className="text-white font-medium mb-3 flex items-center gap-2">
                            <div className="w-3 h-3 bg-gradient-to-r from-red-400 to-blue-400 rounded-full"></div>
                            Renk Seçenekleri ({variants.colors.length})
                          </h3>
                          <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-8 gap-3">
                            {variants.colors.map((color, index) => (
                              <div
                                key={index}
                                className="bg-cyan-900/20 border border-cyan-800/40 rounded-lg p-3 text-center hover:border-cyan-600/60 transition-all duration-200"
                              >
                                <div className="text-cyan-300 font-medium text-sm">{color}</div>
                                <div className="text-cyan-500 text-xs mt-1">Mevcut</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Size Options */}
                      {variants?.sizes && variants.sizes.length > 0 && (
                        <div>
                          <h3 className="text-white font-medium mb-3 flex items-center gap-2">
                            <Shirt className="w-4 h-4 text-green-400" />
                            Beden Seçenekleri ({variants.sizes.length})
                          </h3>
                          <div className="grid grid-cols-4 sm:grid-cols-8 lg:grid-cols-12 gap-2">
                            {variants.sizes.map((size, index) => (
                              <div
                                key={index}
                                className="bg-green-900/20 border border-green-800/40 rounded-lg p-2 text-center hover:border-green-600/60 transition-all duration-200"
                              >
                                <div className="text-green-300 font-bold text-sm">{size}</div>
                                <div className="text-green-500 text-xs">Stokta</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}


                      {/* No Variants Message */}
                      {(!variants?.colors?.length && !variants?.sizes?.length && allVariants.length === 0) && (
                        <div className="text-center py-8">
                          <Package className="w-12 h-12 text-slate-500 mx-auto mb-3" />
                          <p className="text-slate-400 text-sm">Bu ürün için varyant bilgisi bulunamadı</p>
                          <p className="text-slate-500 text-xs mt-1">Tek varyantlı ürün olarak işlenecek</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : null;
          })()
        )}

        {/* All Images Display Section */}
        {allImages.length > 0 && (
          <div className="mt-8">
            <Card className="business-card">
              <CardHeader className="business-header">
                <CardTitle className="text-white font-thin text-lg flex items-center gap-2">
                  <Image className="w-5 h-5 text-cyan-400/70" />
                  Tüm Ürün Görselleri ({allImages.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {allImages.slice(0, 24).map((image, index) => (
                    <div key={index} className="relative group">
                      <img
                        src={image.url || image}
                        alt={`Ürün görseli ${index + 1}`}
                        className="w-full h-24 object-cover rounded-lg border border-cyan-800/30 group-hover:border-cyan-600 transition-colors"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                        <span className="text-white text-xs">{index + 1}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {allImages.length > 24 && (
                  <p className="text-white/60 text-sm mt-4 text-center">
                    ve {allImages.length - 24} görsel daha...
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Product Features Display Section */}
        {productFeatures.length > 0 && (
          <div className="mt-8">
            <Card className="business-card">
              <CardHeader className="business-header">
                <CardTitle className="text-white font-thin text-lg flex items-center gap-2">
                  <Eye className="w-5 h-5 text-cyan-400/70" />
                  Ürün Özellikleri ({productFeatures.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {productFeatures.map((feature, index) => (
                    <div key={index} className="flex justify-between items-center p-3 bg-slate-800/30 rounded-lg border border-cyan-800/20">
                      <span className="text-white/80 font-medium text-sm">{feature.key}</span>
                      <span className="text-cyan-400 text-sm">{feature.value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}



        {/* CSV Drawer Preview - Tüm CSV'ler */}
        {csvPreviews.length > 0 && (
          <div className="mt-8">
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
  const imageUrl = typeof primaryImage === 'string' ? primaryImage : primaryImage?.url;
  const detectedColor = previewData.detectedColor || previewData.extractedColor || 'Renk Tespit Edilmedi';
  const availableSizes = previewData.variants?.availableSizes || previewData.variants?.sizes || [];
  const outOfStockSizes = previewData.variants?.unavailableSizes || [];
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
                  e.currentTarget.src = '/placeholder-image.jpg';
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
                {previewData.variants?.colors?.length > 0 
                  ? `${previewData.variants.colors.length} Renk: ${previewData.variants.colors.slice(0, 2).join(', ')}${previewData.variants.colors.length > 2 ? '...' : ''}`
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
            {previewData.price && (
              <div className="flex items-center gap-1">
                <span className="text-yellow-400 text-xs font-semibold">
                  {previewData.price.formatted || previewData.price.profitFormatted || ''}
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