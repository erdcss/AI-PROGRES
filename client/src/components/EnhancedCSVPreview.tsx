import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { RefreshCw, Download, AlertCircle, CheckCircle, FileText } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface CSVRow {
  Handle: string;
  Title: string;
  'Body (HTML)': string;
  Vendor: string;
  Type: string;
  'Variant Price': string;
  'Option1 Value': string;
  'Option2 Value': string;
}

interface CSVValidation {
  isValid: boolean;
  totalRows: number;
  hasHeader: boolean;
  hasBOM: boolean;
  errors: string[];
  warnings: string[];
}

export function EnhancedCSVPreview() {
  const [csvData, setCsvData] = useState<CSVRow[]>([]);
  const [validation, setValidation] = useState<CSVValidation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    let i = 0;

    while (i < line.length) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 2;
        } else {
          inQuotes = !inQuotes;
          i++;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
        i++;
      } else {
        current += char;
        i++;
      }
    }
    
    result.push(current);
    return result;
  };

  const validateCSV = (csvText: string): CSVValidation => {
    const lines = csvText.split('\n').filter(line => line.trim());
    const hasBOM = csvText.charCodeAt(0) === 0xFEFF;
    const errors: string[] = [];
    const warnings: string[] = [];
    
    if (lines.length < 2) {
      errors.push('CSV dosyasında yeterli veri yok');
      return { isValid: false, totalRows: 0, hasHeader: false, hasBOM, errors, warnings };
    }
    
    const headerLine = lines[0];
    const headerColumns = parseCSVLine(headerLine);
    const requiredColumns = ['Handle', 'Title', 'Variant Price', 'Vendor'];
    const hasAllRequired = requiredColumns.every(col => 
      headerColumns.some(h => h.includes(col))
    );
    
    if (!hasAllRequired) {
      errors.push('Gerekli kolonlar eksik veya yanlış adlandırılmış');
    }
    
    if (!hasBOM) {
      warnings.push('UTF-8 BOM eksik - Shopify Türkçe karakterleri bozabilir');
    }
    
    let emptyHandles = 0;
    let emptyTitles = 0;
    let emptyPrices = 0;
    
    for (let i = 1; i < Math.min(lines.length, 50); i++) {
      const columns = parseCSVLine(lines[i]);
      
      if (!columns[0] || columns[0].trim() === '') emptyHandles++;
      if (!columns[1] || columns[1].trim() === '') emptyTitles++;
      
      const priceIndex = headerColumns.findIndex(h => h.includes('Variant Price'));
      if (priceIndex >= 0 && (!columns[priceIndex] || columns[priceIndex].trim() === '')) {
        emptyPrices++;
      }
    }
    
    if (emptyHandles > 0) errors.push(`${emptyHandles} satırda boş Handle`);
    if (emptyTitles > 0) errors.push(`${emptyTitles} satırda boş Title`);
    if (emptyPrices > 0) errors.push(`${emptyPrices} satırda boş Fiyat`);
    
    return {
      isValid: errors.length === 0,
      totalRows: lines.length - 1,
      hasHeader: headerColumns.length > 20,
      hasBOM,
      errors,
      warnings
    };
  };

  const fetchCSVData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/shopify-urunler.csv');
      if (!response.ok) {
        throw new Error('CSV dosyası bulunamadı');
      }
      
      const csvText = await response.text();
      const validationResult = validateCSV(csvText);
      setValidation(validationResult);
      
      const lines = csvText.trim().split('\n');
      if (lines.length < 2) {
        throw new Error('CSV dosyası boş');
      }

      const header = parseCSVLine(lines[0]);
      const rows = lines.slice(1, 8).map(line => {
        const values = parseCSVLine(line);
        const row: any = {};
        header.forEach((key, index) => {
          row[key] = values[index] || '';
        });
        return row as CSVRow;
      });
      
      setCsvData(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CSV okuma hatası');
    } finally {
      setLoading(false);
    }
  };

  const downloadCSV = () => {
    const link = document.createElement('a');
    link.href = '/shopify-urunler.csv';
    link.download = 'shopify-urunler.csv';
    link.click();
  };

  useEffect(() => {
    fetchCSVData();
  }, []);

  if (loading) {
    return (
      <Card className="bg-gray-800 border-gray-700">
        <CardContent className="p-6">
          <div className="flex items-center justify-center space-x-3 text-gray-400">
            <RefreshCw className="h-5 w-5 animate-spin" />
            <span>CSV analiz ediliyor...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white">CSV Önizleme</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert className="border-red-600 bg-red-900/20">
            <AlertCircle className="h-4 w-4 text-red-400" />
            <AlertDescription className="text-red-300">
              {error}
            </AlertDescription>
          </Alert>
          <Button onClick={fetchCSVData} className="mt-4 bg-blue-600 hover:bg-blue-700">
            <RefreshCw className="h-4 w-4 mr-2" />
            Tekrar Dene
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-white">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-400" />
            CSV Önizleme
            <Badge variant="secondary" className="bg-blue-900 text-blue-300">
              {validation?.totalRows || 0} varyant
            </Badge>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchCSVData} className="border-gray-600">
              <RefreshCw className="h-4 w-4 mr-2" />
              Yenile
            </Button>
            <Button size="sm" onClick={downloadCSV} className="bg-green-600 hover:bg-green-700">
              <Download className="h-4 w-4 mr-2" />
              İndir
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {validation && (
          <div className="space-y-3">
            <Alert className={validation.isValid ? "border-green-600 bg-green-900/20" : "border-red-600 bg-red-900/20"}>
              {validation.isValid ? (
                <CheckCircle className="h-4 w-4 text-green-400" />
              ) : (
                <AlertCircle className="h-4 w-4 text-red-400" />
              )}
              <AlertDescription>
                {validation.isValid ? (
                  <div className="space-y-2">
                    <div className="font-medium text-green-300">Shopify import için hazır</div>
                    <div className="text-sm text-green-400 grid grid-cols-2 gap-2">
                      <span>✓ UTF-8 BOM: {validation.hasBOM ? 'Var' : 'Yok'}</span>
                      <span>✓ Header: {validation.hasHeader ? 'Tamam' : 'Eksik'}</span>
                      <span>✓ Varyant: {validation.totalRows}</span>
                      <span>✓ Format: Shopify CSV</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="font-medium text-red-300">CSV dosyasında hatalar var:</div>
                    <ul className="text-sm text-red-400 space-y-1">
                      {validation.errors.map((error, i) => (
                        <li key={i}>• {error}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </AlertDescription>
            </Alert>
            
            {validation.warnings.length > 0 && (
              <Alert className="border-yellow-600 bg-yellow-900/20">
                <AlertCircle className="h-4 w-4 text-yellow-400" />
                <AlertDescription>
                  <div className="font-medium text-yellow-300 mb-1">Uyarılar:</div>
                  <ul className="text-sm text-yellow-400 space-y-1">
                    {validation.warnings.map((warning, i) => (
                      <li key={i}>• {warning}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}
        
        <div className="bg-gray-900 rounded-lg overflow-hidden">
          <div className="p-3 bg-gray-800 border-b border-gray-700">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300 font-medium">Ürün Önizleme (İlk 7 varyant)</span>
              <Badge variant="outline" className="text-xs border-gray-600 text-gray-400">
                shopify-urunler.csv
              </Badge>
            </div>
          </div>
          
          <ScrollArea className="h-80">
            <Table>
              <TableHeader>
                <TableRow className="border-gray-700">
                  <TableHead className="text-gray-300">Handle</TableHead>
                  <TableHead className="text-gray-300">Başlık</TableHead>
                  <TableHead className="text-gray-300">Marka</TableHead>
                  <TableHead className="text-gray-300">Fiyat</TableHead>
                  <TableHead className="text-gray-300">Renk</TableHead>
                  <TableHead className="text-gray-300">Beden</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {csvData.map((row, index) => (
                  <TableRow key={index} className="border-gray-700 hover:bg-gray-800/50">
                    <TableCell className="font-mono text-xs text-blue-400 max-w-32 truncate">
                      {row.Handle || '-'}
                    </TableCell>
                    <TableCell className="text-gray-300 max-w-48 truncate">
                      {row.Title || '-'}
                    </TableCell>
                    <TableCell className="text-gray-400">
                      {row.Vendor || '-'}
                    </TableCell>
                    <TableCell className="font-semibold text-green-400">
                      {row['Variant Price'] || '-'} ₺
                    </TableCell>
                    <TableCell className="text-gray-400">
                      {row['Option1 Value'] || '-'}
                    </TableCell>
                    <TableCell className="text-gray-400">
                      {row['Option2 Value'] || '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
}