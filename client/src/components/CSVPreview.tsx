import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, FileText, Package, Eye, EyeOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface CSVPreviewProps {
  product?: any;
  isVisible?: boolean;
}

export function CSVPreview({ product, isVisible = true }: CSVPreviewProps) {
  const [csvContent, setCsvContent] = useState<string>("");
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Generate CSV content when product changes
  useEffect(() => {
    if (product && product.title) {
      generateCSVContent();
    }
  }, [product]);

  const generateCSVContent = async () => {
    if (!product) return;

    setIsGenerating(true);
    try {
      // Generate CSV using the multi-variant CSV generator
      const response = await fetch("/api/generate-multi-variant-csv", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ productData: product }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.csvContent) {
          setCsvContent(data.csvContent);
          // Parse CSV into rows for preview
          const rows = data.csvContent.split('\n').map((row: string) => 
            row.split(',').map((cell: string) => cell.replace(/"/g, ''))
          );
          setCsvRows(rows);
        }
      }
    } catch (error) {
      console.error('CSV generation error:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadCSV = () => {
    if (!csvContent) return;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${product?.title?.slice(0, 30) || 'product'}-shopify.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isVisible || !product) return null;

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
              {csvContent && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={downloadCSV}
                  className="border-green-600/50 hover:bg-green-800/50 text-green-400 text-xs px-3 py-1"
                >
                  <Download className="w-4 h-4 mr-1" />
                  İndir
                </Button>
              )}
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
                {isGenerating ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="flex items-center gap-2 text-slate-400">
                      <Package className="w-5 h-5 animate-pulse" />
                      <span>CSV dosyası oluşturuluyor...</span>
                    </div>
                  </div>
                ) : csvRows.length > 0 ? (
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
                          {product.title}
                        </div>
                      </div>
                      <div className="bg-slate-800/30 rounded p-3">
                        <div className="text-xs text-slate-500 mb-1">Varyant Sayısı</div>
                        <div className="text-sm text-green-400 font-medium">
                          {product.variants?.allVariants?.length || 0} adet
                        </div>
                      </div>
                      <div className="bg-slate-800/30 rounded p-3">
                        <div className="text-xs text-slate-500 mb-1">Görsel Sayısı</div>
                        <div className="text-sm text-blue-400 font-medium">
                          {product.images?.length || 0} adet
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