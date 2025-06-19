import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, Eye, Package } from "lucide-react";

interface CSVPreviewProps {
  csvPath: string;
}

interface CSVPreviewData {
  headers: string[];
  rows: string[][];
  totalRows: number;
  uniqueProducts: number;
  filename: string;
}

export function CSVPreview({ csvPath }: CSVPreviewProps) {
  const [previewData, setPreviewData] = useState<CSVPreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCSVPreview();
  }, [csvPath]);

  const fetchCSVPreview = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/csv-preview');
      if (!response.ok) {
        throw new Error('CSV önizleme alınamadı');
      }
      
      const data = await response.json();
      setPreviewData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bilinmeyen hata');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    try {
      const response = await fetch(`/api/download/${csvPath}`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = csvPath;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Download error:', err);
    }
  };

  if (loading) {
    return (
      <Card className="bg-gray-800 border-gray-700">
        <CardContent className="p-4">
          <div className="flex items-center justify-center space-x-2 text-gray-400">
            <div className="animate-spin w-4 h-4 border-2 border-gray-600 border-t-blue-400 rounded-full"></div>
            <span className="text-sm">CSV verisi yükleniyor...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-red-900/20 border-red-800">
        <CardContent className="p-4">
          <div className="text-red-400 text-sm text-center">
            {error}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!previewData) {
    return (
      <Card className="bg-gray-800 border-gray-700">
        <CardContent className="p-4">
          <div className="text-gray-400 text-sm text-center">
            CSV verisi bulunamadı
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-white">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-400" />
            <span className="text-sm">CSV Önizleme</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs border-green-600 text-green-400">
              Shopify Uyumlu
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* CSV İstatistikleri */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-700 p-3 rounded-lg text-center">
            <div className="text-lg font-bold text-blue-400">{previewData.totalRows}</div>
            <div className="text-xs text-gray-400">Toplam Satır</div>
          </div>
          <div className="bg-gray-700 p-3 rounded-lg text-center">
            <div className="text-lg font-bold text-green-400">{previewData.uniqueProducts}</div>
            <div className="text-xs text-gray-400">Ürün</div>
          </div>
        </div>

        {/* CSV Tablosu Önizleme */}
        <div className="bg-gray-900 rounded-lg overflow-hidden">
          <div className="p-2 bg-gray-800 border-b border-gray-700">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-gray-400" />
              <span className="text-xs text-gray-300">İlk 5 Satır Önizleme</span>
              <Badge variant="outline" className="text-xs border-gray-600 text-gray-400">
                UTF-8 BOM
              </Badge>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-800">
                  {previewData.headers.slice(0, 5).map((header, index) => (
                    <th key={index} className="px-2 py-1 text-left text-gray-300 border-r border-gray-700 last:border-r-0">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewData.rows.slice(0, 3).map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-b border-gray-700 hover:bg-gray-800/50">
                    {row.slice(0, 5).map((cell, cellIndex) => (
                      <td key={cellIndex} className="px-2 py-1 text-gray-400 border-r border-gray-700 last:border-r-0 max-w-32 truncate">
                        {cell || '-'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {previewData.rows.length > 3 && (
            <div className="p-2 bg-gray-800 text-center">
              <span className="text-xs text-gray-400">
                +{previewData.rows.length - 3} satır daha...
              </span>
            </div>
          )}
        </div>

        {/* İndirme Butonu */}
        <button
          onClick={handleDownload}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors flex items-center justify-center gap-2"
        >
          <Download className="w-4 h-4" />
          CSV İndir ({previewData.filename})
        </button>
      </CardContent>
    </Card>
  );
}