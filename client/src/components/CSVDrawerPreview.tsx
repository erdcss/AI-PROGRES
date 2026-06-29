import { useState, memo } from 'react';
import { ProductPreview, type CSVPreviewData } from '@/components/CSVDrawerProductPreview';
import { ChevronDown, ChevronUp, Download, Eye, FileText, Package, ShoppingCart, ChevronLeft, ChevronRight, Tag, Plus, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { normalizePrice, formatOriginalPrice, formatSalePrice, formatProfitAmount, formatProfitPercentage, isValidPrice } from '@/utils/price-utils';
import { sanitizeTrendyolVariants } from '@shared/trendyol-variant-utils';
import { resolvePreviewImagesForEntry, resolvePreviewProxyUrl } from '@/lib/product-image-url';
import { PriceEditor } from '@/components/PriceEditor';

interface CSVDrawerPreviewProps {
  csvPreviews: CSVPreviewData[];
  onDownload: (id: string, filename: string) => void;
  onShopifyUpload: (id: string, individualTags?: string[]) => void;
  individualTags: {[key: string]: string[]};
  setIndividualTags: React.Dispatch<React.SetStateAction<{[key: string]: string[]}>>;
  uploadingId?: string | null;
}

export const CSVDrawerPreview = memo(function CSVDrawerPreview({ csvPreviews, onDownload, onShopifyUpload, individualTags, setIndividualTags, uploadingId }: CSVDrawerPreviewProps) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [selectedImageIndex, setSelectedImageIndex] = useState<{[key: string]: number}>({});
  const [updatedPrices, setUpdatedPrices] = useState<{[key: string]: any}>({});
  const [newTagInputs, setNewTagInputs] = useState<{[key: string]: string}>({});
  const [selectedPreviews, setSelectedPreviews] = useState<Set<string>>(new Set());
  const [bulkTagInput, setBulkTagInput] = useState('');

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

  const addTag = (previewId: string) => {
    const newTag = newTagInputs[previewId]?.trim();
    if (newTag && newTag.length > 0) {
      setIndividualTags(prev => ({
        ...prev,
        [previewId]: [...(prev[previewId] || []), newTag]
      }));
      setNewTagInputs(prev => ({
        ...prev,
        [previewId]: ''
      }));
    }
  };

  const removeTag = (previewId: string, tagIndex: number) => {
    setIndividualTags(prev => ({
      ...prev,
      [previewId]: (prev[previewId] || []).filter((_, i) => i !== tagIndex)
    }));
  };

  const toggleSelectAll = () => {
    if (selectedPreviews.size === csvPreviews.length) {
      setSelectedPreviews(new Set());
    } else {
      setSelectedPreviews(new Set(csvPreviews.map(p => p.id)));
    }
  };

  const toggleSelectPreview = (id: string) => {
    const newSelected = new Set(selectedPreviews);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedPreviews(newSelected);
  };

  const addBulkTags = () => {
    const tagsToAdd = bulkTagInput.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
    
    if (tagsToAdd.length === 0) return;
    
    if (selectedPreviews.size === 0) {
      // Hiçbir ürün seçili değilse tüm ürünlere ekle
      setIndividualTags(prev => {
        const updated = { ...prev };
        csvPreviews.forEach(preview => {
          const existingTags = prev[preview.id] || [];
          const newTags = tagsToAdd.filter(tag => !existingTags.includes(tag));
          if (newTags.length > 0) {
            updated[preview.id] = [...existingTags, ...newTags];
          }
        });
        return updated;
      });
    } else {
      // Sadece seçili ürünlere ekle
      setIndividualTags(prev => {
        const updated = { ...prev };
        selectedPreviews.forEach(previewId => {
          const existingTags = prev[previewId] || [];
          const newTags = tagsToAdd.filter(tag => !existingTags.includes(tag));
          if (newTags.length > 0) {
            updated[previewId] = [...existingTags, ...newTags];
          }
        });
        return updated;
      });
    }
    
    setBulkTagInput('');
  };

  const parseCSVContent = (csvContent: string, csvPreview?: { headers?: string[]; rows?: string[][] }) => {
    if (csvPreview?.headers?.length) {
      return {
        headers: csvPreview.headers,
        rows: (csvPreview.rows ?? []).slice(0, 5),
      };
    }

    const lines = csvContent.split('\n').filter(line => line.trim());
    if (lines.length < 2) return { headers: [], rows: [] };
    
    const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
    const rows = lines.slice(1, 6).map(line => 
      line.split(',').map((cell: string) => cell.replace(/"/g, '').trim())
    );
    
    return { headers, rows };
  };

  // CSV içeriğine manuel etiketleri ekleyen fonksiyon
  const addManualTagsToCSV = (csvContent: string, previewId: string): string => {
    const manualTags = individualTags[previewId] || [];
    if (manualTags.length === 0) return csvContent;

    const lines = csvContent.split('\n').filter(line => line.trim());
    if (lines.length < 2) return csvContent;

    // CSV'yi parse et (quoted values'ları doğru handle et)
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

    if (tagsIndex === -1) return csvContent;

    // Tüm satırları güncelle - HER VARYANT SATIRINA etiket ekle
    const updatedLines = [lines[0]]; // Header'ı koru
    
    for (let i = 1; i < lines.length; i++) {
      const cells = parseCSVLine(lines[i]);
      
      // TÜM satırlara etiketleri ekle (multi-variant için kritik!)
      if (cells[tagsIndex] !== undefined) {
        const existingTags = cells[tagsIndex].replace(/"/g, '').trim();
        const allTags = existingTags 
          ? `${existingTags}, ${manualTags.join(', ')}` 
          : manualTags.join(', ');
        cells[tagsIndex] = `"${allTags}"`;
      }
      
      // Satırı yeniden oluştur (quoted values ile)
      const newLine = cells.map(cell => {
        if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
          return `"${cell.replace(/"/g, '""')}"`;
        }
        return cell;
      }).join(',');
      
      updatedLines.push(newLine);
    }

    return updatedLines.join('\n');
  };

  if (csvPreviews.length === 0) {
    return (
      <div className="mt-8">
        <Card className="business-card">
          <CardHeader className="business-header">
            <CardTitle className="text-white font-thin text-lg flex items-center gap-2">
              <FileText className="w-5 h-5 text-yellow-400/70" />
              CSV Önizleme
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="text-center py-8">
              <Package className="w-12 h-12 text-gray-500 mx-auto mb-4" />
              <p className="text-gray-400 mb-2">CSV önizleme bulunamadı</p>
              <p className="text-gray-500 text-sm">
                Trendyol tarafından engellenmiş olabilirsiniz. 
                Lütfen birkaç dakika bekleyip tekrar deneyin.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

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
        {/* Toplu Etiket Ekleme Alanı */}
        <div className="bg-slate-800/50 border border-cyan-600/30 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-cyan-400" />
              <h4 className="text-sm font-medium text-cyan-300">Toplu Etiket Ekle</h4>
            </div>
            <Button
              onClick={toggleSelectAll}
              size="sm"
              variant="outline"
              className="h-6 text-xs border-slate-600 text-slate-300 hover:bg-cyan-900/20 hover:border-cyan-600 px-2"
            >
              {selectedPreviews.size === csvPreviews.length ? 'Hiçbirini Seçme' : 'Tümünü Seç'}
            </Button>
          </div>
          <div className="flex gap-2">
            <Input
              type="text"
              value={bulkTagInput}
              onChange={(e) => setBulkTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addBulkTags();
                }
              }}
              placeholder="Etiketleri virgülle ayırın (örn: yeni, indirim, özel)"
              className="flex-1 h-8 text-xs bg-slate-900/50 border border-slate-600/30 text-white placeholder:text-slate-500 focus:border-cyan-500/50"
              data-testid="input-bulk-tags"
            />
            <Button
              onClick={addBulkTags}
              size="sm"
              className="h-8 px-3 bg-cyan-600/80 hover:bg-cyan-600 text-white text-xs"
              data-testid="button-add-bulk-tags"
            >
              <Plus className="w-3 h-3 mr-1" />
              Ekle
            </Button>
          </div>
          <p className="text-xs text-slate-400">
            {selectedPreviews.size > 0 
              ? `${selectedPreviews.size} seçili ürüne etiket eklenecek` 
              : 'Hiçbir ürün seçili değil - tüm ürünlere eklenecek'}
          </p>
        </div>

        {csvPreviews.map((preview) => {
          const isExpanded = expandedItems.has(preview.id);
          const { headers, rows } = parseCSVContent(preview.csvContent, (preview as { csvPreview?: { headers?: string[]; rows?: string[][] } }).csvPreview);
          const hasCsvTable = headers.length > 0 && rows.length > 0;
          // ✅ FIXED: Calculate variant count from allVariants array
          const variants = sanitizeTrendyolVariants(preview.variants, {
            productTitle: preview.productTitle,
          });
          const allVariants = variants.allVariants;
          const variantCount = allVariants.length;
          
          const uniqueColors = variants.colors;
          const uniqueSizes = variants.sizes;
          const { urls: previewImageUrls } = resolvePreviewImagesForEntry({
            images: preview.images,
            csvContent: preview.csvContent,
          });
          const previewImageCount = Math.max(previewImageUrls.length, 1);

          return (
            <div key={preview.id} className="space-y-2">
              {/* Ürün Önizleme Alanı */}
              <ProductPreview
                preview={preview}
                imageIndex={selectedImageIndex[preview.id] || 0}
                tags={individualTags[preview.id] || []}
                onPrevImage={() => prevImage(preview.id, previewImageCount)}
                onNextImage={() => nextImage(preview.id, previewImageCount)}
                onSelectImage={(index) =>
                  setSelectedImageIndex((prev) => ({ ...prev, [preview.id]: index }))
                }
                onRemoveTag={(tagIndex) => removeTag(preview.id, tagIndex)}
                onAddTag={(tag) =>
                  setIndividualTags((prev) => ({
                    ...prev,
                    [preview.id]: [...(prev[preview.id] || []), tag],
                  }))
                }
              />
              
              {/* CSV Önizleme Kartı */}
              <Card className="bg-slate-800/30 border border-slate-600/40 hover:border-cyan-600/50 transition-colors">
              <CardHeader className="pb-1 pt-2 px-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={selectedPreviews.has(preview.id)}
                      onChange={() => toggleSelectPreview(preview.id)}
                      className="w-4 h-4 rounded border-slate-600 text-cyan-600 focus:ring-cyan-500 focus:ring-offset-slate-900 cursor-pointer"
                      data-testid={`checkbox-select-${preview.id}`}
                    />
                    <FileText className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <CardTitle className="text-white font-medium text-xs truncate leading-tight mb-1">
                        {preview.productTitle.length > 40 ? preview.productTitle.substring(0, 40) + '...' : preview.productTitle}
                      </CardTitle>
                      <div className="flex items-center gap-1 flex-wrap">
                        {previewImageUrls.length > 0 && (
                          <Badge variant="outline" className="text-slate-300 border-slate-600 text-[10px] px-1 py-0 h-4 leading-none">
                            {previewImageUrls.length} görsel
                          </Badge>
                        )}
                        {uniqueColors.length > 0 && uniqueColors[0] !== 'Standart' && uniqueColors[0] !== 'Tek Renk' && (
                          <Badge variant="outline" className="text-pink-300 border-pink-800 text-[10px] px-1 py-0 h-4 leading-none">
                            {uniqueColors.length} renk
                          </Badge>
                        )}
                        {uniqueSizes.length > 0 && (
                          <Badge variant="outline" className="text-green-300 border-green-800 text-[10px] px-1 py-0 h-4 leading-none">
                            {uniqueSizes.length} beden
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-cyan-300 border-cyan-800 text-[10px] px-1 py-0 h-4 leading-none">
                          {variantCount} varyant
                        </Badge>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                    <Button
                      onClick={() => onDownload(preview.id, `${preview.productTitle.replace(/[^a-zA-Z0-9]/g, '-')}.csv`)}
                      variant="outline"
                      size="sm"
                      className="text-green-400 border-green-600/30 hover:bg-green-600/10 h-6 w-6 p-0 flex items-center justify-center"
                      title="CSV İndir"
                    >
                      <Download className="w-3 h-3" />
                    </Button>
                    
                    <Button
                      onClick={() => !uploadingId && onShopifyUpload(preview.id, individualTags[preview.id])}
                      size="sm"
                      disabled={!!uploadingId}
                      className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white h-6 w-6 p-0 flex items-center justify-center disabled:opacity-60"
                      data-testid={`button-shopify-upload-${preview.id}`}
                      title={uploadingId === preview.id ? 'Yükleniyor...' : `${preview.productTitle} - Shopify'a Aktar`}
                    >
                      {uploadingId === preview.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <ShoppingCart className="w-3 h-3" />
                      )}
                    </Button>
                    
                    <Button
                      onClick={() => toggleExpanded(preview.id)}
                      variant="ghost"
                      size="sm"
                      className="text-cyan-400 hover:text-cyan-300 hover:bg-cyan-900/20 h-6 w-6 p-0 flex items-center justify-center"
                      title={isExpanded ? "Küçült" : "Genişlet"}
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

              {isExpanded && (
                  <CardContent className="px-6 pb-6">
                      <div className="space-y-4">
                        {hasCsvTable ? (
                        <>
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

                        {/* ✅ FIXED: Product Details - Use allVariants data */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {(() => {
                            const variants = sanitizeTrendyolVariants(preview.variants, {
                              productTitle: preview.productTitle,
                            });
                            const uniqueColors = variants.colors;
                            const uniqueSizes = variants.sizes;
                            
                            return (
                              <>
                                <div className="space-y-2">
                                  <h4 className="text-cyan-300 font-medium text-sm">Renkler ({uniqueColors.length})</h4>
                                  <div className="flex flex-wrap gap-1">
                                    {uniqueColors.slice(0, 4).map((color, index) => (
                                      <Badge key={index} variant="secondary" className="text-xs bg-blue-900/20 text-blue-300">
                                        {color}
                                      </Badge>
                                    ))}
                                    {uniqueColors.length > 4 && (
                                      <Badge variant="secondary" className="text-xs bg-slate-700 text-slate-300">
                                        +{uniqueColors.length - 4}
                                      </Badge>
                                    )}
                                    {uniqueColors.length === 0 && (
                                      <span className="text-slate-500 text-xs">Renk bilgisi yok</span>
                                    )}
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <h4 className="text-cyan-300 font-medium text-sm">Bedenler ({uniqueSizes.length})</h4>
                                  <div className="flex flex-wrap gap-1">
                                    {uniqueSizes.slice(0, 4).map((size, index) => (
                                      <Badge key={index} variant="secondary" className="text-xs bg-green-900/20 text-green-300">
                                        {size}
                                      </Badge>
                                    ))}
                                    {uniqueSizes.length > 4 && (
                                      <Badge variant="secondary" className="text-xs bg-slate-700 text-slate-300">
                                        +{uniqueSizes.length - 4}
                                      </Badge>
                                    )}
                                    {uniqueSizes.length === 0 && (
                                      <span className="text-slate-500 text-xs">Beden bilgisi yok</span>
                                    )}
                                  </div>
                                </div>
                                
                                <div className="space-y-2">
                                  <h4 className="text-cyan-300 font-medium text-sm">Görseller ({previewImageUrls.length})</h4>
                                  <div className="flex gap-2">
                                    {previewImageUrls.slice(0, 3).map((image, index) => (
                                      <img
                                        key={index}
                                        src={image}
                                        alt={`Product ${index + 1}`}
                                        className="w-12 h-12 object-cover rounded border border-cyan-800/30"
                                        loading="lazy"
                                        referrerPolicy="no-referrer"
                                        onError={(e) => {
                                          const img = e.currentTarget;
                                          const proxy = resolvePreviewProxyUrl(image);
                                          if (proxy && img.dataset.fallback !== "proxy") {
                                            img.dataset.fallback = "proxy";
                                            img.src = proxy;
                                            return;
                                          }
                                          img.style.display = "none";
                                        }}
                                      />
                                    ))}
                                    {previewImageUrls.length > 3 && (
                                      <div className="w-12 h-12 bg-slate-700 rounded border border-cyan-800/30 flex items-center justify-center">
                                        <span className="text-xs text-slate-400">+{previewImageUrls.length - 3}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                        </>
                        ) : (
                          <div className="py-6 text-center space-y-2 rounded-lg border border-slate-700/40 bg-slate-900/30">
                            <p className="text-slate-300 text-sm font-medium">CSV henüz oluşturulmadı</p>
                            <p className="text-slate-500 text-xs">
                              Ürün verisi çekildi ancak CSV export bekliyor
                            </p>
                          </div>
                        )}

                      </div>
                    </CardContent>
                )}
            </Card>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
});