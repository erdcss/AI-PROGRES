import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Download, Package, Tag, Image as ImageIcon, DollarSign, FileText } from "lucide-react";
import { AIAnalysisDisplay } from "./AIAnalysisDisplay";
import { EnhancedAIAnalysisDisplay } from "./EnhancedAIAnalysisDisplay";
import { AIEnhancedProductDisplay } from "./AIEnhancedProductDisplay";

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
            <h2 className="text-xl font-bold text-white mb-2">{String(data.title || '')}</h2>
            <div className="flex items-center gap-4">
              <Badge variant="secondary" className="bg-blue-600 text-white">
                {String(data.brand || '')}
              </Badge>
              <span className="text-lg font-semibold text-green-400">{String(data.price || '')}</span>
            </div>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <h3 className="font-semibold text-gray-300 mb-2">Kategoriler</h3>
              <div className="flex flex-wrap gap-2">
                {data.categories?.map((category, index) => (
                  <Badge key={index} variant="outline" className="border-gray-600 text-gray-300">
                    {String(category)}
                  </Badge>
                )) || <span className="text-gray-500">Kategori bilgisi yok</span>}
              </div>
            </div>
            
            <div>
              <h3 className="font-semibold text-gray-300 mb-2">Özellikler</h3>
              <div className="space-y-1 text-sm text-gray-400">
                {Object.entries(data.attributes || {}).map(([key, value]) => (
                  <div key={key}>
                    <span className="font-medium">{String(key)}:</span> {String(value)}
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
                {data.variants.colors.map((color, index) => {
                  const colorName = typeof color === 'string' ? color : color?.name || `Renk ${index + 1}`;
                  return (
                  <div key={colorName} className="border border-gray-600 rounded-lg p-4 bg-gray-750">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <h4 className="font-semibold text-white">{String(colorName)}</h4>
                        <Badge variant="outline" className="border-purple-400 text-purple-400">
                          Model {index + 1}
                        </Badge>
                      </div>
                      {data.variants.pricing?.[colorName] && (
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-4 w-4 text-green-400" />
                          <span className="font-bold text-green-400">
                            {data.variants.pricing[colorName].toFixed(2)} TL
                          </span>
                        </div>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                      {data.variants.variantImages?.[colorName]?.slice(0, 6).map((image, imgIndex) => (
                        <div key={imgIndex} className="aspect-square bg-gray-700 rounded overflow-hidden border border-gray-500 hover:border-purple-400 transition-colors">
                          <img 
                            src={image} 
                            alt={`${colorName} renk görseli ${imgIndex + 1}`}
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
                            <span>{colorName} rengi için özel görseller analiz ediliyor...</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  );
                })}
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
          {data.variants?.colors && data.variants.colors.length > 0 ? data.variants.colors.map((color) => {
            const colorName = typeof color === 'string' ? color : color?.name || 'Renk';
            return (
            <div key={colorName} className="border border-gray-600 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-white">{String(colorName)}</h3>
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-green-400" />
                  <span className="font-bold text-green-400">
                    {data.variants.pricing?.[colorName]?.toFixed(2) || 'N/A'} TL
                  </span>
                </div>
              </div>
              
              <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
                {data.variants.variantImages?.[colorName]?.slice(0, 4).map((image, index) => (
                  <div key={index} className="aspect-square bg-gray-700 rounded overflow-hidden">
                    <img 
                      src={image} 
                      alt={`${colorName} varyantı ${index + 1}`}
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
            );
          }) : (
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
              <div className="text-2xl font-bold text-blue-400">{data.colors?.length || 0}</div>
              <div className="text-sm text-gray-400">Renk</div>
            </div>
            <div className="bg-gray-700 p-4 rounded-lg">
              <div className="text-2xl font-bold text-green-400">{data.sizes?.length || 1}</div>
              <div className="text-sm text-gray-400">Beden</div>
            </div>
            <div className="bg-gray-700 p-4 rounded-lg">
              <div className="text-2xl font-bold text-purple-400">{(data.colors?.length || 0) * (data.sizes?.length || 1)}</div>
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
      {/* Ürün Özellikleri */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Info className="h-5 w-5 text-blue-400" />
            Ürün Özellikleri ({data.features?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Ana özellikler */}
            {data.features && data.features.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-purple-400 mb-2">Genel Özellikler</h4>
                <div className="space-y-2">
                  {data.features.slice(0, 8).map((feature, index) => (
                    <div key={index} className="flex justify-between py-1.5 border-b border-gray-700">
                      <span className="text-gray-400 text-sm">{feature.key}:</span>
                      <span className="text-white text-sm">{feature.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Malzeme bilgileri */}
            {data.materials && data.materials.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-green-400 mb-2">Malzeme Bilgileri</h4>
                <div className="space-y-1">
                  {data.materials.map((material, index) => (
                    <div key={index} className="text-gray-300 text-sm bg-gray-700 p-2 rounded">
                      {material}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Bakım talimatları */}
            {data.careInstructions && data.careInstructions.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-yellow-400 mb-2">Bakım Talimatları</h4>
                <div className="space-y-1">
                  {data.careInstructions.map((instruction, index) => (
                    <div key={index} className="text-gray-300 text-sm bg-gray-700 p-2 rounded">
                      {instruction}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Teknik özellikler */}
            {data.specifications && data.specifications.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-orange-400 mb-2">Teknik Özellikler</h4>
                <div className="space-y-2">
                  {data.specifications.slice(0, 6).map((spec, index) => (
                    <div key={index} className="flex justify-between py-1.5 border-b border-gray-700">
                      <span className="text-gray-400 text-sm">{spec.key}:</span>
                      <span className="text-white text-sm">{spec.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {(!data.features || data.features.length === 0) && 
             (!data.materials || data.materials.length === 0) && 
             (!data.specifications || data.specifications.length === 0) && (
              <div className="text-center text-gray-500 py-8">
                <Info className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <div>Ürün özellikleri yükleniyor...</div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* AI Analysis Section */}
      {data.aiAnalysis && (
        <>
          {/* Enhanced AI Analysis if available */}
          {data.aiAnalysis.subcategory ? (
            <EnhancedAIAnalysisDisplay analysis={data.aiAnalysis} />
          ) : (
            <AIAnalysisDisplay analysis={data.aiAnalysis} />
          )}
        </>
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
                {(data.sizes || ['XS', 'S', 'M']).slice(0, 3).map((size: any, index: number) => (
                  <tr key={index} className="bg-gray-800">
                    <td className="border border-gray-600 p-1 text-gray-300">{String(data.title || '').substring(0, 30)}...</td>
                    <td className="border border-gray-600 p-1 text-blue-400">{String(data.brand || '')}</td>
                    <td className="border border-gray-600 p-1 text-green-400">{(parseFloat(data.price || '0') * 1.1).toFixed(2)} TL</td>
                    <td className="border border-gray-600 p-1 text-yellow-400">{
                      typeof size === 'string' ? size : size?.name || `Beden ${index + 1}`
                    }</td>
                    <td className="border border-gray-600 p-1 text-purple-400">{
                      data.colors?.[0] ? 
                        (typeof data.colors[0] === 'string' ? data.colors[0] : data.colors[0]?.name || 'Renk 1') : 
                        'Tek Renk'
                    }</td>
                    <td className="border border-gray-600 p-1 text-gray-400">✓</td>
                  </tr>
                ))}
                {(data.sizes || []).length > 3 && (
                  <tr className="bg-gray-900">
                    <td colSpan={6} className="border border-gray-600 p-1 text-center text-gray-400">
                      +{(data.sizes || []).length - 3} daha fazla varyant
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
            Shopify CSV İndir ({(data.sizes || []).length || 0} varyant)
          </Button>
        </CardContent>
      </Card>

    </div>
  );
}