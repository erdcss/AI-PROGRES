import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, FileText, Package, Eye, EyeOff, Loader2 } from "lucide-react";
import { fetchShopifyCsvStatus } from "@/lib/shopify-csv-download";

interface CsvPreviewTable {
  headers: string[];
  rows: string[][];
}

interface CSVPreviewProps {
  csvContent?: string;
  csvPreview?: CsvPreviewTable;
  csvInfo?: { ready?: boolean; filename?: string; downloadUrl?: string };
  productTitle: string;
  onDownload: (content: string, filename: string) => void;
  onShopifyUpload: (csvContent: string) => void;
}

function parseCsvContent(csvContent: string): CsvPreviewTable {
  const lines = csvContent
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((row) => row.trim().length > 0);

  if (lines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        cells.push(current.replace(/^"|"$/g, "").trim());
        current = "";
      } else {
        current += char;
      }
    }
    cells.push(current.replace(/^"|"$/g, "").trim());
    return cells;
  };

  return {
    headers: parseLine(lines[0]),
    rows: lines.slice(1, 6).map(parseLine),
  };
}

export function CSVPreview({
  csvContent,
  csvPreview,
  csvInfo,
  productTitle,
  onDownload,
  onShopifyUpload,
}: CSVPreviewProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [serverReady, setServerReady] = useState<boolean | null>(null);

  const table = useMemo(() => {
    if (csvPreview?.headers?.length) {
      return {
        headers: csvPreview.headers,
        rows: (csvPreview.rows ?? []).slice(0, 5),
      };
    }
    if (csvContent?.trim()) {
      return parseCsvContent(csvContent);
    }
    return { headers: [], rows: [] };
  }, [csvContent, csvPreview]);

  useEffect(() => {
    let cancelled = false;
    fetchShopifyCsvStatus()
      .then((status) => {
        if (!cancelled) setServerReady(status.ready === true);
      })
      .catch(() => {
        if (!cancelled) setServerReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, [csvContent, csvInfo?.ready]);

  const hasPreview = table.headers.length > 0 && table.rows.length > 0;
  const downloadReady = serverReady === true || csvInfo?.ready === true || Boolean(csvContent?.trim());

  const handleDownload = async () => {
    if (csvContent?.trim()) {
      const filename = `${productTitle?.slice(0, 30) || "product"}-shopify.csv`;
      onDownload(csvContent, filename);
      return;
    }
    if (serverReady) {
      const { downloadShopifyCsvFromServer } = await import("@/lib/shopify-csv-download");
      await downloadShopifyCsvFromServer();
    }
  };

  const handleShopifyUpload = () => {
    if (csvContent?.trim()) {
      onShopifyUpload(csvContent);
    }
  };

  return (
    <div className="w-full">
      <Card className="business-card">
        <CardHeader className="business-header">
          <div className="flex items-center justify-between">
            <CardTitle className="text-white font-thin text-lg flex items-center gap-2">
              <FileText className="w-5 h-5 text-cyan-400/70" />
              CSV Dosya Önizlemesi
            </CardTitle>
            <div className="flex items-center gap-2">
              {hasPreview && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="border-slate-600/50 hover:bg-slate-800/50 text-white text-xs px-3 py-1"
                >
                  {isExpanded ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  {isExpanded ? "Gizle" : "Göster"}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleDownload()}
                disabled={!downloadReady}
                className="border-green-600/50 hover:bg-green-800/50 text-green-400 text-xs px-3 py-1 disabled:opacity-40"
              >
                <Download className="w-4 h-4 mr-1" />
                İndir
              </Button>
              {csvContent?.trim() && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleShopifyUpload}
                  className="border-blue-600/50 hover:bg-blue-800/50 text-blue-400 text-xs px-3 py-1"
                >
                  <Package className="w-4 h-4 mr-1" />
                  Shopify&apos;a Aktar
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4">
          {serverReady === null && !hasPreview ? (
            <div className="flex items-center justify-center gap-2 py-6 text-slate-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              CSV durumu kontrol ediliyor...
            </div>
          ) : hasPreview ? (
            isExpanded && (
              <div className="space-y-3">
                <div className="flex items-center gap-4 text-sm text-slate-400">
                  <span>{table.rows.length} satır gösteriliyor</span>
                  <span>{table.headers.length} sütun</span>
                  <span>Shopify uyumlu format</span>
                </div>
                <div className="bg-slate-900/50 rounded-lg overflow-hidden border border-slate-700/50">
                  <div className="overflow-x-auto max-h-64 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-800/70 sticky top-0">
                        <tr>
                          {table.headers.map((header, index) => (
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
                        {table.rows.map((row, rowIndex) => (
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
                                  {cell || "-"}
                                </div>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )
          ) : (
            <div className="py-6 text-center space-y-2">
              <p className="text-slate-300 text-sm font-medium">CSV henüz oluşturulmadı</p>
              <p className="text-slate-500 text-xs">
                Ürün verisi çekildi ancak CSV export bekliyor
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
