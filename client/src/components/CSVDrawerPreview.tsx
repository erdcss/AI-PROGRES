import { useState } from 'react';
import { ChevronDown, ChevronUp, Download, Eye, FileText, Package } from 'lucide-react';
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
  };
  images: string[];
  createdAt: string;
}

interface CSVDrawerPreviewProps {
  csvPreviews: CSVPreviewData[];
  onDownload: (id: string, filename: string) => void;
  onShopifyUpload: (id: string) => void;
}

export function CSVDrawerPreview({ csvPreviews, onDownload, onShopifyUpload }: CSVDrawerPreviewProps) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedItems(newExpanded);
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

  return (
    <div className="mt-8 space-y-4">
      <div className="flex items-center gap-2">
        <FileText className="w-5 h-5 text-cyan-400" />
        <h2 className="text-white font-thin text-xl">CSV Dosya Önizlemeleri</h2>
        <Badge variant="secondary" className="bg-cyan-900/30 text-cyan-300">
          {csvPreviews.length} dosya
        </Badge>
      </div>

      <div className="space-y-3">
        {csvPreviews.map((preview) => {
          const isExpanded = expandedItems.has(preview.id);
          const { headers, rows } = parseCSVContent(preview.csvContent);
          const variantCount = preview.variants.colors.length * preview.variants.sizes.length;

          return (
            <Card key={preview.id} className="business-card border border-cyan-800/30">
              <CardHeader 
                className="business-header cursor-pointer"
                onClick={() => toggleExpanded(preview.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Package className="w-5 h-5 text-cyan-400" />
                    <div>
                      <CardTitle className="text-white font-thin text-lg">
                        {preview.productTitle}
                      </CardTitle>
                      <div className="flex items-center gap-4 mt-1">
                        <Badge variant="outline" className="text-cyan-300 border-cyan-800">
                          {variantCount} varyant
                        </Badge>
                        <Badge variant="outline" className="text-green-300 border-green-800">
                          {headers.length} sütun
                        </Badge>
                        <Badge variant="outline" className="text-purple-300 border-purple-800">
                          {preview.images.length} görsel
                        </Badge>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDownload(preview.id, `${preview.productTitle.replace(/[^a-zA-Z0-9]/g, '-')}.csv`);
                      }}
                      variant="ghost"
                      size="sm"
                      className="text-green-400 hover:text-green-300 hover:bg-green-900/20"
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                    
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        onShopifyUpload(preview.id);
                      }}
                      variant="ghost"
                      size="sm"
                      className="text-blue-400 hover:text-blue-300 hover:bg-blue-900/20"
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-cyan-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-cyan-400" />
                    )}
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

                        {/* Actions */}
                        <div className="flex justify-end gap-3 pt-4 border-t border-cyan-800/20">
                          <Button
                            onClick={() => onDownload(preview.id, `${preview.productTitle.replace(/[^a-zA-Z0-9]/g, '-')}.csv`)}
                            variant="outline"
                            size="sm"
                            className="text-green-400 border-green-800 hover:bg-green-900/20"
                          >
                            <Download className="w-4 h-4 mr-2" />
                            CSV İndir
                          </Button>
                          
                          <Button
                            onClick={() => onShopifyUpload(preview.id)}
                            size="sm"
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                          >
                            <Package className="w-4 h-4 mr-2" />
                            Shopify'a Yükle
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
          );
        })}
      </div>
    </div>
  );
}