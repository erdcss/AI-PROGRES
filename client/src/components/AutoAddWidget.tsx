import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Plus, List, Download, Trash2, Loader2 } from "lucide-react";

interface AutoAddState {
  products: any[];
  hasProducts: boolean;
  totalVariants: number;
  totalProcessed: number;
  productSummary: Array<{
    title: string;
    url: string;
    variants: number;
    colors: number;
    sizes: number;
  }>;
}

export function AutoAddWidget() {
  const [enabled, setEnabled] = useState(false);
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [state, setState] = useState<AutoAddState | null>(null);
  const { toast } = useToast();

  const fetchState = async () => {
    try {
      const response = await fetch('/api/auto-add-state');
      const data = await response.json();
      setState(data);
    } catch (error) {
      console.error('State fetch error:', error);
    }
  };

  const addProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!url.trim()) {
      toast({
        title: "Hata",
        description: "URL gerekli",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    
    try {
      const response = await fetch('/api/auto-add-product', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
      });

      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Eklendi",
          description: `${data.product.title} - ${data.product.variants} varyant`
        });
        setUrl('');
        fetchState();
      } else {
        throw new Error(data.message);
      }
    } catch (error: any) {
      toast({
        title: "Hata",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const clearProducts = async () => {
    try {
      const response = await fetch('/api/auto-add-clear', { method: 'POST' });
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Temizlendi",
          description: data.message
        });
        fetchState();
      }
    } catch (error: any) {
      toast({
        title: "Hata",
        description: "Temizleme hatası",
        variant: "destructive"
      });
    }
  };

  const downloadCSV = async () => {
    try {
      const response = await fetch('/api/auto-add-generate-csv', { method: 'POST' });
      const data = await response.json();
      
      if (data.success && data.filename) {
        const downloadResponse = await fetch(`/api/download/${data.filename}`);
        
        if (downloadResponse.ok) {
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
            title: "İndirildi",
            description: `${data.totalProducts} ürün, ${data.totalVariants} varyant`
          });
        }
      } else {
        throw new Error(data.message || 'CSV oluşturulamadı');
      }
    } catch (error: any) {
      toast({
        title: "Hata",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  useEffect(() => {
    if (enabled) {
      fetchState();
      const interval = setInterval(fetchState, 5000);
      return () => clearInterval(interval);
    }
  }, [enabled]);

  if (!enabled) {
    return (
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-white">
            <span>Otomatik Ürün Ekleme</span>
            <div className="flex items-center space-x-2">
              <Label htmlFor="auto-add" className="text-sm text-gray-300">Aktif Et</Label>
              <Switch
                id="auto-add"
                checked={enabled}
                onCheckedChange={setEnabled}
              />
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-400 text-sm">
            Otomatik ürün ekleme modunu aktif ederek ürünleri anında CSV listesine ekleyebilirsiniz.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Add Product Form */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-white">
            <span>Otomatik Ürün Ekleme</span>
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={addProduct} className="space-y-4">
            <Input
              type="url"
              placeholder="https://www.trendyol.com/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="bg-gray-700 border-gray-600 text-white"
              disabled={isLoading}
            />
            <Button 
              type="submit" 
              disabled={isLoading} 
              className="w-full bg-green-600 hover:bg-green-700"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Ekleniyor...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Otomatik Ekle
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Products List */}
      {state && (
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-white">
              <span className="flex items-center gap-2">
                <List className="h-5 w-5" />
                Eklenen Ürünler
              </span>
              <div className="flex gap-2">
                <Button
                  onClick={downloadCSV}
                  disabled={!state.hasProducts}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Download className="h-4 w-4 mr-1" />
                  CSV İndir
                </Button>
                <Button
                  onClick={clearProducts}
                  disabled={!state.hasProducts}
                  size="sm"
                  variant="destructive"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Temizle
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="bg-gray-700 p-3 rounded text-center">
                <div className="text-2xl font-bold text-white">{state.products?.length || 0}</div>
                <div className="text-xs text-gray-400">Ürün</div>
              </div>
              <div className="bg-gray-700 p-3 rounded text-center">
                <div className="text-2xl font-bold text-white">{state.totalVariants || 0}</div>
                <div className="text-xs text-gray-400">Varyant</div>
              </div>
              <div className="bg-gray-700 p-3 rounded text-center">
                <div className="text-2xl font-bold text-white">{state.totalProcessed || 0}</div>
                <div className="text-xs text-gray-400">İşlenen</div>
              </div>
            </div>
            
            {state.productSummary && state.productSummary.length > 0 ? (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {state.productSummary.map((product, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-gray-700 rounded">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white truncate">{product.title}</div>
                      <div className="text-xs text-gray-400 truncate">{product.url}</div>
                    </div>
                    <div className="flex gap-1 ml-2">
                      <Badge variant="secondary" className="text-xs">
                        {product.variants}v
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {product.colors}r
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {product.sizes}b
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-gray-400 py-8">
                Henüz ürün eklenmedi. Yukarıdaki form ile ürün eklemeye başlayın.
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}