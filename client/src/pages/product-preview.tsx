import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Package, Download, Upload, CheckCircle, XCircle, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Variant {
  color: string;
  colorCode?: string;
  size: string;
  inStock: boolean;
}

interface ProductData {
  url: string;
  totalVariants: number;
  variants: {
    colors: string[];
    sizes: string[];
    stockMap: Record<string, boolean>;
    allVariants: Variant[];
  };
  extractedData: {
    title: string;
    price: {
      original: number;
      withProfit: number;
      profitFormatted: string;
      formatted: string;
    };
    brand: string;
    images: number;
  };
}

interface BackendResponse {
  success: boolean;
  url: string;
  totalVariants: number;
  scenario?: string;
  variants: Variant[];
  extractedData: {
    title?: string;
    price?: string;
    originalPrice?: string;
    brand?: string;
    images?: number;
  };
}

function transformBackendData(response: BackendResponse): ProductData {
  const colors = Array.from(new Set(response.variants.map(v => v.color)));
  const sizes = Array.from(new Set(response.variants.map(v => v.size)));
  
  const originalPrice = parseFloat(response.extractedData.price || response.extractedData.originalPrice || "0");
  const profitMargin = 1.15;
  const withProfit = originalPrice * profitMargin;
  
  return {
    url: response.url,
    totalVariants: response.totalVariants,
    variants: {
      colors,
      sizes,
      stockMap: {},
      allVariants: response.variants,
    },
    extractedData: {
      title: response.extractedData.title || "Ürün",
      price: {
        original: originalPrice,
        withProfit,
        profitFormatted: `${withProfit.toFixed(2)} TL`,
        formatted: `${originalPrice.toFixed(2)} TL`,
      },
      brand: response.extractedData.brand || "Bilinmiyor",
      images: response.extractedData.images || 0,
    },
  };
}

