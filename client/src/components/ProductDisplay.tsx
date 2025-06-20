import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Download, Package, Tag, Image as ImageIcon, DollarSign, FileText } from "lucide-react";
import { AIAnalysisDisplay } from "./AIAnalysisDisplay";

interface ProductDisplayProps {
  data: {
    title: string;
    brand: string;
    price: string;
    description: string;
    images: string[];
    variants: {
      colors: string[];
      sizes: string[];
      variantImages: Record<string, string[]>;
      pricing: Record<string, number>;
      allVariants: Array<{
        color: string;
        size: string;
        sku: string;
        price: number;
        shopifyPrice: string;
        images: string[];
      }>;
      totalVariants: number;
    };
    attributes: Record<string, string>;
    categories: string[];
    tags: string[];
    preview: {
      csvPath: string;
      filename: string;
      totalRows: number;
      shopifyReady: boolean;
    };
    aiAnalysis?: any;
  };
}

export function ProductDisplay({ data }: ProductDisplayProps) {
  const handleDownloadCSV = async () => {
    try {
      const response = await fetch('/shopify-urunler.csv');
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `shopify-${data.brand?.toLowerCase()}-${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error('CSV download error:', error);
    }
  };

  return (
    <div className="space-y-6 p-6 bg-gray-900 text-white">
      {/* AI Destekli Ürün Gösterimi */}
      <AIEnhancedProductDisplay productData={data} />
      {/* Ana Ürün Bilgileri */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Package className="h-5 w-5 text-blue-400" />
            Ürün Bilgileri
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h2 className="text-xl font-bold text-white mb-2">{data.title}</h2>
            <div className="flex items-center gap-4">
              <Badge variant="secondary" className="bg-blue-600 text-white">
                {data.brand}
              </Badge>
              <span className="text-lg font-semibold text-green-400">{data.price}</span>
            </div>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <h3 className="font-semibold text-gray-300 mb-2">Kategoriler</h3>
              <div className="flex flex-wrap gap-2">
                {data.categories?.map((category, index) => (
                  <Badge key={index} variant="outline" className="border-gray-600 text-gray-300">
                    {category}
                  </Badge>
                )) || <span className="text-gray-500">Kategori bilgisi yok</span>}
              </div>
            </div>
            
            <div>
              <h3 className="font-semibold text-gray-300 mb-2">Özellikler</h3>
              <div className="space-y-1 text-sm text-gray-400">
                {Object.entries(data.attributes || {}).map(([key, value]) => (
                  <div key={key}>
                    <span className="font-medium">{key}:</span> {value}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ürün Görselleri ve Renk Modelleri */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <ImageIcon className="h-5 w-5 text-purple-400" />
            Ürün Görselleri ve Modelleri ({data.images?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Ana Ürün Görselleri */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-3">Ana Ürün Görselleri</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {data.images && data.images.length > 0 ? data.images.slice(0, 12).map((image, index) => (
                <div key={index} className="aspect-square bg-gray-700 rounded-lg overflow-hidden border border-gray-600 hover:border-purple-400 transition-colors">
                  <img 
                    src={image} 
                    alt={`Ürün görseli ${index + 1}`}
                    className="w-full h-full object-cover hover:scale-105 transition-transform cursor-pointer"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>
              )) : (
                <div className="col-span-full text-center text-gray-500 py-8">
                  Görseller yükleniyor...
                </div>
              )}
            </div>
          </div>

          {/* Renk Varyantları ve Modelleri */}
          {data.variants?.colors && data.variants.colors.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-white mb-3">Renk Varyantları ({data.variants.colors.length})</h3>
              <div className="space-y-4">
                {data.variants.colors.map((color, index) => (
                  <div key={color} className="border border-gray-600 rounded-lg p-4 bg-gray-750">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <h4 className="font-semibold text-white">{color}</h4>
                        <Badge variant="outline" className="border-purple-400 text-purple-400">
                          Model {index + 1}
                        </Badge>
                      </div>
                      {data.variants.pricing?.[color] && (
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-4 w-4 text-green-400" />
                          <span className="font-bold text-green-400">
                            {data.variants.pricing[color].toFixed(2)} TL
                          </span>
                        </div>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                      {data.variants.variantImages?.[color]?.slice(0, 6).map((image, imgIndex) => (
                        <div key={imgIndex} className="aspect-square bg-gray-700 rounded overflow-hidden border border-gray-500 hover:border-purple-400 transition-colors">
                          <img 
                            src={image} 
                            alt={`${color} renk görseli ${imgIndex + 1}`}
                            className="w-full h-full object-cover hover:scale-105 transition-transform cursor-pointer"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        </div>
                      )) || (
                        <div className="col-span-full text-center text-gray-400 py-2 text-sm bg-gray-800 rounded">
                          <div className="flex items-center justify-center gap-2">
                            <ImageIcon className="h-4 w-4" />
                            <span>{color} rengi için özel görseller analiz ediliyor...</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Renk Varyantları */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Tag className="h-5 w-5 text-green-400" />
            Renk Varyantları ({data.variants?.colors?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.variants?.colors && data.variants.colors.length > 0 ? data.variants.colors.map((color) => (
            <div key={color} className="border border-gray-600 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-white">{color}</h3>
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-green-400" />
                  <span className="font-bold text-green-400">
                    {data.variants.pricing?.[color]?.toFixed(2) || 'N/A'} TL
                  </span>
                </div>
              </div>
              
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                {data.variants.variantImages?.[color]?.map((image, index) => (
                  <div key={index} className="aspect-square bg-gray-700 rounded overflow-hidden">
                    <img 
                      src={image} 
                      alt={`${color} varyantı ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )) || (
                  <div className="col-span-full text-sm text-gray-500 py-2">
                    Bu renk için görsel bulunamadı
                  </div>
                )}
              </div>
            </div>
          )) : (
            <div className="text-center text-gray-500 py-8">
              Renk varyantı bulunamadı
            </div>
          )}
        </CardContent>
      </Card>

      {/* Varyant Özeti */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Package className="h-5 w-5 text-orange-400" />
            Varyant Özeti
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div className="bg-gray-700 p-4 rounded-lg">
              <div className="text-2xl font-bold text-blue-400">{data.variants.colors.length}</div>
              <div className="text-sm text-gray-400">Renk</div>
            </div>
            <div className="bg-gray-700 p-4 rounded-lg">
              <div className="text-2xl font-bold text-green-400">{data.variants.sizes.length || 1}</div>
              <div className="text-sm text-gray-400">Beden</div>
            </div>
            <div className="bg-gray-700 p-4 rounded-lg">
              <div className="text-2xl font-bold text-purple-400">{data.variants.totalVariants}</div>
              <div className="text-sm text-gray-400">Toplam Varyant</div>
            </div>
            <div className="bg-gray-700 p-4 rounded-lg">
              <div className="text-2xl font-bold text-orange-400">{data.preview?.totalRows || 0}</div>
              <div className="text-sm text-gray-400">CSV Satırı</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ürün Özellikleri */}
      {data.features && data.features.length > 0 && (
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <FileText className="h-5 w-5 text-green-400" />
              Ürün Özellikleri
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {data.features.slice(0, 12).map((feature: any, index: number) => (
                <div key={index} className="flex justify-between p-2 bg-gray-900 rounded">
                  <span className="text-gray-400 text-sm">{feature.key}</span>
                  <span className="text-white text-sm font-medium">{feature.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Analysis Section */}
      {data.aiAnalysis && (
        <AIAnalysisDisplay analysis={data.aiAnalysis} />
      )}

      {/* CSV Önizleme ve İndirme */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Download className="h-5 w-5 text-green-400" />
            CSV Dışa Aktarım
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* CSV Preview Table */}
          <div className="mb-4 overflow-x-auto">
            <table className="w-full text-xs border border-gray-600">
              <thead>
                <tr className="bg-gray-700">
                  <th className="border border-gray-600 p-1 text-left">Başlık</th>
                  <th className="border border-gray-600 p-1 text-left">Marka</th>
                  <th className="border border-gray-600 p-1 text-left">Fiyat</th>
                  <th className="border border-gray-600 p-1 text-left">Beden</th>
                  <th className="border border-gray-600 p-1 text-left">Renk</th>
                  <th className="border border-gray-600 p-1 text-left">Görsel</th>
                </tr>
              </thead>
              <tbody>
                {data.variants?.sizes?.slice(0, 3).map((size: string, index: number) => (
                  <tr key={index} className="bg-gray-800">
                    <td className="border border-gray-600 p-1 text-gray-300">{data.title?.substring(0, 30)}...</td>
                    <td className="border border-gray-600 p-1 text-blue-400">{data.brand}</td>
                    <td className="border border-gray-600 p-1 text-green-400">{(parseFloat(data.price || '0') * 1.1).toFixed(2)} TL</td>
                    <td className="border border-gray-600 p-1 text-yellow-400">{size}</td>
                    <td className="border border-gray-600 p-1 text-purple-400">{data.variants?.colors?.[0] || 'Tek Renk'}</td>
                    <td className="border border-gray-600 p-1 text-gray-400">✓</td>
                  </tr>
                ))}
                {data.variants?.sizes?.length > 3 && (
                  <tr className="bg-gray-900">
                    <td colSpan={6} className="border border-gray-600 p-1 text-center text-gray-400">
                      +{data.variants.sizes.length - 3} daha fazla varyant
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          
          {/* Download Button */}
          <Button 
            onClick={handleDownloadCSV} 
            className="w-full bg-green-600 hover:bg-green-700 text-white"
          >
            <Download className="h-4 w-4 mr-2" />
            Shopify CSV İndir ({data.variants?.sizes?.length || 0} varyant)
          </Button>
        </CardContent>
      </Card>

    </div>
  );
}