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
    (url) => url.includes("pttavm.com"),
    "Sadece PttAvm URL'leri desteklenmektedir"
  ),
});

const multiUrlSchema = z.object({
  urls: z.array(z.object({
    url: z.string().url("Geçerli bir URL giriniz").refine(
      (url) => url.includes("pttavm.com"),
      "Sadece PttAvm URL'leri desteklenmektedir"
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

function PttAvmScraperPage() {
  const [product, setProduct] = useState<Product | null>(null);
  const [, setLocation] = useLocation();
  const [scrapingMode, setScrapingMode] = useState<ScrapingMode>('single');
  const [allImages, setAllImages] = useState<any[]>([]);
  const [productFeatures, setProductFeatures] = useState<any[]>([]);
  const [draggedUrls, setDraggedUrls] = useState<string[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [csvPreviews, setCsvPreviews] = useState<any[]>([]);
  const [individualTags, setIndividualTags] = useState<{[key: string]: string[]}>({});
  const extractAllColors = true;
  const [isVariantsOpen, setIsVariantsOpen] = useState(false);
  const [isPasteOpen, setIsPasteOpen] = useState(false);
  const [pastedHtml, setPastedHtml] = useState('');
  const [pasteSourceUrl, setPasteSourceUrl] = useState('');
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
      const startResp = await fetch("/api/pttavm-scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: data.url }),
      });
      if (!startResp.ok) {
        const errorData = await startResp.json().catch(() => ({}));
        throw new Error((errorData as any).message || `HTTP ${startResp.status}`);
      }
      const startData = await startResp.json();
      if (!startData.jobId) {
        return { ...startData, originalUrl: data.url };
      }
      const { jobId } = startData;
      const maxWait = 180000;
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
      }
      throw new Error('Zaman aşımı — lütfen tekrar deneyin.');
    },
    onSuccess: (data) => {
      console.log('🎯 PttAvm scrape mutation onSuccess received:', data);
      
      if (!data || !data.success) {
        toast({
          title: "⚠️ Ürün Verileri Çekilemedi",
          description: "Sistem hatası veya site engellemesi tespit edildi. Lütfen URL'yi kontrol edin veya tekrar deneyin.",
          variant: "destructive"
        });
        return;
      }
      
      const hasMinimumData = data.title && data.title.length > 5;
      const hasCSVData = data.csvContent && data.csvContent.length > 100;
      
      if (!hasMinimumData && !hasCSVData) {
        toast({
          title: "🚫 Veri Alınamadı",
          description: `Farklı bir URL deneyin.`,
          variant: "destructive"
        });
        return;
      }
      
      if (!data.csvContent && data.title) {
        data.csvContent = `Handle,Title,Vendor,Price,Image Src,Status\n${data.title.toLowerCase().replace(/[^a-z0-9]/g, '-')},${data.title},${data.brand || ''},${data.price?.original || 100},${data.images?.[0]?.url || data.images?.[0] || ''},active`;
      }
      
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
      
      setProduct(transformedProduct);
      
      if (data.csvContent) {
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
        
        setCsvPreviews(prev => {
          const existingIndex = prev.findIndex(p => p.id === uniqueId);
          if (existingIndex >= 0) {
            const updated = [...prev];
            updated[existingIndex] = newCSVPreview;
            return updated;
          } else {
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
          const allTags = individualTags[preview.id] || [];
          let csvToUpload = preview.csvContent;
          const manualTags = allTags;
          
          if (manualTags.length > 0) {
            const lines = csvToUpload.split('\n').filter((line: string) => line.trim());
            if (lines.length >= 2) {
              const parseCSVLine = (line: string) => {
                const result = [];
                let current = '';
                let inQuotes = false;
                for (let i = 0; i < line.length; i++) {
                  const char = line[i];
                  if (char === '"') { inQuotes = !inQuotes; }
                  else if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
                  else { current += char; }
                }
                result.push(current.trim());
                return result;
              };
              const headers = parseCSVLine(lines[0]).map((h: string) => h.replace(/"/g, '').trim());
              const tagsIndex = headers.findIndex((h: string) => h.toLowerCase() === 'tags');
              if (tagsIndex !== -1) {
                const updatedLines = [lines[0]];
                for (let i = 1; i < lines.length; i++) {
                  const cells = parseCSVLine(lines[i]);
                  if (cells[tagsIndex] !== undefined) {
                    const existingTags = cells[tagsIndex].replace(/"/g, '').trim();
                    const allTagsStr = existingTags ? `${existingTags}, ${manualTags.join(', ')}` : manualTags.join(', ');
                    cells[tagsIndex] = `"${allTagsStr}"`;
                  }
                  const newLine = cells.map((cell: string) => {
                    if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) return `"${cell.replace(/"/g, '""')}"`;
                    return cell;
                  }).join(',');
                  updatedLines.push(newLine);
                }
                csvToUpload = updatedLines.join('\n');
              }
            }
          }
          
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3 * 60 * 1000);
          let response: Response;
          try {
            response = await fetch("/api/shopify/upload-csv-product", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: controller.signal,
              body: JSON.stringify({ csvContent: csvToUpload, productTitle: preview.productTitle, sourceUrl: preview.sourceUrl, individualTags: allTags }),
            });
          } finally { clearTimeout(timeoutId); }

          if (response.ok) {
            const result = await response.json();
            if (result.success || result.shopifyId || result.productId) {
              results.push({ success: true, title: preview.productTitle, shopifyId: result.shopifyId || result.productId });
            } else if (result.error && result.error.includes('yakın zamanda yüklendi')) {
              results.push({ success: true, title: preview.productTitle, shopifyId: 'duplicate-blocked' });
            } else {
              results.push({ success: false, title: preview.productTitle, error: result.error || result.message || 'Bilinmeyen hata' });
            }
          } else {
            const errorData = await response.json().catch(() => ({}) as any);
            const errMsg = (errorData as any).error || (errorData as any).message || `HTTP ${response.status}`;
            if (response.status === 409 || errMsg.includes('yakın zamanda')) {
              results.push({ success: true, title: preview.productTitle, shopifyId: 'already-exists' });
            } else {
              throw new Error(errMsg);
            }
          }
        } catch (error: any) {
          if (error?.name === 'AbortError') {
            results.push({ success: true, title: preview.productTitle, shopifyId: 'timeout-check-shopify', warning: 'Zaman aşımı — Shopify panelini kontrol edin' });
          } else {
            results.push({ success: false, title: preview.productTitle, error: error.message });
          }
        }
      }
      return results;
    },
    onError: () => {
      toast({ title: "Toplu Yükleme Hatası", description: "Shopify'a yüklenirken bir hata oluştu", variant: "destructive" });
    },
    onSuccess: (results) => {
      const successCount = results.filter(r => r.success).length;
      const failCount = results.length - successCount;
      toast({ title: "Toplu Yükleme Tamamlandı", description: `${successCount} ürün başarıyla yüklendi${failCount > 0 ? `, ${failCount} ürün başarısız` : ''}` });
    }
  });

  const parseHtmlMutation = useMutation({
    mutationFn: async (data: { html: string; url: string }) => {
      const resp = await fetch('/api/pttavm-parse-html', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({})) as any;
        throw new Error(err.message || `HTTP ${resp.status}`);
      }
      return resp.json();
    },
    onSuccess: (data) => {
      if (!data.success || !data.title) {
        toast({ title: '⚠️ Ayrıştırma Başarısız', description: data.message || 'HTML içeriğinden ürün bilgisi çıkarılamadı.', variant: 'destructive' });
        return;
      }
      const transformedProduct: Product = {
        id: `product-${Date.now()}`,
        title: data.title,
        brand: data.brand,
        price: data.price,
        description: data.description,
        images: data.images,
        variants: data.variants,
        features: data.features,
        tags: data.tags,
        category: data.category,
        success: true,
        extractionMethod: data.extractionMethod,
        csvContent: data.csvContent,
      };
      setProduct(transformedProduct);
      if (data.csvContent) {
        const uniqueId = `csv-html-${Date.now()}`;
        setCsvPreviews(prev => [{
          id: uniqueId,
          productTitle: data.title,
          csvContent: data.csvContent,
          sourceUrl: data.sourceUrl || pasteSourceUrl,
          variants: data.variants,
          images: (data.images || []).map((img: any) => typeof img === 'string' ? img : img.url),
          createdAt: new Date().toISOString(),
        }, ...prev]);
      }
      setPastedHtml('');
      setIsPasteOpen(false);
      toast({ title: '✅ Başarılı', description: `"${data.title}" ürünü HTML'den çıkarıldı` });
    },
    onError: (error: any) => {
      toast({ title: 'Hata', description: error.message, variant: 'destructive' });
    },
  });

  const uploadToShopifyMutation = useMutation({
    mutationFn: async () => {
      if (!product) throw new Error("Önce ürün verisi çekilmelidir");
      const response = await fetch("/api/shopify/upload-product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productData: product }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error((errorData as any).error || (errorData as any).message || `HTTP ${response.status}`);
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({ title: "Başarılı", description: `Ürün Shopify'a başarıyla yüklendi (ID: ${data.shopifyId})` });
    },
    onError: (error: any) => {
      toast({ title: "Hata", description: error.message, variant: "destructive" });
    }
  });

  const shopifyTransferMutation = useMutation({
    mutationFn: async (data: ScrapeFormData) => {
      const response = await fetch("/api/shopify-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productData: product, productUrl: data.url }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "Başarılı!", description: `Ürün Shopify'a eklendi. ID: ${data.productId}` });
      } else {
        toast({ title: "Hata", description: data.message || "Shopify'a aktarım başarısız", variant: "destructive" });
      }
    },
    onError: (error: any) => {
      toast({ title: "Hata", description: `Shopify aktarımı başarısız: ${error.message}`, variant: "destructive" });
    },
  });

  const onSingleSubmit = singleForm.handleSubmit((data) => {
    singleScrapeMutation.mutate({ ...data, onlyExtractData: true });
  });

  const onShopifyTransfer = singleForm.handleSubmit((data) => {
    shopifyTransferMutation.mutate(data);
  });

  // Sürükle-bırak fonksiyonları
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(false); };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const text = e.dataTransfer.getData('text/plain');
    const urls = text.split('\n').filter(line => line.trim() && line.includes('pttavm.com'));
    if (urls.length > 0) {
      const newUrls = urls.filter(url => !draggedUrls.includes(url.trim()));
      setDraggedUrls(prev => [...prev, ...newUrls.map(url => url.trim())]);
      toast({ title: "URL'ler Eklendi", description: `${newUrls.length} yeni URL eklendi` });
    }
  };

  const addUrlManually = () => {
    const url = singleForm.getValues('url');
    if (url.trim() && !draggedUrls.includes(url.trim())) {
      setDraggedUrls(prev => [...prev, url.trim()]);
      singleForm.setValue('url', '');
      toast({ title: "URL Eklendi", description: "URL listeye eklendi" });
    }
  };

  const removeUrl = (indexToRemove: number) => {
    setDraggedUrls(prev => prev.filter((_, index) => index !== indexToRemove));
  };

  const clearAllUrls = () => {
    setDraggedUrls([]);
    setCsvPreviews([]);
    toast({ title: "Temizlendi", description: "Tüm URL'ler ve CSV önizlemeleri silindi" });
  };

  const clearAllData = () => {
    singleForm.reset();
    multiForm.setValue('urls', [{ url: '' }]);
    setProduct(null);
    setCsvPreviews([]);
    setAllImages([]);
    setProductFeatures([]);
    setDraggedUrls([]);
    setScrapingMode('single');
    toast({ title: "Sayfa Temizlendi", description: "Tüm veriler ve formlar sıfırlandı" });
  };

  const uploadAllCSVsToShopify = async () => {
    if (csvPreviews.length === 0) {
      toast({ title: "Hata", description: "Yüklenecek CSV dosyası bulunamadı", variant: "destructive" });
      return;
    }
    bulkUploadMutation.mutate();
  };

  const processAllUrls = async () => {
    if (draggedUrls.length === 0) {
      toast({ title: "Hata", description: "İşlemek için URL eklemeniz gerekiyor", variant: "destructive" });
      return;
    }
    toast({ title: "⚙️ Arka Planda Çalışıyor", description: `${draggedUrls.length} ürün verisi çekiliyor.`, duration: 6000 });

    try {
      for (const url of draggedUrls) {
        singleScrapeMutation.mutate({ url, onlyExtractData: true });
        await new Promise(r => setTimeout(r, 500));
      }
    } catch (error) {
      toast({ title: "Toplu İşlem Hatası", description: error instanceof Error ? error.message : 'Bilinmeyen hata', variant: "destructive" });
    }
  };

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
            if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i += 2; continue; }
            else { inQuotes = false; i++; continue; }
          } else { current += char; i++; }
        } else {
          if (char === '"') { inQuotes = true; i++; }
          else if (char === ',') { result.push(current); current = ''; i++; }
          else { current += char; i++; }
        }
      }
      result.push(current);
      return result;
    };

    const escapeCSVField = (field: string): string => {
      if (field.includes(',') || field.includes('"') || field.includes('\n')) return `"${field.replace(/"/g, '""')}"`;
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
          cells[tagsIndex] = existing ? `${existing}, ${tags.join(', ')}` : tags.join(', ');
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
      if (idx === 0) { combinedCSV = lines.join('\n'); }
      else {
        const dataLines = lines.slice(1);
        if (dataLines.length > 0) combinedCSV += '\n' + dataLines.join('\n');
      }
    });

    if (combinedCSV) {
      const now = new Date();
      const dateStr = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
      downloadCSV(combinedCSV, `shopify-urunler-${dateStr}.csv`);
      toast({ title: "CSV Dışa Aktarıldı", description: `${csvPreviews.length} ürün tek CSV dosyasında birleştirildi` });
    }
  };

  const handleCSVDownload = (id: string, filename: string) => {
    const preview = csvPreviews.find(p => p.id === id);
    if (preview) {
      const manualTags = individualTags[id] || [];
      let csvToDownload = preview.csvContent;
      if (manualTags.length > 0) {
        const lines = csvToDownload.split('\n').filter((line: string) => line.trim());
        if (lines.length >= 2) {
          const parseCSVLine = (line: string) => {
            const result = []; let current = ''; let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
              const char = line[i];
              if (char === '"') { inQuotes = !inQuotes; }
              else if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
              else { current += char; }
            }
            result.push(current.trim()); return result;
          };
          const headers = parseCSVLine(lines[0]).map((h: string) => h.replace(/"/g, '').trim());
          const tagsIndex = headers.findIndex((h: string) => h.toLowerCase() === 'tags');
          if (tagsIndex !== -1) {
            const updatedLines = [lines[0]];
            for (let i = 1; i < lines.length; i++) {
              const cells = parseCSVLine(lines[i]);
              if (cells[tagsIndex] !== undefined) {
                const existingTags = cells[tagsIndex].replace(/"/g, '').trim();
                const allTags = existingTags ? `${existingTags}, ${manualTags.join(', ')}` : manualTags.join(', ');
                cells[tagsIndex] = `"${allTags}"`;
              }
              const newLine = cells.map((cell: string) => {
                if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) return `"${cell.replace(/"/g, '""')}"`;
                return cell;
              }).join(',');
              updatedLines.push(newLine);
            }
            csvToDownload = updatedLines.join('\n');
          }
        }
      }
      downloadCSV(csvToDownload, filename);
    }
  };

  const handleCSVShopifyUpload = async (id: string, tags?: string[]) => {
    const preview = csvPreviews.find(p => p.id === id);
    if (preview) {
      let csvToUpload = preview.csvContent;
      const manualTags = tags || [];
      if (manualTags.length > 0) {
        const lines = csvToUpload.split('\n').filter((line: string) => line.trim());
        if (lines.length >= 2) {
          const parseCSVLine = (line: string) => {
            const result = []; let current = ''; let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
              const char = line[i];
              if (char === '"') { inQuotes = !inQuotes; }
              else if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
              else { current += char; }
            }
            result.push(current.trim()); return result;
          };
          const headers = parseCSVLine(lines[0]).map((h: string) => h.replace(/"/g, '').trim());
          const tagsIndex = headers.findIndex((h: string) => h.toLowerCase() === 'tags');
          if (tagsIndex !== -1) {
            const updatedLines = [lines[0]];
            for (let i = 1; i < lines.length; i++) {
              const cells = parseCSVLine(lines[i]);
              if (cells[tagsIndex] !== undefined) {
                const existingTags = cells[tagsIndex].replace(/"/g, '').trim();
                const allTags = existingTags ? `${existingTags}, ${manualTags.join(', ')}` : manualTags.join(', ');
                cells[tagsIndex] = `"${allTags}"`;
              }
              const newLine = cells.map((cell: string) => {
                if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) return `"${cell.replace(/"/g, '""')}"`;
                return cell;
              }).join(',');
              updatedLines.push(newLine);
            }
            csvToUpload = updatedLines.join('\n');
          }
        }
      }
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3 * 60 * 1000);
      try {
        const response = await fetch("/api/shopify/upload-csv-product", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({ csvContent: csvToUpload, productTitle: preview.productTitle, sourceUrl: preview.sourceUrl, individualTags: tags || [] }),
        }).finally(() => clearTimeout(timeoutId));
        if (response.ok) {
          const result = await response.json();
          if (result.success || result.shopifyId || result.productId) {
            toast({ title: "Shopify'a Yüklendi ✅", description: `${preview.productTitle.substring(0, 40)}... başarıyla yüklendi` });
          } else {
            throw new Error(result.error || result.message || 'Sunucu başarısız yanıt döndü');
          }
        } else {
          const errorData = await response.json().catch(() => ({}) as any);
          const errMsg = (errorData as any).error || (errorData as any).message || `HTTP ${response.status}`;
          if (errMsg.includes('yakın zamanda yüklendi')) {
            toast({ title: "Zaten Yüklendi", description: `${preview.productTitle.substring(0, 40)}... daha önce yüklendi` });
          } else {
            throw new Error(errMsg);
          }
        }
      } catch (error: any) {
        if (error?.name === 'AbortError') {
          toast({ title: "Yükleme Devam Ediyor", description: `Shopify panelini kontrol edin, yükleme tamamlanmış olabilir` });
        } else {
          toast({ title: "Yükleme Hatası", description: error instanceof Error ? error.message : 'Bilinmeyen hata', variant: "destructive" });
        }
      }
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
              >
                <Home className="w-4 h-4 mr-2" />
                Ana Sayfa
              </Button>
              <Button
                onClick={() => setLocation('/telegram-notifications')}
                variant="outline"
                className="bg-blue-600/10 border-blue-600/30 text-blue-400 hover:bg-blue-600/20 hover:border-blue-600/50 px-4 py-2"
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
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Tümünü Sil
              </Button>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 flex items-center justify-center">
                  <svg width="64" height="64" viewBox="0 0 200 200" className="rounded-lg">
                    <rect width="200" height="200" rx="25" fill="#c1121f"/>
                    <rect x="0" y="65" width="200" height="70" fill="#000000"/>
                    <text x="100" y="110" textAnchor="middle" fill="white" fontSize="36" fontFamily="Arial, sans-serif" fontWeight="bold">
                      pttavm
                    </text>
                  </svg>
                </div>
                <div>
                  <h1 className="text-white font-thin text-xl tracking-wider">PTTAVM</h1>
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
          
          <div>
            <div>
              <Card className="business-card bg-gradient-to-br from-slate-900/90 via-slate-800/50 to-slate-900/90 backdrop-blur border border-cyan-800/30">
                <CardHeader className={`business-header ${isMobile ? 'px-4 py-4' : 'px-6 py-4'}`}>
                  <CardTitle className={`text-white font-thin flex items-center gap-2 ${isMobile ? 'text-lg' : 'text-lg'}`}>
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
                      <label className={`text-white font-thin block ${isMobile ? 'text-base mb-2' : 'text-sm'}`}>
                        Ürün URL'leri - Sürükle Bırak veya Manuel Ekle
                      </label>
                      
                      <div 
                        className={`border-2 border-dashed transition-all duration-200 rounded-lg text-center ${
                          isDragOver ? 'border-cyan-400 bg-cyan-900/20' : 'border-slate-600 bg-slate-800/50'
                        } ${isMobile ? 'p-6' : 'p-8'}`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                      >
                        <div className={`flex flex-col items-center ${isMobile ? 'gap-3' : 'gap-3'}`}>
                          <Package className={`text-cyan-400/70 ${isMobile ? 'w-8 h-8' : 'w-8 h-8'}`} />
                          <div className="text-center">
                            <p className={`text-white font-medium leading-tight ${isMobile ? 'text-base' : 'text-base'}`}>
                              PttAvm URL'lerini buraya sürükleyin
                            </p>
                            <p className={`text-slate-400 mt-2 leading-tight ${isMobile ? 'text-sm' : 'text-sm'}`}>
                              Veya aşağıdaki alandan manuel olarak ekleyin
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Manuel URL Ekleme */}
                      <div className={`w-full ${isMobile ? 'space-y-4' : 'flex gap-2'}`}>
                        <div className={`relative ${isMobile ? 'w-full' : 'flex-1'}`}>
                          <Input
                            placeholder="https://www.pttavm.com/..."
                            {...singleForm.register("url")}
                            type="url"
                            className={`business-input w-full ${isMobile ? 'h-14 text-base pl-4 pr-16 rounded-lg' : 'h-12 text-base pl-4 pr-20'}`}
                            disabled={singleScrapeMutation.isPending}
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className={`absolute right-2 top-1/2 transform -translate-y-1/2 text-white hover:bg-blue-800 transition-all duration-200 active:scale-95 rounded-md ${isMobile ? 'h-10 w-10 p-0' : 'h-8 w-8 p-0'}`}
                            onClick={() => {
                              navigator.clipboard.readText().then(text => {
                                singleForm.setValue('url', text);
                                toast({ title: "Yapıştırıldı", description: "URL panodan alındı" });
                              });
                            }}
                          >
                            <Copy className={`${isMobile ? 'w-5 h-5' : 'w-4 h-4'}`} />
                          </Button>
                        </div>
                        <Button
                          type="button"
                          onClick={addUrlManually}
                          disabled={singleScrapeMutation.isPending}
                          className={`bg-blue-600 hover:bg-blue-700 text-white transition-all duration-200 active:scale-95 rounded-lg ${
                            isMobile ? 'w-full h-14 text-base font-semibold px-4 flex items-center justify-center' : 'px-4 h-12 flex items-center'
                          }`}
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
                          <label className="text-white font-thin text-sm">Eklenmiş URL'ler ({draggedUrls.length})</label>
                          <Button type="button" onClick={clearAllUrls} variant="ghost" className="text-red-400 hover:text-red-300 text-xs h-6 px-2">
                            Tümünü Sil
                          </Button>
                        </div>
                        <div className="max-h-40 overflow-y-auto space-y-2 bg-slate-800/30 rounded-lg p-3">
                          {draggedUrls.map((url, index) => (
                            <div key={index} className="flex items-center gap-2 bg-slate-700/50 px-3 py-2 rounded-md">
                              <span className="text-cyan-400 text-xs font-mono">#{index + 1}</span>
                              <span className="text-white text-xs flex-1 truncate">{url}</span>
                              <Button type="button" onClick={() => removeUrl(index)} variant="ghost" className="h-6 w-6 p-0 text-red-400 hover:text-red-300">
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    <div className="space-y-3">
                      {draggedUrls.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="relative">
                            {singleScrapeMutation.isPending && (
                              <>
                                <span className="absolute inset-0 rounded-md animate-ping bg-green-400 opacity-20 pointer-events-none" />
                                <span className="absolute inset-0 rounded-md animate-pulse bg-green-300 opacity-10 pointer-events-none" />
                              </>
                            )}
                            <Button 
                              type="button"
                              onClick={processAllUrls}
                              disabled={singleScrapeMutation.isPending}
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

        {/* Cloudflare Bypass: Paste Page Source */}
        <div className="mt-6">
          <Collapsible.Root open={isPasteOpen} onOpenChange={setIsPasteOpen}>
            <Collapsible.Trigger asChild>
              <button className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-amber-900/30 to-orange-900/30 hover:from-amber-800/40 hover:to-orange-800/40 border border-amber-500/30 hover:border-amber-500/50 rounded-xl transition-all group">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
                    <FileText className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-amber-200 font-semibold text-sm">Cloudflare engeli aşmak için alternatif yöntem</p>
                    <p className="text-amber-400/70 text-xs">Sayfa kaynağını yapıştırarak ürün verisini çıkar</p>
                  </div>
                </div>
                {isPasteOpen ? <ChevronUp className="w-4 h-4 text-amber-400" /> : <ChevronDown className="w-4 h-4 text-amber-400" />}
              </button>
            </Collapsible.Trigger>
            <Collapsible.Content className="overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0">
              <div className="bg-gradient-to-br from-amber-900/20 to-orange-900/20 border border-amber-500/20 border-t-0 rounded-b-xl p-5 space-y-4">
                <div className="bg-slate-800/50 rounded-lg border border-amber-500/20 p-4 space-y-2">
                  <p className="text-amber-300 font-semibold text-sm">Nasıl yapılır?</p>
                  <ol className="text-slate-300 text-xs space-y-1 list-decimal list-inside">
                    <li>PttAvm ürün sayfasını kendi tarayıcınızda açın</li>
                    <li><span className="text-white font-mono bg-slate-700 px-1 rounded">Ctrl+U</span> (Mac: <span className="text-white font-mono bg-slate-700 px-1 rounded">Cmd+Option+U</span>) ile sayfa kaynağını açın</li>
                    <li>Tümünü seçin: <span className="text-white font-mono bg-slate-700 px-1 rounded">Ctrl+A</span> → Kopyalayın: <span className="text-white font-mono bg-slate-700 px-1 rounded">Ctrl+C</span></li>
                    <li>Aşağıya yapıştırın ve butona basın</li>
                  </ol>
                </div>

                <div className="space-y-2">
                  <label className="text-amber-300 text-sm font-medium">Ürün URL'si (opsiyonel)</label>
                  <Input
                    placeholder="https://www.pttavm.com/urun-adi-p-123456"
                    value={pasteSourceUrl}
                    onChange={e => setPasteSourceUrl(e.target.value)}
                    className="business-input h-10 text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-amber-300 text-sm font-medium">
                    Sayfa kaynağı HTML <span className="text-slate-400 font-normal">(Ctrl+U ile aldığınız içerik)</span>
                  </label>
                  <textarea
                    className="w-full h-40 bg-slate-800/70 border border-amber-500/30 rounded-lg p-3 text-white text-xs font-mono resize-none focus:outline-none focus:border-amber-400/60 placeholder:text-slate-500"
                    placeholder="<!DOCTYPE html><html>... (sayfanın tüm HTML kaynağını buraya yapıştırın)"
                    value={pastedHtml}
                    onChange={e => setPastedHtml(e.target.value)}
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 text-xs">{pastedHtml.length > 0 ? `${pastedHtml.length.toLocaleString()} karakter` : 'HTML yapıştırılmadı'}</span>
                    <div className="flex gap-2">
                      {pastedHtml && (
                        <Button
                          type="button"
                          variant="ghost"
                          className="text-red-400 hover:text-red-300 text-xs h-8 px-3"
                          onClick={() => setPastedHtml('')}
                        >
                          <X className="w-3 h-3 mr-1" />
                          Temizle
                        </Button>
                      )}
                      <Button
                        type="button"
                        disabled={pastedHtml.length < 500 || parseHtmlMutation.isPending}
                        onClick={() => parseHtmlMutation.mutate({ html: pastedHtml, url: pasteSourceUrl })}
                        className="bg-amber-600 hover:bg-amber-700 text-white h-8 px-4 text-sm font-medium disabled:opacity-50"
                      >
                        {parseHtmlMutation.isPending ? (
                          <div className="flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" />İşleniyor...</div>
                        ) : (
                          <div className="flex items-center gap-2"><Package className="w-3 h-3" />Ürün Verisini Çıkar</div>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </Collapsible.Content>
          </Collapsible.Root>
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
                        <div className="relative aspect-square rounded-lg overflow-hidden border-2 border-cyan-800/40 bg-slate-900/50">
                          {product.images && product.images.length > 0 && product.images[0] ? (
                            <>
                              <img
                                src={typeof product.images[0] === 'string' ? product.images[0] : (product.images[0] as any).url}
                                alt={product.title}
                                className="w-full h-full object-cover"
                                onError={(e) => { e.currentTarget.src = 'https://via.placeholder.com/400?text=Görsel+Yüklenemedi'; }}
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

                        {product.images.length > 1 && (
                          <div className="space-y-2">
                            <span className="text-white/70 text-xs">Tüm Görseller ({product.images.length}):</span>
                            <div className="grid grid-cols-4 gap-2 max-h-96 overflow-y-auto p-1 bg-slate-900/30 rounded-lg border border-cyan-800/20">
                              {product.images.map((image, index) => {
                                const imageUrl = typeof image === 'string' ? image : (image as any).url;
                                return (
                                  <div key={index} className="aspect-square rounded-md overflow-hidden border border-cyan-800/30 hover:border-cyan-500/60 transition-all cursor-pointer bg-slate-900/50 group relative">
                                    <img
                                      src={imageUrl}
                                      alt={`${product.title} ${index + 1}`}
                                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                    />
                                    <div className="absolute bottom-1 right-1 bg-black/70 px-1.5 py-0.5 rounded text-white text-xs">{index + 1}</div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {product.variants && ((product.variants.colors?.length ?? 0) > 0 || (product.variants.sizes?.length ?? 0) > 0) && (
                          <Collapsible.Root open={isVariantsOpen} onOpenChange={setIsVariantsOpen} className="space-y-2 mt-4">
                            <Collapsible.Trigger asChild>
                              <button className="w-full flex items-center justify-between p-3 bg-gradient-to-r from-purple-900/30 to-indigo-900/30 hover:from-purple-800/40 hover:to-indigo-800/40 border border-purple-500/30 hover:border-purple-500/50 rounded-lg transition-all group">
                                <div className="flex items-center gap-2">
                                  <Palette className="w-4 h-4 text-purple-400" />
                                  <span className="text-purple-200 text-sm font-medium">Varyant Seçenekleri</span>
                                  {product.variants.allVariants && (
                                    <span className="bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded text-xs">{product.variants.allVariants.length}</span>
                                  )}
                                </div>
                                {isVariantsOpen ? <ChevronUp className="w-4 h-4 text-purple-400" /> : <ChevronDown className="w-4 h-4 text-purple-400" />}
                              </button>
                            </Collapsible.Trigger>
                            <Collapsible.Content className="overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2">
                              <div className="bg-gradient-to-br from-purple-900/20 to-indigo-900/20 border border-purple-500/20 rounded-lg p-4 space-y-4">
                                {product.variants.colors && product.variants.colors.length > 0 && product.variants.allVariants && (
                                  <div className="space-y-2">
                                    {product.variants.colors.map((color, colorIndex) => {
                                      const colorVariants = product.variants!.allVariants?.filter(v => v.color === color) || [];
                                      const inStockSizes = colorVariants.filter(v => v.inStock).map(v => v.size);
                                      const outOfStockSizes = colorVariants.filter(v => !v.inStock).map(v => v.size);
                                      const hasAnyStock = inStockSizes.length > 0;
                                      return (
                                        <div key={colorIndex} className={`rounded-lg border p-2 transition-all ${hasAnyStock ? 'bg-purple-800/10 border-purple-500/30' : 'bg-slate-700/10 border-slate-600/20 opacity-60'}`}>
                                          <div className="flex items-center gap-2 mb-1.5">
                                            <div className={`w-3 h-3 rounded-full ${hasAnyStock ? 'bg-gradient-to-br from-purple-400 to-pink-400' : 'bg-slate-500'}`}></div>
                                            <span className={`font-medium text-xs ${hasAnyStock ? 'text-purple-200' : 'text-slate-400'}`}>{color}</span>
                                            <span className="text-xs text-slate-400">({inStockSizes.length}/{colorVariants.length})</span>
                                          </div>
                                          <div className="flex flex-wrap gap-1 ml-5">
                                            {inStockSizes.map((size, idx) => (
                                              <span key={`in-${idx}`} className="bg-green-900/40 border border-green-600/50 text-green-200 px-1.5 py-0.5 rounded text-xs flex items-center gap-0.5">
                                                <span className="text-green-400 text-xs">✓</span>{size}
                                              </span>
                                            ))}
                                            {outOfStockSizes.map((size, idx) => (
                                              <span key={`out-${idx}`} className="bg-slate-700/40 border border-slate-600/50 text-slate-400 px-1.5 py-0.5 rounded text-xs flex items-center gap-0.5 opacity-50">
                                                <span className="text-slate-500 text-xs">✗</span>{size}
                                              </span>
                                            ))}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                                {product.stockAnalysis && (
                                  <div className="flex items-center justify-between pt-2 border-t border-purple-500/20 text-xs">
                                    <div className="flex items-center gap-2">
                                      <span className="text-green-300">✓ {product.stockAnalysis.inStockVariants} Stokta</span>
                                      <span className="text-slate-400">•</span>
                                      <span className="text-red-300">✗ {product.stockAnalysis.outOfStockVariants} Tükendi</span>
                                    </div>
                                    <span className="text-slate-400">Toplam: {product.stockAnalysis.totalVariants}</span>
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
                    {product.brand && <div><span className="text-blue-400 text-sm font-semibold uppercase">{product.brand}</span></div>}
                    <h2 className="text-white text-2xl font-bold leading-tight">{product.title}</h2>
                    
                    {product.price && (
                      <div className="space-y-2 border-t border-b border-cyan-800/30 py-4">
                        {typeof product.price === 'object' && (
                          <>
                            {(product.price as any).formatted && (
                              <div className="flex items-center justify-between">
                                <span className="text-white/70 text-sm">Orijinal Fiyat:</span>
                                <span className="text-white/50 text-lg line-through">{(product.price as any).formatted}</span>
                              </div>
                            )}
                            {(product.price as any).profitFormatted && (
                              <div className="flex items-center justify-between">
                                <span className="text-white/70 text-sm">Karlı Fiyat:</span>
                                <span className="text-yellow-400 text-2xl font-bold">{(product.price as any).profitFormatted}</span>
                              </div>
                            )}
                          </>
                        )}
                        {typeof product.price !== 'object' && <span className="text-yellow-400 text-2xl font-bold">{product.price} TL</span>}
                      </div>
                    )}

                    {product.variants && ((product.variants.colors?.length ?? 0) > 0 || (product.variants.sizes?.length ?? 0) > 0) && (
                      <div className="bg-gradient-to-br from-indigo-900/30 via-purple-900/20 to-pink-900/30 rounded-xl border-2 border-indigo-500/30 p-4 space-y-4 shadow-lg">
                        <div className="flex items-center gap-2 border-b border-indigo-500/20 pb-2">
                          <Shirt className="w-5 h-5 text-indigo-400" />
                          <span className="text-indigo-300 font-semibold text-base">Detaylı Varyant Bilgileri</span>
                          {product.variants.allVariants && (
                            <span className="ml-auto bg-indigo-500/20 text-indigo-300 px-2 py-1 rounded-md text-xs font-medium">{product.variants.allVariants.length} Varyant</span>
                          )}
                        </div>
                        {product.variants.colors && product.variants.colors.length > 0 && product.variants.allVariants && (
                          <div className="space-y-3">
                            {product.variants.colors.map((color, colorIndex) => {
                              const colorVariants = product.variants!.allVariants?.filter(v => v.color === color) || [];
                              const inStockSizes = colorVariants.filter(v => v.inStock).map(v => v.size);
                              const outOfStockSizes = colorVariants.filter(v => !v.inStock).map(v => v.size);
                              const hasAnyStock = inStockSizes.length > 0;
                              return (
                                <div key={colorIndex} className={`rounded-xl border p-3 transition-all ${hasAnyStock ? 'bg-purple-800/10 border-purple-500/20' : 'bg-slate-800/10 border-slate-700/20 opacity-60'}`}>
                                  <div className="flex items-center gap-2 mb-2">
                                    <div className={`w-4 h-4 rounded-full border-2 ${hasAnyStock ? 'bg-gradient-to-br from-purple-400 to-pink-400 border-purple-300' : 'bg-slate-600 border-slate-500'}`}></div>
                                    <span className={`font-semibold text-sm ${hasAnyStock ? 'text-purple-200' : 'text-slate-500'}`}>{color}</span>
                                    <span className="text-xs text-slate-400 ml-auto">({inStockSizes.length} stokta)</span>
                                  </div>
                                  <div className="flex flex-wrap gap-1.5 ml-6">
                                    {inStockSizes.map((size, idx) => (
                                      <span key={`in-${idx}`} className="bg-green-900/40 border border-green-600/50 text-green-200 px-2 py-0.5 rounded-md text-xs font-medium">✓ {size}</span>
                                    ))}
                                    {outOfStockSizes.map((size, idx) => (
                                      <span key={`out-${idx}`} className="bg-slate-700/40 border border-slate-600/40 text-slate-500 px-2 py-0.5 rounded-md text-xs line-through">✗ {size}</span>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {product.variants.colors && product.variants.colors.length > 0 && product.variants.sizes && product.variants.sizes.length > 0 && (
                          <div className="bg-indigo-900/20 rounded-lg border border-indigo-500/20 p-3 space-y-2">
                            <div className="text-indigo-300 text-xs font-semibold mb-2">📊 Genel Özet</div>
                            <div className="flex items-start gap-2">
                              <Palette className="w-3 h-3 text-purple-400 mt-0.5" />
                              <div className="flex-1">
                                <div className="text-white/60 text-xs mb-1">Renkler ({product.variants.colors.length}):</div>
                                <div className="flex flex-wrap gap-1">
                                  {product.variants.colors.map((color, idx) => {
                                    const hasStock = product.variants!.allVariants?.some(v => v.color === color && v.inStock);
                                    return (
                                      <span key={idx} className={`text-xs px-1.5 py-0.5 rounded ${hasStock ? 'bg-purple-500/30 text-purple-200' : 'bg-slate-600/30 text-slate-400 line-through'}`}>{color}</span>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-start gap-2">
                              <Shirt className="w-3 h-3 text-green-400 mt-0.5" />
                              <div className="flex-1">
                                <div className="text-white/60 text-xs mb-1">Bedenler ({product.variants.sizes.length}):</div>
                                <div className="flex flex-wrap gap-1">
                                  {product.variants.sizes.map((size, idx) => {
                                    const stockCount = product.variants!.allVariants?.filter(v => v.size === size && v.inStock).length || 0;
                                    return (
                                      <span key={idx} className={`text-xs px-1.5 py-0.5 rounded ${stockCount > 0 ? 'bg-green-500/30 text-green-200' : 'bg-slate-600/30 text-slate-400'}`}>{size} {stockCount > 0 && `(${stockCount})`}</span>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                        {product.stockAnalysis && (
                          <div className="flex items-center gap-4 pt-2 border-t border-indigo-500/20 text-xs">
                            <div className="flex items-center gap-1.5"><div className="w-2 h-2 bg-green-400 rounded-full"></div><span className="text-green-300 font-medium">{product.stockAnalysis.inStockVariants} Stokta</span></div>
                            <div className="flex items-center gap-1.5"><div className="w-2 h-2 bg-red-400 rounded-full"></div><span className="text-red-300 font-medium">{product.stockAnalysis.outOfStockVariants} Tükendi</span></div>
                            <div className="ml-auto text-slate-400">Toplam: {product.stockAnalysis.totalVariants} varyant</div>
                          </div>
                        )}
                      </div>
                    )}

                    {product.description && product.description.trim() && (
                      <div className="space-y-2">
                        <span className="text-white/70 text-sm flex items-center gap-2"><FileText className="w-4 h-4" />Ürün Açıklaması:</span>
                        <div className="bg-slate-800/30 rounded-lg border border-cyan-800/30 p-4 max-h-40 overflow-y-auto">
                          <p className="text-white/80 text-sm leading-relaxed whitespace-pre-wrap">{product.description}</p>
                        </div>
                      </div>
                    )}

                    {product.category && (
                      <div className="flex items-center gap-2">
                        <span className="text-white/70 text-sm">Kategori:</span>
                        <span className="bg-purple-900/30 text-purple-300 px-3 py-1.5 rounded-md text-sm border border-purple-800/40">{product.category}</span>
                      </div>
                    )}

                    {(() => {
                      const colors = product.variants?.colors?.filter(c => c && c !== 'Standart' && c !== 'Tek Renk') || [];
                      const sizes = product.variants?.sizes?.filter(s => s && s !== 'Tek Beden') || [];
                      if (colors.length === 0 && sizes.length === 0) return null;
                      return (
                        <div className="bg-gradient-to-r from-slate-800/40 to-slate-700/40 rounded-lg border border-cyan-800/30 p-3 space-y-2">
                          <div className="flex items-center gap-2"><Shirt className="w-4 h-4 text-cyan-400" /><span className="text-cyan-300 text-sm font-medium">Varyant Bilgileri</span></div>
                          <div className="grid grid-cols-2 gap-3">
                            {colors.length > 0 && (
                              <div className="space-y-1">
                                <span className="text-white/60 text-xs">Renkler ({colors.length})</span>
                                <div className="flex flex-wrap gap-1">
                                  {colors.slice(0, 3).map((color, idx) => <span key={idx} className="bg-purple-900/30 text-purple-300 px-2 py-0.5 rounded text-xs border border-purple-800/40">{color}</span>)}
                                  {colors.length > 3 && <span className="text-purple-400 text-xs px-1">+{colors.length - 3}</span>}
                                </div>
                              </div>
                            )}
                            {sizes.length > 0 && (
                              <div className="space-y-1">
                                <span className="text-white/60 text-xs">Bedenler ({sizes.length})</span>
                                <div className="flex flex-wrap gap-1">
                                  {sizes.slice(0, 4).map((size, idx) => <span key={idx} className="bg-green-900/30 text-green-300 px-2 py-0.5 rounded text-xs border border-green-800/40">{size}</span>)}
                                  {sizes.length > 4 && <span className="text-green-400 text-xs px-1">+{sizes.length - 4}</span>}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {product.features && product.features.length > 0 && (
                      <div className="space-y-2">
                        <span className="text-white/70 text-sm flex items-center gap-2"><FileText className="w-4 h-4" />Ürün Özellikleri:</span>
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
                        downloadCSV(product.csvContent!, filename);
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
        {product && product.variants && (() => {
          let allVariants: any[] = [];
          let variants = product.variants;
          if (Array.isArray(product.variants)) {
            allVariants = product.variants as any[];
            const colors = [...new Set(allVariants.map((v: any) => v.color))];
            const sizes = [...new Set(allVariants.map((v: any) => v.size))];
            variants = { colors, sizes, allVariants } as any;
          } else if (product.variants.allVariants && Array.isArray(product.variants.allVariants)) {
            allVariants = product.variants.allVariants;
          } else if (product.variants.colors && product.variants.sizes) {
            for (const color of product.variants.colors) {
              for (const size of product.variants.sizes) {
                allVariants.push({ color, size, inStock: true });
              }
            }
          }
          const hasVariants = allVariants.length > 0 || (variants?.colors?.length ?? 0) > 0 || (variants?.sizes?.length ?? 0) > 0;
          if (!hasVariants) return null;
          return (
            <div className="mt-8">
              <Card className="business-card bg-gradient-to-br from-slate-900/90 via-slate-800/50 to-slate-900/90 backdrop-blur border border-cyan-800/30">
                <CardHeader className="business-header">
                  <CardTitle className="text-white font-thin text-lg flex items-center gap-2">
                    <Palette className="w-5 h-5 text-purple-400/70" />
                    Ürün Varyantları
                    {allVariants.length > 0 && <span className="text-purple-400 text-sm bg-purple-400/10 px-2 py-1 rounded">{allVariants.length} varyant</span>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="space-y-6">
                    {variants?.colors && variants.colors.length > 0 && (
                      <div>
                        <h3 className="text-white font-medium mb-3 flex items-center gap-2">
                          <div className="w-3 h-3 bg-gradient-to-r from-red-400 to-blue-400 rounded-full"></div>
                          Renk Seçenekleri ({variants.colors.length})
                        </h3>
                        <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-8 gap-3">
                          {variants.colors.map((color, index) => (
                            <div key={index} className="bg-cyan-900/20 border border-cyan-800/40 rounded-lg p-3 text-center hover:border-cyan-600/60 transition-all duration-200">
                              <div className="text-cyan-300 font-medium text-sm">{color}</div>
                              <div className="text-cyan-500 text-xs mt-1">Mevcut</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {variants?.sizes && variants.sizes.length > 0 && (
                      <div>
                        <h3 className="text-white font-medium mb-3 flex items-center gap-2">
                          <Shirt className="w-4 h-4 text-green-400" />
                          Beden Seçenekleri ({variants.sizes.length})
                        </h3>
                        <div className="grid grid-cols-4 sm:grid-cols-8 lg:grid-cols-12 gap-2">
                          {variants.sizes.map((size, index) => (
                            <div key={index} className="bg-green-900/20 border border-green-800/40 rounded-lg p-2 text-center hover:border-green-600/60 transition-all duration-200">
                              <div className="text-green-300 font-bold text-sm">{size}</div>
                              <div className="text-green-500 text-xs">Stokta</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
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
          );
        })()}

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
                      <img src={image.url || image} alt={`Ürün görseli ${index + 1}`} className="w-full h-24 object-cover rounded-lg border border-cyan-800/30 group-hover:border-cyan-600 transition-colors" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                        <span className="text-white text-xs">{index + 1}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {allImages.length > 24 && <p className="text-white/60 text-sm mt-4 text-center">ve {allImages.length - 24} görsel daha...</p>}
              </CardContent>
            </Card>
          </div>
        )}

        {/* CSV Drawer Preview */}
        {csvPreviews.length > 0 && (
          <div className="mt-8">
            <CSVDrawerPreview 
              csvPreviews={csvPreviews}
              onDownload={handleCSVDownload}
              onShopifyUpload={handleCSVShopifyUpload}
              individualTags={individualTags}
              setIndividualTags={setIndividualTags}
            />
            
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
                disabled={bulkUploadMutation.isPending}
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-medium px-8 py-3"
              >
                {bulkUploadMutation.isPending ? (
                  <div className="flex items-center gap-2"><Loader2 className="w-5 h-5 animate-spin" />Yükleniyor...</div>
                ) : (
                  <div className="flex items-center gap-2"><ShoppingCart className="w-5 h-5" />TÜMÜNÜ SHOPIFY'A YÜKLE ({csvPreviews.length})</div>
                )}
              </Button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default PttAvmScraperPage;
