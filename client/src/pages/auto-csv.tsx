import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Download, FileText, Package, CheckCircle, XCircle, Upload } from "lucide-react";

export default function AutoCSVPage() {
  const [urls, setUrls] = useState("");
  const [filename, setFilename] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();

  const processUrls = async () => {
    const urlList = urls.split('\n').filter(url => url.trim().length > 0);
    
    if (urlList.length === 0) {
      toast({
        title: "Hata",
        description: "En az bir URL girmelisiniz",
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    
    try {
      const response = await fetch('/api/auto-csv', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          urls: urlList,
          filename: filename || undefined,
          batchSize: 3
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        setResults(data);
        setProgress(100);
        toast({
          title: "Başarılı",
          description: `${data.totalProducts} ürün işlendi, ${data.totalVariants} varyant oluşturuldu`,
        });
      } else {
        throw new Error(data.message || 'İşlem başarısız');
      }
      
    } catch (error: any) {
      toast({
        title: "Hata",
        description: error.message || "İşlem sırasında hata oluştu",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadCSV = async () => {
    if (!results?.filename) return;
    
    try {
      const response = await fetch(`/api/download/${results.filename}`);
      if (!response.ok) throw new Error('İndirme hatası');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = results.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "İndirildi",
        description: "CSV dosyası başarıyla indirildi"
      });
    } catch (error) {
      toast({
        title: "Hata",
        description: "Dosya indirilemedi",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="min-h-screen bg-black text-white p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Upload className="h-6 w-6 text-blue-400" />
              Otomatik CSV Oluşturucu
            </CardTitle>
            <p className="text-gray-400">
              Birden fazla Trendyol ürününü otomatik olarak işleyip tek CSV dosyasında birleştirin
            </p>
          </CardHeader>
        </Card>

        {/* Input Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader>
              <CardTitle className="text-white">Ürün URL Listesi</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="urls" className="text-gray-300">
                  Trendyol Ürün URL'leri (Her satıra bir URL)
                </Label>
                <Textarea
                  id="urls"
                  value={urls}
                  onChange={(e) => setUrls(e.target.value)}
                  placeholder="https://www.trendyol.com/hakke/bel-lastikli-yarasa-kol-keten-elbise-p-790728343
https://www.trendyol.com/marka/urun-adi-p-123456
https://www.trendyol.com/..."
                  className="min-h-[200px] bg-gray-700 border-gray-600 text-white"
                  disabled={isProcessing}
                />
              </div>
              
              <div>
                <Label htmlFor="filename" className="text-gray-300">
                  CSV Dosya Adı (Opsiyonel)
                </Label>
                <Input
                  id="filename"
                  value={filename}
                  onChange={(e) => setFilename(e.target.value)}
                  placeholder="my-products-export.csv"
                  className="bg-gray-700 border-gray-600 text-white"
                  disabled={isProcessing}
                />
              </div>
              
              <Button 
                onClick={processUrls} 
                disabled={isProcessing || !urls.trim()}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                {isProcessing ? "İşleniyor..." : "CSV Oluştur"}
              </Button>
            </CardContent>
          </Card>

          {/* Progress Section */}
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader>
              <CardTitle className="text-white">İşlem Durumu</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isProcessing && (
                <div className="space-y-2">
                  <Progress value={progress} className="w-full" />
                  <p className="text-sm text-gray-400 text-center">
                    Ürünler işleniyor...
                  </p>
                </div>
              )}
              
              {results && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-green-900/20 p-3 rounded border border-green-800">
                      <div className="text-lg font-bold text-green-400">
                        {results.summary.successful}
                      </div>
                      <div className="text-xs text-green-300">Başarılı</div>
                    </div>
                    <div className="bg-red-900/20 p-3 rounded border border-red-800">
                      <div className="text-lg font-bold text-red-400">
                        {results.summary.failed}
                      </div>
                      <div className="text-xs text-red-300">Başarısız</div>
                    </div>
                  </div>
                  
                  <div className="bg-gray-700 p-3 rounded">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <span className="text-gray-400">Toplam Ürün:</span>
                      <span className="text-white">{results.totalProducts}</span>
                      <span className="text-gray-400">Toplam Varyant:</span>
                      <span className="text-white">{results.totalVariants}</span>
                      <span className="text-gray-400">CSV Satırı:</span>
                      <span className="text-white">{results.totalRows}</span>
                    </div>
                  </div>
                  
                  <Button 
                    onClick={downloadCSV}
                    className="w-full bg-green-600 hover:bg-green-700"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    CSV İndir
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Results Section */}
        {results?.results && (
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader>
              <CardTitle className="text-white">İşlem Detayları</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {results.results.map((result: any, index: number) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-700 rounded">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {result.success ? (
                        <CheckCircle className="h-4 w-4 text-green-400 flex-shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-white truncate">
                          {result.title}
                        </div>
                        <div className="text-xs text-gray-400 truncate">
                          {result.url}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {result.success ? (
                        <Badge variant="secondary" className="bg-green-900 text-green-300">
                          {result.variants} varyant
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="text-xs">
                          {result.error}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}