export default function ProductPreview() {
  const [url, setUrl] = useState("");
  const [currentUrl, setCurrentUrl] = useState("");
  const { toast } = useToast();

  const { data, isLoading, error, refetch } = useQuery<ProductData>({
    queryKey: ["/api/test/hybrid-variants", currentUrl],
    enabled: !!currentUrl,
    queryFn: async () => {
      const response = await apiRequest("/api/test/hybrid-variants", {
        method: "POST",
        body: JSON.stringify({ url: currentUrl }),
        headers: { "Content-Type": "application/json" },
      });
      return response as BackendResponse;
    },
    select: (response: BackendResponse) => transformBackendData(response),
  });

  const uploadToShopifyMutation = useMutation({
    mutationFn: async (urlToUpload: string) => {
      const response = await apiRequest("/api/shopify/upload", {
        method: "POST",
        body: JSON.stringify({ url: urlToUpload }),
        headers: { "Content-Type": "application/json" },
      });
      return response;
    },
    onSuccess: () => {
      toast({
        title: "✅ Başarılı!",
        description: "Ürün Shopify'a yüklendi",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "❌ Hata",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const downloadCSVMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/csv/download", {
        method: "POST",
        body: JSON.stringify({ url: currentUrl }),
        headers: { "Content-Type": "application/json" },
      });
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `trendyol-product-${Date.now()}.csv`;
      link.click();
    },
    onSuccess: () => {
      toast({
        title: "İndirildi!",
        description: "CSV dosyası indirildi",
      });
    },
  });

  const handleFetch = () => {
    if (!url.trim()) {
      toast({
        title: "Uyarı",
        description: "Lütfen bir URL girin",
        variant: "destructive",
      });
      return;
    }
    setCurrentUrl(url);
    refetch();
  };

  const renderVariantMatrix = () => {
    if (!data || !data.variants.allVariants.length) return null;

    const { colors, sizes, allVariants } = data.variants;

    if (colors.length === 0 || sizes.length === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          Varyant bulunamadı
        </div>
      );
    }

    return (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">Renk / Beden</TableHead>
              {sizes.map((size) => (
                <TableHead key={size} className="text-center">
                  {size}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {colors.map((color) => (
              <TableRow key={color}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {allVariants.find((v) => v.color === color)?.colorCode && (
                      <div
                        className="w-4 h-4 rounded-full border"
                        style={{
                          backgroundColor: allVariants.find((v) => v.color === color)?.colorCode || "#ccc",
                        }}
                      />
                    )}
                    {color}
                  </div>
                </TableCell>
                {sizes.map((size) => {
                  const variant = allVariants.find(
                    (v) => v.color === color && v.size === size
                  );
                  return (
                    <TableCell key={`${color}-${size}`} className="text-center">
                      {variant ? (
                        variant.inStock ? (
                          <Badge variant="default" className="bg-green-500">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Stokta
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            <XCircle className="w-3 h-3 mr-1" />
                            Yok
                          </Badge>
                        )
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <Card className="max-w-6xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-6 h-6" />
            Ürün Önizleme
          </CardTitle>
          <CardDescription>
            Trendyol ürün URL'sini girin, tüm varyantları ve detayları görün
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* URL Input */}
          <div className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="url">Trendyol Ürün URL'si</Label>
              <Input
                id="url"
                data-testid="input-product-url"
                placeholder="https://www.trendyol.com/..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleFetch()}
              />
            </div>
            <Button
              data-testid="button-fetch-product"
              onClick={handleFetch}
              disabled={isLoading}
              className="mt-6"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Çekiliyor...
                </>
              ) : (
                "Çek"
              )}
            </Button>
          </div>

          {/* Error State */}
          {error && (
            <Card className="border-destructive">
              <CardContent className="pt-6">
                <p className="text-destructive">Hata: {(error as Error).message}</p>
              </CardContent>
            </Card>
          )}

          {/* Product Data */}
          {data && (
            <>
              {/* Product Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Ürün Bilgileri</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Ürün Başlığı</p>
                    <p className="font-semibold text-lg" data-testid="text-product-title">
                      {data.extractedData.title}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Marka</p>
                      <p className="font-semibold" data-testid="text-brand">
                        {data.extractedData.brand || "Bilinmiyor"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Orijinal Fiyat</p>
                      <p className="font-semibold" data-testid="text-original-price">
                        {data.extractedData.price.formatted}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Kâr Marjlı Fiyat</p>
                      <p className="font-semibold text-green-600" data-testid="text-profit-price">
                        {data.extractedData.price.profitFormatted}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Resim Sayısı</p>
                      <p className="font-semibold" data-testid="text-image-count">
                        {data.extractedData.images}
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">URL</p>
                    <a
                      href={data.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline flex items-center gap-1 text-sm"
                    >
                      {data.url}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </CardContent>
              </Card>

              {/* Variants Table */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">
                    Varyantlar ({data.totalVariants})
                  </CardTitle>
                  <CardDescription>
                    {data.variants.colors.length} renk × {data.variants.sizes.length} beden
                  </CardDescription>
                </CardHeader>
                <CardContent>{renderVariantMatrix()}</CardContent>
              </Card>

              {/* Action Buttons */}
              <div className="flex gap-4">
                <Button
                  data-testid="button-upload-shopify"
                  onClick={() => {
                    if (!currentUrl) {
                      toast({
                        title: "⚠️ Uyarı",
                        description: "Önce bir ürün çekin",
                        variant: "destructive",
                      });
                      return;
                    }
                    
                    const urlToUpload = currentUrl;
                    
                    toast({
                      title: "🚀 Ürün Yükleniyor",
                      description: "Ürün arka planda Shopify'a ekleniyor...",
                    });
                    
                    setCurrentUrl('');
                    setUrl('');
                    
                    uploadToShopifyMutation.mutate(urlToUpload);
                  }}
                  disabled={uploadToShopifyMutation.isPending || !currentUrl}
                  className="flex-1"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Shopify'a Ekle
                </Button>
                <Button
                  data-testid="button-download-csv"
                  onClick={() => downloadCSVMutation.mutate()}
                  disabled={downloadCSVMutation.isPending}
                  variant="outline"
                  className="flex-1"
                >
                  {downloadCSVMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      İndiriliyor...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 mr-2" />
                      CSV İndir
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
