import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Loader2, ShoppingCart, Link, Copy, X, Home, Plus, Trash2, Package, Palette, Eye, Image, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CSVPreview } from "@/components/CSVPreview";
import { CSVDrawerPreview } from "@/components/CSVDrawerPreview";

import { toast } from "@/hooks/use-toast";
import { useLocation } from "wouter";


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
      
      // ADVANCED BLOCKING DETECTION: Check for typical blocking indicators
      const isBlocked = data.title === "trendyol.com" || 
                       data.price?.original === 0 || 
                       !data.images || 
                       data.images.length === 0 ||
                       !data.csvContent ||
                       data.csvContent.length === 0;
      
      if (isBlocked) {
        console.log('❌ BLOCKING DETECTED: Invalid data received from server:', {
          title: data.title,
          price: data.price?.original,
          imagesCount: data.images?.length || 0,
          csvContentLength: data.csvContent?.length || 0
        });
        
        toast({
          title: "🚫 Trendyol Blocking Sistemi Aktif",
          description: `Trendyol tüm istekleri engelliyor. Sistemimiz bunu tespit etti. Lütfen 10-15 dakika bekleyip tekrar deneyin veya farklı bir e-ticaret sitesi URL'si kullanın.`,
          variant: "destructive"
        });
        return;
      }
      
      console.log('✅ Single scrape successful, setting product data');
      
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
      
      setProduct(transformedProduct);
      
      // Her başarılı çekme için CSV preview ekle
      if (data.csvContent) {
        console.log('🎯 Single URL CSV Content found, adding to previews:', data.title);
        const newCSVPreview = {
          id: `csv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          productTitle: data.title || 'Ürün',
          csvContent: data.csvContent,
          variants: {
            colors: data.variants?.colors || ['Standart'],
            sizes: data.variants?.sizes || ['Tek Beden']
          },
          images: data.images?.map((img: any) => typeof img === 'string' ? img : img.url) || [],
          createdAt: new Date().toISOString()
        };
        
        console.log('📋 Adding Single URL CSV preview:', newCSVPreview.id, newCSVPreview.productTitle);
        setCsvPreviews(prev => [newCSVPreview, ...prev]);
        
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
          const response = await fetch("/api/shopify/upload-csv-product", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ 
              csvContent: preview.csvContent,
              productTitle: preview.productTitle 
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
        const newCSVPreview = {
          id: `csv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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
        
        setCsvPreviews(prev => [newCSVPreview, ...prev]);
        
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
  const handleCSVShopifyUpload = async (id: string) => {
    const preview = csvPreviews.find(p => p.id === id);
    if (preview) {
      console.log('🛒 Starting Shopify upload for:', preview.productTitle);
      try {
        const response = await fetch("/api/shopify/upload-csv-product", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ 
            csvContent: preview.csvContent,
            productTitle: preview.productTitle 
          }),
        });
        
        if (response.ok) {
          const result = await response.json();
          toast({
            title: "Shopify'a Yüklendi",
            description: `${preview.productTitle} başarıyla yüklendi (ID: ${result.shopifyId})`
          });
        } else {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
        }
      } catch (error) {
        console.error('❌ Shopify upload failed:', error);
        toast({
          title: "Yükleme Hatası",
          description: `${preview.productTitle} yüklenirken hata oluştu: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`,
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
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 gap-8">
          
          {/* Main Content Section */}
          <div>
            {/* Mode Selection - Hidden, only single mode available */}

            {/* Single Mode Form */}
            <div>
              <Card className="business-card bg-gradient-to-br from-slate-900/90 via-slate-800/50 to-slate-900/90 backdrop-blur border border-cyan-800/30">
                <CardHeader className="business-header">
                  <CardTitle className="text-white font-thin text-lg flex items-center gap-2">
                    <Package className="w-5 h-5 text-cyan-400/70" />
                    Tek Varyant Ürün
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <motion.form 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    onSubmit={onSingleSubmit} 
                    className="space-y-4"
                  >
                    {/* Sürükle-Bırak Alanı */}
                    <div className="space-y-3">
                      <label className="text-white font-thin text-sm">Ürün URL'leri - Sürükle Bırak veya Manuel Ekle</label>
                      
                      {/* Sürükle-Bırak Alanı */}
                      <div 
                        className={`border-2 border-dashed transition-all duration-200 rounded-lg p-8 text-center ${
                          isDragOver 
                            ? 'border-cyan-400 bg-cyan-900/20' 
                            : 'border-slate-600 bg-slate-800/50'
                        }`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                      >
                        <div className="flex flex-col items-center gap-3">
                          <Package className="w-8 h-8 text-cyan-400/70" />
                          <div>
                            <p className="text-white font-medium">
                              Trendyol veya Arçelik URL'lerini buraya sürükleyin
                            </p>
                            <p className="text-slate-400 text-sm mt-1">
                              Veya aşağıdaki alandan manuel olarak ekleyin
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Manuel URL Ekleme */}
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Input
                            placeholder="https://www.trendyol.com/..."
                            {...singleForm.register("url")}
                            className="business-input h-12 text-base pl-4 pr-20"
                            disabled={singleScrapeMutation.isPending}
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="absolute right-2 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0 text-white hover:bg-blue-800"
                            onClick={() => {
                              navigator.clipboard.readText().then(text => {
                                singleForm.setValue('url', text);
                                toast({
                                  title: "Yapıştırıldı",
                                  description: "URL panodan alındı"
                                });
                              });
                            }}
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                        </div>
                        <Button
                          type="button"
                          onClick={addUrlManually}
                          disabled={singleScrapeMutation.isPending}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-4 h-12"
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Ekle
                        </Button>
                      </div>
                    </div>

                    {/* Persistent Tags Section */}
                    <div className="space-y-3">
                      <label className="text-white font-thin text-sm">Ürüne Eklenecek Etiketler</label>
                      <div className="space-y-3">
                        <div className="flex gap-2">
                          <Input
                            placeholder="Etiket ekle (örn: elektronik, telefon)"
                            value={newTag}
                            onChange={(e) => setNewTag(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                            className="business-input flex-1"
                            disabled={singleScrapeMutation.isPending}
                          />
                          <Button
                            type="button"
                            onClick={addTag}
                            disabled={!newTag.trim() || singleScrapeMutation.isPending}
                            className="bg-green-600 hover:bg-green-700 text-white px-4"
                          >
                            <Plus className="w-4 h-4" />
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Sol Taraf - Görsel */}
                  <div className="space-y-4">
                    {product.images && product.images.length > 0 && (
                      <div className="grid grid-cols-2 gap-2">
                        {product.images.slice(0, 4).map((image, index) => {
                          const imageUrl = typeof image === 'string' ? image : image.url;
                          return (
                            <img
                              key={index}
                              src={imageUrl}
                              alt={product.title}
                              className="w-full h-32 object-cover rounded-lg border border-cyan-800/30"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          );
                        })}
                      </div>
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
                    <h2 className="text-white text-xl font-bold leading-tight">
                      {product.title}
                    </h2>
                    
                    {/* Fiyat */}
                    {product.price && (
                      <div className="space-y-1">
                        <span className="text-yellow-400 text-lg font-bold">
                          {typeof product.price === 'object' ? 
                            (product.price.formatted || product.price.profitFormatted || 'Fiyat Yok') : 
                            `${product.price} TL`
                          }
                        </span>
                      </div>
                    )}
                    
                    {/* Renkler */}
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
                    
                    {/* Bedenler */}
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
                    
                    {/* Etiketler */}
                    {product.tags && product.tags.length > 0 && (
                      <div>
                        <span className="text-white/70 text-sm">Etiketler:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {product.tags.slice(0, 6).map((tag, index) => (
                            <span 
                              key={index}
                              className="bg-slate-800/50 text-slate-300 px-2 py-0.5 rounded text-xs"
                            >
                              {tag}
                            </span>
                          ))}
                          {product.tags.length > 6 && (
                            <span className="bg-slate-800/50 text-slate-400 px-2 py-0.5 rounded text-xs">
                              +{product.tags.length - 6}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {/* Shopify Aktarım Durumu */}
                    <div className="pt-4 border-t border-cyan-800/30">
                      <div className="flex items-center gap-2 justify-between">
                        <span className="text-white/70 text-sm">Shopify Aktarım:</span>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                          <span className="text-green-400 text-sm">Hazır</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
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