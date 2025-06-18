import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Download, Trash2, Plus, FileText } from "lucide-react";

interface AutoProduct {
  url: string;
  title: string;
  variants: number;
  addedAt: string;
}

export default function AutoCSVPage() {
  const [products, setProducts] = useState<AutoProduct[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchAutoProducts();
    const interval = setInterval(fetchAutoProducts, 2000);
    return () => clearInterval(interval);
  }, []);

  const fetchAutoProducts = async () => {
    try {
      const response = await fetch('/api/auto-add-state');
      const data = await response.json();
      setProducts(data.products || []);
    } catch (error) {
      console.error('Ürün listesi alınamadı:', error);
    }
  };

  const generateCSV = async () => {
    if (products.length === 0) {
      toast({
        title: "Hata",
        description: "CSV oluşturmak için en az bir ürün gerekli",
        variant: "destructive"
      });
      return;
    }

    setIsGenerating(true);
    
    try {
      const response = await fetch('/api/auto-add-generate-csv', {
        method: 'POST'
      });

      const data = await response.json();
      
      if (data.success && data.filename) {
        // Download the CSV
        const downloadResponse = await fetch(`/api/download/${data.filename}`);
        if (!downloadResponse.ok) throw new Error('İndirme hatası');
        
        const blob = await downloadResponse.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        toast({
          title: "Başarılı",
          description: `${data.totalVariants} varyant ile CSV oluşturuldu`,
        });
      } else {
        throw new Error(data.message || 'CSV oluşturulamadı');
      }
      
    } catch (error: any) {
      toast({
        title: "Hata",
        description: error.message || "CSV oluşturma hatası",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const clearProducts = async () => {
    try {
      const response = await fetch('/api/auto-add-clear', {
        method: 'POST'
      });

      if (response.ok) {
        setProducts([]);
        toast({
          title: "Temizlendi",
          description: "Tüm ürünler listeden kaldırıldı"
        });
      }
    } catch (error) {
      toast({
        title: "Hata",
        description: "Ürünler temizlenemedi",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="min-h-screen bg-black text-white p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Header */}
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <FileText className="h-6 w-6 text-green-400" />
              Otomatik CSV Oluşturucu
            </CardTitle>
            <p className="text-gray-400">
              Scraper sayfasında "Otomatik Ekle" seçeneğini aktif ederek ürünleri bu listeye ekleyin
            </p>
          </CardHeader>
        </Card>

        {/* Actions */}
        <div className="flex gap-4">
          <Button 
            onClick={generateCSV} 
            disabled={isGenerating || products.length === 0}
            className="bg-green-600 hover:bg-green-700"
          >
            <Download className="h-4 w-4 mr-2" />
            {isGenerating ? "Oluşturuluyor..." : "CSV İndir"}
          </Button>
          
          <Button 
            onClick={clearProducts}
            disabled={products.length === 0}
            variant="destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Listeyi Temizle
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="bg-gray-800 border-gray-700">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-blue-400">
                {products.length}
              </div>
              <div className="text-sm text-gray-400">Ürün</div>
            </CardContent>
          </Card>
          
          <Card className="bg-gray-800 border-gray-700">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-green-400">
                {products.reduce((sum, p) => sum + p.variants, 0)}
              </div>
              <div className="text-sm text-gray-400">Varyant</div>
            </CardContent>
          </Card>
          
          <Card className="bg-gray-800 border-gray-700">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-purple-400">
                {products.length > 0 ? 'Hazır' : 'Boş'}
              </div>
              <div className="text-sm text-gray-400">Durum</div>
            </CardContent>
          </Card>
        </div>

        {/* Product List */}
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white">Ürün Listesi</CardTitle>
          </CardHeader>
          <CardContent>
            {products.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Plus className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Henüz ürün eklenmemiş</p>
                <p className="text-sm">Scraper sayfasında "Otomatik Ekle" seçeneğini kullanın</p>
              </div>
            ) : (
              <div className="space-y-3">
                {products.map((product, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-700 rounded">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white truncate">
                        {product.title}
                      </div>
                      <div className="text-xs text-gray-400 truncate">
                        {product.url}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <Badge variant="secondary">
                        {product.variants} varyant
                      </Badge>
                      <div className="text-xs text-gray-400">
                        {new Date(product.addedAt).toLocaleTimeString('tr-TR')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}