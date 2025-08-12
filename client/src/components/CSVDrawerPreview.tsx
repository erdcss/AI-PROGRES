import { useState } from 'react';
import { ChevronDown, ChevronUp, Download, Eye, FileText, Package, ShoppingCart, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from 'framer-motion';

interface CSVPreviewData {
  id: string;
  productTitle: string;
  csvContent: string;
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

interface CSVDrawerPreviewProps {
  csvPreviews: CSVPreviewData[];
  onDownload: (id: string, filename: string) => void;
  onShopifyUpload: (id: string) => void;
}

export function CSVDrawerPreview({ csvPreviews, onDownload, onShopifyUpload }: CSVDrawerPreviewProps) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [selectedImageIndex, setSelectedImageIndex] = useState<{[key: string]: number}>({});

  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedItems(newExpanded);
  };

  const nextImage = (previewId: string, totalImages: number) => {
    setSelectedImageIndex(prev => ({
      ...prev,
      [previewId]: ((prev[previewId] || 0) + 1) % totalImages
    }));
  };

  const prevImage = (previewId: string, totalImages: number) => {
    setSelectedImageIndex(prev => ({
      ...prev,
      [previewId]: ((prev[previewId] || 0) - 1 + totalImages) % totalImages
    }));
  };

  const parseCSVContent = (csvContent: string) => {
    const lines = csvContent.split('\n').filter(line => line.trim());
    if (lines.length < 2) return { headers: [], rows: [] };
    
    const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
    const rows = lines.slice(1, 5).map(line => 
      line.split(',').map(cell => cell.replace(/"/g, '').trim())
    );
    
    return { headers, rows };
  };

  if (csvPreviews.length === 0) {
    return null;
  }

  // Product Preview Component
  const ProductPreview = ({ preview }: { preview: CSVPreviewData }) => {
    const currentImageIndex = selectedImageIndex[preview.id] || 0;
    const hasMultipleImages = preview.images && preview.images.length > 1;
    const currentImageUrl = preview.images?.[currentImageIndex] || '';
    
    // Parse price from CSV if available
    const parsePriceFromCSV = () => {
      if (preview.price) {
        return preview.price;
      }
      
      // Try to extract price from CSV content with better parsing
      const lines = preview.csvContent.split('\n').filter(line => line.trim());
      if (lines.length < 2) return { original: 0, withProfit: 0 };
      
      const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
      const firstDataRow = lines[1].split(',').map(cell => cell.replace(/"/g, '').trim());
      
      // Find price column index  
      const priceIndex = headers.findIndex(h => 
        h.includes('Variant Price') || h.includes('Price') || h.includes('price')
      );
      
      if (priceIndex !== -1 && firstDataRow[priceIndex]) {
        const priceValue = parseFloat(firstDataRow[priceIndex]) || 0;
        return {
          original: Math.round(priceValue / 1.1), // Reverse calculate original
          withProfit: priceValue
        };
      }
      
      // Try to extract from title if it contains price info
      const title = preview.productTitle;
      const priceMatch = title.match(/(\d+[.,]\d+|\d+)\s*(?:TL|₺|lira)/i);
      if (priceMatch) {
        const extractedPrice = parseFloat(priceMatch[1].replace(',', '.'));
        return {
          original: Math.round(extractedPrice / 1.1),
          withProfit: extractedPrice
        };
      }
      
      return { original: 0, withProfit: 0 };
    };
    
    const prices = parsePriceFromCSV();
    const variants = preview.variants?.allVariants || [];
    
    return (
      <Card className="bg-slate-800/40 border border-slate-600/50 mb-3">
        <CardContent className="p-3">
          <div className="flex gap-3 h-[100px]">
            {/* Sol taraf - Görsel ve Slider */}
            <div className="relative w-[120px] h-[100px] flex-shrink-0 bg-slate-700/30 rounded overflow-hidden border border-slate-600/30">
              {currentImageUrl ? (
                <>
                  <img 
                    src={currentImageUrl} 
                    alt={preview.productTitle}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'https://via.placeholder.com/120x100?text=No+Image';
                    }}
                  />
                  
                  {hasMultipleImages && (
                    <>
                      <button
                        onClick={() => prevImage(preview.id, preview.images.length)}
                        className="absolute left-1 top-1/2 -translate-y-1/2 bg-black/50 text-white p-1 rounded-full opacity-70 hover:opacity-100 transition-opacity"
                      >
                        <ChevronLeft className="w-3 h-3" />
                      </button>
                      
                      <button
                        onClick={() => nextImage(preview.id, preview.images.length)}
                        className="absolute right-1 top-1/2 -translate-y-1/2 bg-black/50 text-white p-1 rounded-full opacity-70 hover:opacity-100 transition-opacity"
                      >
                        <ChevronRight className="w-3 h-3" />
                      </button>
                      
                      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-1">
                        {preview.images.map((_, index) => (
                          <div
                            key={index}
                            className={`w-1.5 h-1.5 rounded-full ${
                              index === currentImageIndex ? 'bg-cyan-400' : 'bg-white/40'
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
            <div className="flex-1 flex flex-col justify-between min-w-0">
              {/* Ürün Başlığı */}
              <h3 className="text-white font-medium text-sm leading-tight truncate mb-1">
                {preview.productTitle}
              </h3>
              
              {/* Fiyat Bilgileri */}
              <div className="flex items-center gap-3 mb-2">
                {prices.original > 0 ? (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 text-xs">Alış:</span>
                      <span className="text-white text-sm font-medium">{prices.original.toLocaleString()}₺</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 text-xs">Satış:</span>
                      <span className="text-green-400 text-sm font-medium">{prices.withProfit.toLocaleString()}₺</span>
                    </div>
                    <Badge className="bg-green-900/30 text-green-300 text-xs px-2 py-0 h-4">
                      +%10
                    </Badge>
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 text-xs">Fiyat:</span>
                    <span className="text-orange-400 text-sm">Bilgi yok</span>
                  </div>
                )}
              </div>
              
              {/* Varyant Bilgileri - Sadece gerçek varyantları göster */}
              <div className="flex flex-wrap gap-1">
                {/* Gerçek renkler varsa göster */}
                {preview.variants?.colors && preview.variants.colors.length > 0 && (
                  <Badge variant="outline" className="border-cyan-600/40 text-cyan-300 text-xs px-2 py-0 h-5">
                    {preview.variants.colors.length} renk
                  </Badge>
                )}
                
                {/* Gerçek bedenler varsa göster - sahte bedenleri filtrele */}
                {preview.variants?.sizes && preview.variants.sizes.length > 0 && 
                 !preview.variants.sizes.every(size => ['S', 'M', 'L', 'XL', 'XXL', 'XS'].includes(size)) && (
                  <Badge variant="outline" className="border-purple-600/40 text-purple-300 text-xs px-2 py-0 h-5">
                    {preview.variants.sizes.length} beden
                  </Badge>
                )}
                
                {/* Sadece gerçek varyantları say */}
                {variants && variants.length > 0 && variants.some(v => v.color && v.size && v.size !== 'Tek Beden') && (
                  <Badge variant="outline" className="border-orange-600/40 text-orange-300 text-xs px-2 py-0 h-5">
                    {variants.filter(v => v.color && v.size && v.size !== 'Tek Beden').length} varyant
                  </Badge>
                )}
                
                {/* Eğer hiç varyant yoksa tek ürün göster */}
                {(!preview.variants?.colors || preview.variants.colors.length === 0) && 
                 (!preview.variants?.sizes || preview.variants.sizes.length === 0) && (
                  <Badge variant="outline" className="border-slate-600/40 text-slate-400 text-xs px-2 py-0 h-5">
                    Tek ürün
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <Card className="business-card bg-gradient-to-br from-slate-900/90 via-slate-800/50 to-slate-900/90 backdrop-blur border border-cyan-800/30">
      <CardHeader className="business-header pb-2">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-cyan-400" />
          <CardTitle className="text-white font-thin text-sm">CSV Dosya Önizlemeleri</CardTitle>
          <Badge variant="secondary" className="bg-cyan-900/30 text-cyan-300 text-xs px-2 py-0 h-5">
            {csvPreviews.length} dosya
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="p-3 space-y-3">
        {csvPreviews.map((preview) => {
          const isExpanded = expandedItems.has(preview.id);
          const { headers, rows } = parseCSVContent(preview.csvContent);
          const variantCount = preview.variants.colors.length * preview.variants.sizes.length;

          return (
            <div key={preview.id} className="space-y-2">
              {/* Ürün Önizleme Alanı */}
              <ProductPreview preview={preview} />
              
              {/* CSV Önizleme Kartı */}
              <Card className="bg-slate-800/30 border border-slate-600/40 hover:border-cyan-600/50 transition-colors">
              <CardHeader className="pb-1 pt-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <FileText className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <CardTitle className="text-white font-medium text-xs truncate leading-tight mb-1">
                        {preview.productTitle.length > 40 ? preview.productTitle.substring(0, 40) + '...' : preview.productTitle}
                      </CardTitle>
                      <div className="flex items-center gap-1 flex-wrap">
                        <Badge variant="outline" className="text-cyan-300 border-cyan-800 text-xs px-1.5 py-0 h-4 text-xs">
                          {variantCount}v
                        </Badge>
                        <Badge variant="outline" className="text-green-300 border-green-800 text-xs px-1.5 py-0 h-4 text-xs">
                          {headers.length}s
                        </Badge>
                        <Badge variant="outline" className="text-purple-300 border-purple-800 text-xs px-1.5 py-0 h-4 text-xs">
                          {preview.images.length}g
                        </Badge>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <Button
                      onClick={() => onDownload(preview.id, `${preview.productTitle.replace(/[^a-zA-Z0-9]/g, '-')}.csv`)}
                      variant="outline"
                      size="sm"
                      className="text-green-400 border-green-600/30 hover:bg-green-600/10 h-6 px-1.5 text-xs"
                    >
                      <Download className="w-3 h-3" />
                    </Button>
                    
                    <Button
                      onClick={() => onShopifyUpload(preview.id)}
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700 text-white h-6 px-1.5 text-xs"
                    >
                      <ShoppingCart className="w-3 h-3" />
                    </Button>
                    
                    <Button
                      onClick={() => toggleExpanded(preview.id)}
                      variant="ghost"
                      size="sm"
                      className="text-cyan-400 hover:text-cyan-300 hover:bg-cyan-900/20 h-6 px-1.5"
                    >
                      {isExpanded ? (
                        <ChevronUp className="w-3 h-3" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <CardContent className="px-6 pb-6">
                      <div className="space-y-4">
                        {/* CSV Table Preview */}
                        <div className="overflow-x-auto bg-slate-800/30 rounded-lg border border-cyan-800/20">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-cyan-800/20">
                                {headers.slice(0, 6).map((header, index) => (
                                  <th key={index} className="text-left p-3 text-cyan-300 font-medium">
                                    {header}
                                  </th>
                                ))}
                                {headers.length > 6 && (
                                  <th className="text-left p-3 text-cyan-300 font-medium">...</th>
                                )}
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map((row, rowIndex) => (
                                <tr key={rowIndex} className="border-b border-slate-700/30 hover:bg-slate-700/20">
                                  {row.slice(0, 6).map((cell, cellIndex) => (
                                    <td key={cellIndex} className="p-3 text-white/80 truncate max-w-32">
                                      {cell || '-'}
                                    </td>
                                  ))}
                                  {row.length > 6 && (
                                    <td className="p-3 text-white/60">...</td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Product Details */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="space-y-2">
                            <h4 className="text-cyan-300 font-medium text-sm">Renkler</h4>
                            <div className="flex flex-wrap gap-1">
                              {preview.variants.colors.slice(0, 4).map((color, index) => (
                                <Badge key={index} variant="secondary" className="text-xs bg-blue-900/20 text-blue-300">
                                  {color}
                                </Badge>
                              ))}
                              {preview.variants.colors.length > 4 && (
                                <Badge variant="secondary" className="text-xs bg-slate-700 text-slate-300">
                                  +{preview.variants.colors.length - 4}
                                </Badge>
                              )}
                            </div>
                          </div>

                          <div className="space-y-2">
                            <h4 className="text-cyan-300 font-medium text-sm">Bedenler</h4>
                            <div className="flex flex-wrap gap-1">
                              {preview.variants.sizes.slice(0, 4).map((size, index) => (
                                <Badge key={index} variant="secondary" className="text-xs bg-green-900/20 text-green-300">
                                  {size}
                                </Badge>
                              ))}
                              {preview.variants.sizes.length > 4 && (
                                <Badge variant="secondary" className="text-xs bg-slate-700 text-slate-300">
                                  +{preview.variants.sizes.length - 4}
                                </Badge>
                              )}
                            </div>
                          </div>

                          <div className="space-y-2">
                            <h4 className="text-cyan-300 font-medium text-sm">Görseller</h4>
                            <div className="flex gap-2">
                              {preview.images.slice(0, 3).map((image, index) => (
                                <img
                                  key={index}
                                  src={image}
                                  alt={`Product ${index + 1}`}
                                  className="w-12 h-12 object-cover rounded border border-cyan-800/30"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                  }}
                                />
                              ))}
                              {preview.images.length > 3 && (
                                <div className="w-12 h-12 bg-slate-700 rounded border border-cyan-800/30 flex items-center justify-center">
                                  <span className="text-xs text-slate-400">+{preview.images.length - 3}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>


                      </div>
                    </CardContent>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}