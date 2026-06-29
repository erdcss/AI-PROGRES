import { memo, useMemo, useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Package, Tag, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { resolvePreviewImagesForEntry, resolvePreviewProxyUrl } from "@/lib/product-image-url";
import { sanitizeTrendyolVariants } from "@shared/trendyol-variant-utils";
import { getTrendyolImageFallbackUrls } from "@shared/trendyol-product-images";
import {
  normalizeTrendyolDisplayPrice,
  formatOriginalPrice,
  formatSalePrice,
  formatProfitPercentage,
} from "@/utils/price-utils";

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

export interface CSVPreviewData {
  id: string;
  productTitle: string;
  csvContent: string;
  sourceUrl?: string;
  variants: {
    colors: string[];
    sizes: string[];
    allVariants?: Array<{
      color: string;
      colorCode: string;
      size: string;
      inStock: boolean;
    }>;
  };
  images: string[];
  price?: {
    original: number;
    withProfit: number;
  };
  brand?: string;
  createdAt: string;
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
}: ProductPreviewProps) {

    const sanitizedVariants = sanitizeTrendyolVariants(preview.variants, {
      productTitle: preview.productTitle,
    });
    const { urls: previewImages } = resolvePreviewImagesForEntry({
      images: preview.images,
      csvContent: preview.csvContent,
    });
    const safeImageIndex =
      previewImages.length > 0
        ? Math.min(Math.max(0, imageIndex), previewImages.length - 1)
        : 0;
    const hasMultipleImages = previewImages.length > 1;
    const currentImageUrl = previewImages[safeImageIndex] ?? "";
    
    // Extract tracking ID from CSV
    const getTrackingId = () => {
      const lines = preview.csvContent.split('\n').filter(line => line.trim());
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
      const lines = preview.csvContent.split('\n').filter(line => line.trim());
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
      
      console.log('🔍 CSV Headers:', headers);
      console.log('🔍 First Data Row:', firstDataRow);
      
      // Multiple price detection strategies
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
            console.log(`💰 Price found via header "${indicator}": ${priceValue}`);
            break;
          }
        }
      }
      
      // Strategy 2: Search all cells for price-like values
      if (priceValue === 0) {
        for (const cell of firstDataRow) {
          const cleaned = cell.replace(/[^0-9.,]/g, '').replace(',', '.');
          const extracted = parseFloat(cleaned);
          if (extracted > 10 && extracted < 10000) { // Reasonable price range
            priceValue = extracted;
            console.log(`💰 Price found via cell search: ${priceValue}`);
            break;
          }
        }
      }
      
      // Strategy 3: Extract from title
      if (priceValue === 0) {
        const title = preview.productTitle;
        const priceMatch = title.match(/(\d+[.,]\d+|\d+)\s*(?:TL|₺|lira)/i);
        if (priceMatch) {
          priceValue = parseFloat(priceMatch[1].replace(',', '.'));
          console.log(`💰 Price found via title: ${priceValue}`);
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
      const fromPreview = normalizeTrendyolDisplayPrice(preview.price, 0.1);
      if (fromPreview.original > 0) return fromPreview;
      const fromCsv = parsePriceFromCSV();
      return normalizeTrendyolDisplayPrice(
        { original: fromCsv.original, withProfit: fromCsv.withProfit },
        0.1,
      );
    })();

    const sizeCount =
      sanitizedVariants.sizes.length > 0
        ? sanitizedVariants.sizes.length
        : [...new Set(sanitizedVariants.allVariants.map((v) => v.size).filter(Boolean))].length;
    const colorCount =
      sanitizedVariants.colors.length > 0
        ? sanitizedVariants.colors.length
        : [...new Set(sanitizedVariants.allVariants.map((v) => v.color).filter(Boolean))].length;
    const variantCount = sanitizedVariants.allVariants.length;
    const imageCount = previewImages.length;

    return (
      <Card className="bg-slate-800/40 border border-slate-600/50 mb-3">
        <CardContent className="p-3">
          <div className="flex gap-3">
            {/* Sol taraf - Görsel ve Slider */}
            <div className="relative w-[100px] h-[100px] flex-shrink-0 bg-slate-700/30 rounded overflow-hidden border border-slate-600/30">
              {currentImageUrl ? (
                <>
                  <PreviewCarouselImage
                    directUrl={currentImageUrl}
                    alt={preview.productTitle}
                    onFailed={() => {
                      if (previewImages.length > 1) {
                        onSelectImage?.((safeImageIndex + 1) % previewImages.length);
                      }
                    }}
                  />
                  
                  {hasMultipleImages && (
                    <>
                      <button
                        onClick={onPrevImage}
                        className="absolute left-1 top-1/2 -translate-y-1/2 bg-black/50 text-white p-1 rounded-full opacity-70 hover:opacity-100 transition-opacity"
                      >
                        <ChevronLeft className="w-3 h-3" />
                      </button>
                      
                      <button
                        onClick={onNextImage}
                        className="absolute right-1 top-1/2 -translate-y-1/2 bg-black/50 text-white p-1 rounded-full opacity-70 hover:opacity-100 transition-opacity"
                      >
                        <ChevronRight className="w-3 h-3" />
                      </button>
                      
                      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-1 max-w-[90px] overflow-x-auto">
                        {previewImages.map((_, index) => (
                          <button
                            key={index}
                            type="button"
                            aria-label={`Görsel ${index + 1}`}
                            onClick={() => onSelectImage?.(index)}
                            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors ${
                              index === safeImageIndex ? 'bg-cyan-400' : 'bg-white/40 hover:bg-white/70'
                            }`}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">
                  <Package className="w-6 h-6" />
                </div>
              )}
            </div>
            
            {/* Sağ taraf - Ürün Bilgileri */}
            <div className="flex-1 min-w-0 space-y-2">
              {/* Ürün Başlığı */}
              <div>
                <h3 className="text-white font-medium text-sm leading-tight line-clamp-2">
                  {preview.productTitle}
                </h3>
              </div>
              
              {/* ID Bilgisi */}
              {trackingId && (
                <div className="flex items-center gap-1">
                  <span className="text-slate-500 text-xs">ID:</span>
                  <Badge className="bg-purple-900/30 text-purple-300 text-xs px-2 py-0 h-4 font-mono">
                    {trackingId}
                  </Badge>
                </div>
              )}
              
              {/* Özet sayılar */}
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <Badge variant="outline" className="border-slate-600/50 text-slate-300 px-1.5 py-0 h-4">
                  {imageCount} görsel
                </Badge>
                {colorCount > 0 && (
                  <Badge variant="outline" className="border-cyan-600/40 text-cyan-300 px-1.5 py-0 h-4">
                    {colorCount} renk
                  </Badge>
                )}
                {sizeCount > 0 && (
                  <Badge variant="outline" className="border-green-600/40 text-green-300 px-1.5 py-0 h-4">
                    {sizeCount} beden
                  </Badge>
                )}
                {variantCount > 0 && (
                  <Badge variant="outline" className="border-purple-600/40 text-purple-300 px-1.5 py-0 h-4">
                    {variantCount} varyant
                  </Badge>
                )}
              </div>

              {/* Fiyat Bilgileri */}
              {prices.original > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <div className="flex items-center gap-1">
                    <span className="text-slate-400">Alış:</span>
                    <span className="text-orange-300 font-semibold">
                      {formatOriginalPrice(prices)}
                    </span>
                  </div>
                  <span className="text-slate-600">→</span>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-400">Karlı satış:</span>
                    <span className="text-green-300 font-semibold">
                      {formatSalePrice(prices)}
                    </span>
                  </div>
                  <Badge variant="outline" className="border-green-600/40 text-green-300 text-xs px-1.5 py-0 h-4">
                    {formatProfitPercentage(prices)}
                  </Badge>
                </div>
              )}
              
              {/* Varyant detayları */}
              <div className="space-y-1.5 pt-2 border-t border-slate-700/30">
                {/* Renk Seçenekleri */}
                {(() => {
                  const colors = sanitizedVariants.colors;
                  const allVariants = sanitizedVariants.allVariants;
                  const uniqueColors =
                    colors.length > 0
                      ? colors
                      : [...new Set(allVariants.map((v) => v.color).filter(Boolean))];
                  
                  if (uniqueColors.length > 0) {
                    return (
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-400 text-xs flex-shrink-0">Renkler:</span>
                        <div className="flex flex-wrap gap-1">
                          {uniqueColors.map((color, idx) => {
                            // Check if this color has any stock
                            const colorVariants = allVariants.filter(v => v.color === color);
                            const hasStock = colorVariants.some(v => v.inStock);
                            
                            return (
                              <Badge 
                                key={idx}
                                variant="outline" 
                                className={hasStock 
                                  ? "border-cyan-600/40 text-cyan-300 text-xs px-1.5 py-0 h-4" 
                                  : "border-gray-600/40 text-gray-500 text-xs px-1.5 py-0 h-4 line-through"
                                }
                              >
                                {color}
                              </Badge>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
                
                {/* Beden Seçenekleri - Stokta Olan ve Olmayan Ayrımı */}
                {(() => {
                  const allVariants = sanitizedVariants.allVariants;
                  
                  if (allVariants.length > 0) {
                    const inStockSizes = new Set<string>();
                    const outOfStockSizes = new Set<string>();
                    
                    allVariants.forEach(v => {
                      if (v.size) {
                        if (v.inStock) {
                          inStockSizes.add(v.size);
                        } else {
                          // Only add to out of stock if it's not already in stock
                          if (!inStockSizes.has(v.size)) {
                            outOfStockSizes.add(v.size);
                          }
                        }
                      }
                    });
                    
                    const inStockArray = Array.from(inStockSizes);
                    const outOfStockArray = Array.from(outOfStockSizes);
                    
                    if (inStockArray.length > 0 || outOfStockArray.length > 0) {
                      return (
                        <div className="flex items-start gap-1.5">
                          <span className="text-slate-400 text-xs flex-shrink-0 mt-0.5">Bedenler:</span>
                          <div className="flex flex-wrap gap-1">
                            {/* Stokta olan bedenler - yeşil */}
                            {inStockArray.map((size, idx) => (
                              <Badge 
                                key={`in-${idx}`}
                                className="bg-green-900/40 border-green-600/40 text-green-300 text-xs px-1.5 py-0 h-4"
                              >
                                {size}
                              </Badge>
                            ))}
                            {/* Stokta olmayan bedenler - gri */}
                            {outOfStockArray.map((size, idx) => (
                              <Badge 
                                key={`out-${idx}`}
                                variant="outline"
                                className="border-gray-600/40 text-gray-500 text-xs px-1.5 py-0 h-4 opacity-60"
                              >
                                {size}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      );
                    }
                  }
                  return null;
                })()}
                
                {/* Varyant Sayısı Özeti */}
                <div className="flex gap-1">
                  {(() => {
                    const allVariants = sanitizedVariants.allVariants;
                    const uniqueColors = sanitizedVariants.colors.length > 0
                      ? sanitizedVariants.colors
                      : [...new Set(allVariants.map(v => v.color).filter(Boolean))];
                    const inStockCount = allVariants.filter(v => v.inStock).length;
                    const totalCount = allVariants.length;
                    
                    if (allVariants.length === 0 && uniqueColors.length === 0 && sizeCount === 0) {
                      return <Badge variant="outline" className="border-slate-600/40 text-slate-400 text-xs px-1.5 py-0 h-4">Tek ürün</Badge>;
                    }
                    
                    return (
                      <>
                        {sizeCount > 0 && (
                          <Badge variant="outline" className="border-green-600/40 text-green-300 text-xs px-1.5 py-0 h-4">
                            {sizeCount} beden
                          </Badge>
                        )}
                        {totalCount > 0 && (
                          <Badge variant="outline" className="border-purple-600/40 text-purple-300 text-xs px-1.5 py-0 h-4">
                            {inStockCount}/{totalCount} stokta
                          </Badge>
                        )}
                      </>
                    );
                  })()}
                </div>
                
                {/* Etiketler */}
                <div className="flex items-start gap-1.5">
                  <Tag className="w-3 h-3 text-cyan-400 mt-0.5 flex-shrink-0" />
                  
                  <div className="flex-1 space-y-1">
                    {/* Tüm Etiketler Tek Satırda */}
                    <div className="flex flex-wrap gap-1">
                      {/* CSV'den Gelen Ürün Etiketleri */}
                      {(() => {
                        const lines = preview.csvContent.split('\n').filter(line => line.trim());
                        if (lines.length < 2) return null;
                        
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
                        const tagsIndex = headers.findIndex(h => h.toLowerCase() === 'tags');
                        
                        if (tagsIndex !== -1 && firstDataRow[tagsIndex]) {
                          const productTags = firstDataRow[tagsIndex]
                            .split(',')
                            .map(tag => tag.trim())
                            .filter(tag => tag.length > 0);
                          
                          return productTags.map((tag, index) => (
                            <Badge 
                              key={`product-${index}`}
                              variant="outline" 
                              className="border-slate-600/40 text-slate-300 text-xs px-1.5 py-0 h-4"
                            >
                              {tag}
                            </Badge>
                          ));
                        }
                        return null;
                      })()}
                      
                      {/* Manuel Eklenen Etiketler */}
                      {tags?.map((tag, index) => (
                        <Badge 
                          key={`manual-${index}`}
                          variant="outline" 
                          className="border-cyan-600/50 text-cyan-300 text-xs px-1.5 py-0 h-4 flex items-center gap-0.5 hover:border-red-500/60 group"
                          data-testid={`tag-individual-${preview.id}-${index}`}
                        >
                          {tag}
                          <X 
                            className="w-2.5 h-2.5 cursor-pointer opacity-0 group-hover:opacity-100 text-red-400 transition-opacity" 
                            onClick={() => onRemoveTag(index)}
                          />
                        </Badge>
                      ))}
                      
                      {/* Etiket Ekle Butonu */}
                      <Button
                        onClick={() => {
                          const input = document.querySelector(`[data-testid="input-add-tag-${preview.id}"]`) as HTMLInputElement;
                          if (input) input.focus();
                        }}
                        size="sm"
                        variant="ghost"
                        className="h-4 px-1 text-xs text-cyan-400 hover:text-cyan-300 hover:bg-cyan-900/20"
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                    
                    {/* Etiket Ekleme Input */}
                    <input
                      type="text"
                      id={`tag-input-${preview.id}`}
                      defaultValue=""
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const input = e.target as HTMLInputElement;
                          const newTag = input.value.trim();
                          if (newTag) {
                            onAddTag(newTag);
                            input.value = '';
                          }
                        }
                      }}
                      placeholder="Yeni etiket (Enter ile ekle)"
                      className="h-6 text-xs bg-slate-900/50 border border-slate-600/30 rounded-md px-2 text-white placeholder:text-slate-500 focus:border-cyan-500/50 focus:outline-none w-full"
                      data-testid={`input-add-tag-${preview.id}`}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
});
