import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, FileText, Package, Eye, EyeOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface CSVPreviewProps {
  csvContent: string;
  productTitle: string;
  onDownload: (content: string, filename: string) => void;
  onShopifyUpload: (csvContent: string) => void;
}

export function CSVPreview({ csvContent, productTitle, onDownload, onShopifyUpload }: CSVPreviewProps) {
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [isExpanded, setIsExpanded] = useState(false);

  // Parse CSV content when it changes
  useEffect(() => {
    if (csvContent) {
      const rows = csvContent.split('\n')
        .filter(row => row.trim().length > 0)
        .map((row: string) => 
          row.split(',').map((cell: string) => cell.replace(/"/g, '').trim())
        );
      setCsvRows(rows);
    }
  }, [csvContent]);

  const handleDownload = () => {
    const filename = `${productTitle?.slice(0, 30) || 'product'}-shopify.csv`;
    onDownload(csvContent, filename);
  };

  const handleShopifyUpload = () => {
    onShopifyUpload(csvContent);
  };

  if (!csvContent) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="w-full"
    >
      <Card className="business-card">
        <CardHeader className="business-header">
          <div className="flex items-center justify-between">
            <CardTitle className="text-white font-thin text-lg flex items-center gap-2">
              <FileText className="w-5 h-5 text-cyan-400/70" />
              CSV Dosya Önizlemesi
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsExpanded(!isExpanded)}
                className="border-slate-600/50 hover:bg-slate-800/50 text-white text-xs px-3 py-1"
              >
                {isExpanded ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                {isExpanded ? 'Gizle' : 'Göster'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                className="border-green-600/50 hover:bg-green-800/50 text-green-400 text-xs px-3 py-1"
              >
                <Download className="w-4 h-4 mr-1" />
                İndir
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleShopifyUpload}
                className="border-blue-600/50 hover:bg-blue-800/50 text-blue-400 text-xs px-3 py-1"
              >
                <Package className="w-4 h-4 mr-1" />
                Shopify'a Aktar
              </Button>
            </div>
          </div>
        </CardHeader>
        
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <CardContent className="p-4">
                {csvRows.length > 0 ? (
                  <div className="space-y-3">
                    {/* CSV Stats */}
                    <div className="flex items-center gap-4 text-sm text-slate-400">
                      <span>{csvRows.length - 1} satır</span>
                      <span>{csvRows[0]?.length || 0} sütun</span>
                      <span>Shopify uyumlu format</span>
                    </div>

                    {/* CSV Table Preview */}
                    <div className="bg-slate-900/50 rounded-lg overflow-hidden border border-slate-700/50">
                      <div className="overflow-x-auto max-h-64 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-800/70 sticky top-0">
                            <tr>
                              {csvRows[0]?.map((header, index) => (
                                <th
                                  key={index}
                                  className="px-2 py-2 text-left text-cyan-400 font-medium border-r border-slate-600/50 last:border-r-0 min-w-24"
                                >
                                  {header}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {csvRows.slice(1, 6).map((row, rowIndex) => (
                              <tr
                                key={rowIndex}
                                className="border-b border-slate-700/30 hover:bg-slate-800/30"
                              >
                                {row.map((cell, cellIndex) => (
                                  <td
                                    key={cellIndex}
                                    className="px-2 py-2 text-slate-300 border-r border-slate-600/30 last:border-r-0"
                                  >
                                    <div className="max-w-32 truncate" title={cell}>
                                      {cell || '-'}
                                    </div>
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      
                      {csvRows.length > 6 && (
                        <div className="bg-slate-800/50 px-3 py-2 text-xs text-slate-400 text-center">
                          +{csvRows.length - 6} satır daha...
                        </div>
                      )}
                    </div>

                    {/* Product Summary */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="bg-slate-800/30 rounded p-3">
                        <div className="text-xs text-slate-500 mb-1">Ürün Başlığı</div>
                        <div className="text-sm text-white font-medium truncate">
                          {productTitle}
                        </div>
                      </div>
                      <div className="bg-slate-800/30 rounded p-3">
                        <div className="text-xs text-slate-500 mb-1">CSV Satır Sayısı</div>
                        <div className="text-sm text-green-400 font-medium">
                          {csvRows.length - 1} adet
                        </div>
                      </div>
                      <div className="bg-slate-800/30 rounded p-3">
                        <div className="text-xs text-slate-500 mb-1">CSV Boyutu</div>
                        <div className="text-sm text-blue-400 font-medium">
                          {Math.round(csvContent.length / 1024)} KB
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-8">
                    <div className="text-slate-500 text-sm">
                      CSV dosyası oluşturulamadı
                    </div>
                  </div>
                )}
              </CardContent>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
}