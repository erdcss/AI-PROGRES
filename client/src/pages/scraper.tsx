import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Loader2, ShoppingCart, Link, Copy, X, Home, Plus, Trash2, Package, Palette, Eye, Image, FileText, Shirt } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CSVPreview } from "@/components/CSVPreview";
import { CSVDrawerPreview } from "@/components/CSVDrawerPreview";

import { toast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useIsMobile } from "@/hooks/use-mobile";


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
  const [persistentTags, setPersistentTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [draggedUrls, setDraggedUrls] = useState<string[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [csvPreviews, setCsvPreviews] = useState<any[]>([]);
  const [individualTags, setIndividualTags] = useState<{[key: string]: string[]}>({});
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
    mutationFn: async (data: ScrapeFormData & { persistentTags?: string[]; onlyExtractData?: boolean }) => {
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
              tags: data.persistentTags || []
            }
          }),
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || `HTTP ${response.status}`);
        }
        return response.json();
      }
      
      // Normal Trendyol/Arçelik URL'leri için scenario-scrape
      const response = await fetch("/api/scenario-scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          url: data.url, 
          mode: 'single', 
          persistentTags: data.persistentTags,
          onlyExtractData: data.onlyExtractData || false
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }
      return response.json();
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
          variants: {
            colors: data.variants?.colors || ['Standart'],
            sizes: data.variants?.sizes || ['Tek Beden']
          },
          images: data.images?.map((img: any) => typeof img === 'string' ? img : img.url) || [],
          createdAt: new Date().toISOString(),
          persistentTags: persistentTags || [] // Kalıcı etiketleri ekle
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
          // Persistent tags ve individual tags'i birleştir
          const allTags = [
            ...(preview.persistentTags || []),
            ...(individualTags[preview.id] || [])
          ];
          
          console.log('🏷️ Uploading with tags:', {
            previewId: preview.id,
            persistentTags: preview.persistentTags || [],
            individualTags: individualTags[preview.id] || [],
            totalTags: allTags.length
          });
          
          const response = await fetch("/api/shopify/upload-csv-product", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ 
              csvContent: preview.csvContent,
              productTitle: preview.productTitle,
              individualTags: allTags // Tüm etiketleri gönder
            }),
          });
          
          if (response.ok) {
            const result = await response.json();
            results.push({ success: true, title: preview.productTitle, shopifyId: result.shopifyId });
          } else {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
          }
        } catch (error) {
          results.push({ success: false, title: preview.productTitle, error: error.message });
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
      return response.json();
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
    // Start the main scraping process with persistent tags - ONLY EXTRACT DATA (no tracking/transfer)
    singleScrapeMutation.mutate({ ...data, persistentTags, onlyExtractData: true });
    
    // No need for additional comprehensive image extraction since scenario-based scraper already extracts all needed images
    // Removed: extractAllImagesMutation.mutate(data.url); to prevent "Görsel Çıkarma Hatası" notifications
  });

  // Shopify transfer mutation
  const shopifyTransferMutation = useMutation({
    mutationFn: async (data: ScrapeFormData & { persistentTags?: string[] }) => {
      console.log('🛒 Shopify transfer starting...');
      console.log('CSV previews available:', csvPreviews.length);
      const response = await fetch("/api/shopify-upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          productData: product,
          productUrl: data.url,
          persistentTags: data.persistentTags || []
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
    shopifyTransferMutation.mutate({ ...data, persistentTags });
  });

  const addTag = () => {
    if (newTag.trim() && !persistentTags.includes(newTag.trim())) {
      setPersistentTags([...persistentTags, newTag.trim()]);
      setNewTag('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setPersistentTags(persistentTags.filter(tag => tag !== tagToRemove));
  };

  const clearAllTags = () => {
    setPersistentTags([]);
  };

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
    setPersistentTags([]);
    setNewTag('');
    setDraggedUrls([]);
    
    // Reset mode to single
    setScrapingMode('single');
    
    toast({
      title: "Sayfa Temizlendi",
      description: "Tüm veriler ve formlar sıfırlandı"
    });
  };

  // Tüm CSV'leri Shopify'a yükleme fonksiyonu
  const uploadAllCSVsToShopify = async () => {
    if (csvPreviews.length === 0) {
      toast({
        title: "Hata",
        description: "Yüklenecek CSV dosyası bulunamadı",
        variant: "destructive"
      });
      return;
    }
    
    console.log('🛒 Starting bulk Shopify upload for', csvPreviews.length, 'products');
    bulkUploadMutation.mutate();
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

    for (let i = 0; i < draggedUrls.length; i++) {
      const url = draggedUrls[i];
      try {
        // Her URL için ayrı ayrı işlem yap (sadece veri çekme)
        const data = await singleScrapeMutation.mutateAsync({ url, persistentTags, onlyExtractData: true });
        
        // CSV önizlemesi singleScrapeMutation tarafından otomatik eklenir,
        // burada tekrar eklemeye gerek yok
        
        toast({
          title: `${i + 1}/${draggedUrls.length} Tamamlandı`,
          description: `${data.title || url} işlendi ve CSV eklendi`
        });
      } catch (error) {
        toast({
          title: `${i + 1}/${draggedUrls.length} Hata`,
          description: `${url} işlenemedi: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`,
          variant: "destructive"
        });
      }
    }
    
    toast({
      title: "Toplu İşlem Tamamlandı",
      description: `${draggedUrls.length} ürün işlendi ve CSV önizlemeleri eklendi`
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

  // CSV indirme fonksiyonu
  const handleCSVDownload = (id: string, filename: string) => {
    const preview = csvPreviews.find(p => p.id === id);
    if (preview) {
      downloadCSV(preview.csvContent, filename);
    }
  };

  // CSV Shopify upload fonksiyonu  
  const handleCSVShopifyUpload = async (id: string, individualTags?: string[]) => {
    const preview = csvPreviews.find(p => p.id === id);
    if (preview) {
      console.log('🛒 Starting Shopify upload for:', preview.productTitle);
      console.log('📋 Individual tags:', individualTags);
      try {
        const response = await fetch("/api/shopify/upload-csv-product", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ 
            csvContent: preview.csvContent,
            productTitle: preview.productTitle,
            individualTags: individualTags || []
          }),
        });
        
        if (response.ok) {
          const result = await response.json();
          toast({
            title: "Shopify'a Yüklendi",
            description: `${preview.productTitle.substring(0, 40)}... başarıyla yüklendi${individualTags && individualTags.length > 0 ? ` (${individualTags.length} etiket ile)` : ''}`
          });
        } else {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
        }
      } catch (error) {
        console.error('❌ Shopify upload failed:', error);
        toast({
          title: "Yükleme Hatası",
          description: `${preview.productTitle.substring(0, 30)}... yüklenirken hata: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`,
          variant: "destructive"
        });
      }
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
              >
                <Home className="w-4 h-4 mr-2" />
                Ana Sayfa
              </Button>
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

                    {/* Persistent Tags Section */}
                    <div className={`${isMobile ? 'space-y-4' : 'space-y-3'}`}>
                      <label className={`text-white font-thin block ${
                        isMobile ? 'text-base mb-2' : 'text-sm'
                      }`}>
                        Ürüne Eklenecek Etiketler
                      </label>
                      <div className={`${isMobile ? 'space-y-4' : 'space-y-3'}`}>
                        <div className={`w-full ${isMobile ? 'space-y-4' : 'flex gap-2'}`}>
                          <Input
                            placeholder="Etiket ekle (örn: elektronik, telefon)"
                            value={newTag}
                            onChange={(e) => setNewTag(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                            className={`business-input w-full ${
                              isMobile 
                                ? 'h-14 text-base rounded-lg' 
                                : 'flex-1'
                            }`}
                            disabled={singleScrapeMutation.isPending}
                            data-testid="input-product-tag"
                          />
                          <Button
                            type="button"
                            onClick={addTag}
                            disabled={!newTag.trim() || singleScrapeMutation.isPending}
                            className={`bg-green-600 hover:bg-green-700 text-white transition-all duration-200 active:scale-95 rounded-lg ${
                              isMobile 
                                ? 'w-full h-14 text-base font-semibold px-4 flex items-center justify-center' 
                                : 'px-4 flex items-center'
                            }`}
                            data-testid="button-add-tag"
                          >
                            <Plus className={`${isMobile ? 'w-5 h-5 mr-2' : 'w-4 h-4 mr-2'}`} />
                            <span className="font-semibold">Etiket Ekle</span>
                          </Button>
                        </div>
                        
                        {persistentTags.length > 0 && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-white/70 text-xs">Aktif Etiketler ({persistentTags.length})</span>
                              <Button
                                type="button"
                                onClick={clearAllTags}
                                variant="ghost"
                                className="text-red-400 hover:text-red-300 text-xs h-6 px-2"
                              >
                                Tümünü Sil
                              </Button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {persistentTags.map((tag, index) => (
                                <div key={index} className="flex items-center gap-1 bg-cyan-900/30 px-2 py-1 rounded-md border border-cyan-800/40">
                                  <span className="text-cyan-300 text-xs">{tag}</span>
                                  <Button
                                    type="button"
                                    onClick={() => removeTag(tag)}
                                    variant="ghost"
                                    className="h-4 w-4 p-0 text-cyan-400 hover:text-red-400"
                                  >
                                    <X className="w-3 h-3" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                            <p className="text-yellow-400/70 text-xs">
                              Bu etiketler silinene kadar tüm ürünlere otomatik eklenecek
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

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
                      {draggedUrls.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <Button 
                            type="button"
                            onClick={processAllUrls}
                            disabled={singleScrapeMutation.isPending}
                            className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white h-14 text-lg font-medium"
                          >
                            {singleScrapeMutation.isPending ? (
                              <div className="flex items-center gap-2">
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Veriler Çekiliyor... ({draggedUrls.length})
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <Package className="w-5 h-5" />
                                ÜRÜN VERİLERİNİ ÇEK ({draggedUrls.length})
                              </div>
                            )}
                          </Button>
                          

                        </div>
                        
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <Button
                            type="submit"
                            disabled={singleScrapeMutation.isPending || shopifyTransferMutation.isPending}
                            className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white h-14 text-lg font-medium"
                          >
                            {singleScrapeMutation.isPending ? (
                              <div className="flex items-center gap-2">
                                <Loader2 className="w-5 h-5 animate-spin" />
                                <span>Ürün Verisi Çekiliyor...</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <Package className="w-5 h-5" />
                                <span>ÜRÜN VERİLERİNİ ÇEK</span>
                              </div>
                            )}
                          </Button>
                          
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
                        </div>

                        {/* Küçük Thumbnail Galeri */}
                        {product.images.length > 1 && (
                          <div className="grid grid-cols-6 gap-2">
                            {product.images.slice(1, 7).map((image, index) => {
                              const imageUrl = typeof image === 'string' ? image : image.url;
                              return (
                                <div
                                  key={index}
                                  className="aspect-square rounded-md overflow-hidden border border-cyan-800/30 hover:border-cyan-500/60 transition-all cursor-pointer bg-slate-900/50"
                                  data-testid={`img-thumbnail-${index + 1}`}
                                >
                                  <img
                                    src={imageUrl}
                                    alt={`${product.title} ${index + 2}`}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      e.currentTarget.style.display = 'none';
                                    }}
                                  />
                                </div>
                              );
                            })}
                            {product.images.length > 7 && (
                              <div className="aspect-square rounded-md border border-cyan-800/30 bg-slate-800/50 flex items-center justify-center">
                                <span className="text-cyan-300 text-sm font-medium">
                                  +{product.images.length - 7}
                                </span>
                              </div>
                            )}
                          </div>
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

                    {/* Etiketler */}
                    {product.tags && product.tags.length > 0 && (
                      <div className="space-y-2">
                        <span className="text-white/70 text-sm">Etiketler:</span>
                        <div className="flex flex-wrap gap-2">
                          {product.tags.map((tag, index) => {
                            const isPersistentTag = persistentTags.includes(tag);
                            return (
                              <span 
                                key={index}
                                className={isPersistentTag 
                                  ? "bg-gradient-to-r from-green-900/40 to-emerald-900/40 text-green-300 px-3 py-1.5 rounded-md text-xs border-2 border-green-600/60 hover:border-green-500/80 transition-all font-medium"
                                  : "bg-gradient-to-r from-cyan-900/40 to-blue-900/40 text-cyan-300 px-3 py-1.5 rounded-md text-xs border border-cyan-800/40 hover:border-cyan-600/60 transition-all"
                                }
                                data-testid={`tag-${index}`}
                                title={isPersistentTag ? "Kalıcı Etiket (CSV'ye otomatik eklendi)" : "Ürün Etiketi"}
                              >
                                #{tag}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Shopify'a Aktar Butonu - Sadece Tekil Ürün */}
                    {scrapingMode === 'single' && product.csvContent && (
                      <div className="pt-2">
                        <Button
                          onClick={onShopifyTransfer}
                          disabled={shopifyTransferMutation.isPending}
                          className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-medium py-3 disabled:opacity-50 shadow-lg shadow-blue-500/20"
                          data-testid="button-shopify-transfer"
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

                    {/* Kategori */}
                    {product.category && (
                      <div className="flex items-center gap-2">
                        <span className="text-white/70 text-sm">Kategori:</span>
                        <span className="bg-purple-900/30 text-purple-300 px-3 py-1.5 rounded-md text-sm border border-purple-800/40">
                          {product.category}
                        </span>
                      </div>
                    )}
                    
                    {/* Varyant Detay Tablosu */}
                    {product.variants?.allVariants && product.variants.allVariants.length > 0 && (
                      <div className="space-y-2">
                        <span className="text-white/70 text-sm flex items-center gap-2">
                          <Shirt className="w-4 h-4" />
                          Varyant Detayları ({product.variants.allVariants.length} adet):
                        </span>
                        <div className="bg-slate-800/30 rounded-lg border border-cyan-800/30 overflow-hidden">
                          <div className="max-h-48 overflow-y-auto">
                            <table className="w-full text-xs">
                              <thead className="bg-cyan-900/20 sticky top-0">
                                <tr>
                                  <th className="text-left text-cyan-300 p-2 border-b border-cyan-800/30">Renk</th>
                                  <th className="text-left text-cyan-300 p-2 border-b border-cyan-800/30">Beden</th>
                                  <th className="text-center text-cyan-300 p-2 border-b border-cyan-800/30">Stok</th>
                                </tr>
                              </thead>
                              <tbody>
                                {product.variants.allVariants.map((variant, index) => (
                                  <tr key={index} className="border-b border-slate-700/30 hover:bg-cyan-900/10">
                                    <td className="p-2 text-white/80">{variant.color || '-'}</td>
                                    <td className="p-2 text-white/80">{variant.size || '-'}</td>
                                    <td className="p-2 text-center">
                                      {variant.inStock ? (
                                        <span className="inline-flex items-center gap-1 bg-green-900/30 text-green-300 px-2 py-0.5 rounded text-xs">
                                          ✓ Stokta
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 bg-red-900/30 text-red-300 px-2 py-0.5 rounded text-xs">
                                          ✗ Yok
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}

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

                      {/* All Variants Detail */}
                      {allVariants.length > 0 && (
                        <div>
                          <h3 className="text-white font-medium mb-3 flex items-center gap-2">
                            <Package className="w-4 h-4 text-blue-400" />
                            Tüm Varyant Kombinasyonları ({allVariants.length})
                          </h3>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 max-h-96 overflow-y-auto">
                            {allVariants.slice(0, 20).map((variant, index) => (
                              <div
                                key={index}
                                className={`border rounded-lg p-3 transition-all duration-200 ${
                                  variant.inStock 
                                    ? 'bg-slate-800/40 border-slate-600/50 hover:border-blue-500/60' 
                                    : 'bg-red-900/20 border-red-800/40 opacity-60'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <div>
                                    <div className="text-white text-sm font-medium">
                                      {variant.color} / {variant.size}
                                    </div>
                                    <div className={`text-xs mt-1 ${
                                      variant.inStock ? 'text-green-400' : 'text-red-400'
                                    }`}>
                                      {variant.inStock ? '✓ Stokta' : '✗ Tükendi'}
                                    </div>
                                  </div>
                                  <div className={`w-3 h-3 rounded-full ${
                                    variant.inStock ? 'bg-green-400' : 'bg-red-400'
                                  }`} />
                                </div>
                              </div>
                            ))}
                          </div>
                          
                          {allVariants.length > 20 && (
                            <div className="mt-3 text-center">
                              <span className="text-slate-400 text-sm bg-slate-800/30 px-3 py-1 rounded">
                                +{allVariants.length - 20} varyant daha
                              </span>
                            </div>
                          )}
                          
                          {/* Variant Summary */}
                          <div className="mt-4 flex justify-between items-center p-3 bg-slate-800/30 rounded-lg border border-slate-600/30">
                            <div className="flex items-center gap-4">
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                                <span className="text-green-400 text-sm">
                                  {allVariants.filter(v => v.inStock).length} Stokta
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-red-400 rounded-full"></div>
                                <span className="text-red-400 text-sm">
                                  {allVariants.filter(v => !v.inStock).length} Tükendi
                                </span>
                              </div>
                            </div>
                            <span className="text-slate-400 text-sm">
                              Toplam {allVariants.length} varyant
                            </span>
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
            />
            
            {/* Toplu Shopify Yükleme Butonu */}
            <div className="mt-4 flex justify-center">
              <Button
                onClick={uploadAllCSVsToShopify}
                disabled={bulkUploadMutation.isPending}
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-medium px-8 py-3"
              >
                {bulkUploadMutation.isPending ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Tüm Ürünler Shopify'a Yükleniyor... ({csvPreviews.length})
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