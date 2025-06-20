import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { 
  Brain, 
  ImageIcon, 
  Target, 
  Palette, 
  Sparkles,
  TrendingUp,
  MapPin,
  ShoppingCart,
  Tags,
  Star
} from 'lucide-react';

interface AIEnhancedProductDisplayProps {
  productData: any;
}

export function AIEnhancedProductDisplay({ productData }: AIEnhancedProductDisplayProps) {
  if (!productData?.success) {
    return null;
  }

  const {
    title,
    brand,
    price,
    description,
    images = [],
    colors = [],
    sizes = [],
    materials = [],
    features = [],
    category,
    subcategory,
    productType,
    targetAudience,
    season,
    shopifyData = {},
    aiMetrics = {},
    imageAnalysis = {},
    aiAnalysis = {},
    enhancedFeatures = {},
    colorDetails = {},
    priceAnalysis = {}
  } = productData;

  return (
    <div className="space-y-6">
      {/* AI Kalite Özeti */}
      <Card className="border-2 border-blue-200 bg-blue-50/50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-blue-900">
            <Brain className="h-5 w-5" />
            AI Destekli Ürün Analizi
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {(aiMetrics.dataQuality * 100).toFixed(0)}%
              </div>
              <div className="text-sm text-gray-600">Veri Kalitesi</div>
              <Progress value={aiMetrics.dataQuality * 100} className="mt-1" />
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {(aiMetrics.aiConfidence * 100).toFixed(0)}%
              </div>
              <div className="text-sm text-gray-600">AI Güveni</div>
              <Progress value={aiMetrics.aiConfidence * 100} className="mt-1" />
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {images.length}
              </div>
              <div className="text-sm text-gray-600">Toplam Görsel</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">
                {(aiMetrics.imageQualityScore * 100 / 3).toFixed(0)}%
              </div>
              <div className="text-sm text-gray-600">Görsel Kalitesi</div>
              <Progress value={(aiMetrics.imageQualityScore * 100 / 3)} className="mt-1" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Temel Ürün Bilgileri */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            AI Optimize Edilmiş Ürün Bilgileri
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="font-semibold text-lg mb-2">{title}</h3>
              <div className="space-y-2">
                <Badge variant="outline">{brand}</Badge>
                <Badge variant="secondary">{category}</Badge>
                <Badge variant="outline">{subcategory}</Badge>
              </div>
              <div className="mt-4">
                <span className="text-2xl font-bold text-green-600">{typeof price === 'object' ? price.formatted : price} TL</span>
              </div>
            </div>
            <div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  <span className="text-sm">Hedef Kitle: {targetAudience}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Tags className="h-4 w-4" />
                  <span className="text-sm">Ürün Tipi: {productType}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4" />
                  <span className="text-sm">Sezon: {season}</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AI Gelişmiş Analizler */}
      <Tabs defaultValue="images" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="images">Görseller</TabsTrigger>
          <TabsTrigger value="variants">Renkler</TabsTrigger>
          <TabsTrigger value="features">Özellikler</TabsTrigger>
        </TabsList>

        <TabsContent value="images">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5" />
                AI Destekli Görsel Analizi
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="text-center">
                  <div className="text-lg font-semibold">{imageAnalysis.totalImages || images.length}</div>
                  <div className="text-sm text-gray-600">Toplam Görsel</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-semibold">{imageAnalysis.highQualityImages || 0}</div>
                  <div className="text-sm text-gray-600">Yüksek Kalite</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-semibold">{Object.keys(imageAnalysis.variantImages || {}).length}</div>
                  <div className="text-sm text-gray-600">Renk Varyantı</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-semibold">{imageAnalysis.categorizedImages?.main?.length || 0}</div>
                  <div className="text-sm text-gray-600">Ana Görseller</div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 max-h-96 overflow-y-auto">
                {images.map((image: string, index: number) => (
                  <div key={index} className="aspect-square relative group">
                    <img 
                      src={image} 
                      alt={`Ürün görseli ${index + 1}`}
                      className="w-full h-full object-cover rounded-lg border transition-transform group-hover:scale-105"
                      loading="lazy"
                    />
                    <div className="absolute top-1 right-1 bg-black/50 text-white text-xs px-1 rounded">
                      {index + 1}
                    </div>
                  </div>
                ))}
              </div>
              
              {colorDetails.colorImageMap && Object.keys(colorDetails.colorImageMap).length > 0 && (
                <div className="mt-4">
                  <h5 className="font-medium mb-2">Renk Bazlı Görseller</h5>
                  <div className="space-y-3">
                    {Object.entries(colorDetails.colorImageMap).slice(0, 5).map(([color, colorImages]: [string, any]) => (
                      <div key={color} className="p-2 border rounded">
                        <div className="text-sm font-medium mb-1">{color}</div>
                        <div className="grid grid-cols-4 gap-1">
                          {colorImages.slice(0, 4).map((img: string, idx: number) => (
                            <img key={idx} src={img} alt={`${color} ${idx + 1}`} className="w-full aspect-square object-cover rounded" />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="variants">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-5 w-5" />
                AI Tespit Edilen Varyantlar
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-2">Renkler ({colors.length})</h4>
                  <div className="flex flex-wrap gap-2">
                    {colors.map((color: any, index: number) => (
                      <Badge key={index} variant="outline">
                        {typeof color === 'string' ? color : color?.name || `Renk ${index + 1}`}
                      </Badge>
                    ))}
                  </div>
                  
                  {colorDetails.colors && colorDetails.colors.length > 0 && (
                    <div className="mt-3">
                      <h5 className="font-medium mb-2">Detaylı Renk Bilgileri</h5>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {colorDetails.colors.map((colorInfo: any, index: number) => (
                          <div key={index} className={`p-3 rounded border ${colorInfo.available ? 'bg-green-50' : 'bg-red-50'}`}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                {colorInfo.hex && (
                                  <div 
                                    className="w-4 h-4 rounded border" 
                                    style={{ backgroundColor: colorInfo.hex }}
                                  ></div>
                                )}
                                <span className="font-medium">{colorInfo.name}</span>
                                {!colorInfo.available && (
                                  <span className="text-xs text-red-600">(Stokta Yok)</span>
                                )}
                              </div>
                              {colorInfo.price && (
                                <span className="text-sm font-bold text-green-600">{colorInfo.price} TL</span>
                              )}
                            </div>
                            {colorInfo.images && colorInfo.images.length > 0 && (
                              <div className="mt-2">
                                <div className="text-xs text-gray-500 mb-1">
                                  {colorInfo.images.length} görsel
                                </div>
                                <div className="grid grid-cols-3 gap-1">
                                  {colorInfo.images.slice(0, 3).map((img: string, imgIdx: number) => (
                                    <img 
                                      key={imgIdx} 
                                      src={img} 
                                      alt={`${colorInfo.name} ${imgIdx + 1}`} 
                                      className="w-full aspect-square object-cover rounded border"
                                      loading="lazy"
                                    />
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                
                <div>
                  <h4 className="font-semibold mb-2">Bedenler ({sizes.length})</h4>
                  <div className="flex flex-wrap gap-2">
                    {sizes.map((size: any, index: number) => (
                      <Badge key={index} variant="secondary">
                        {typeof size === 'string' ? size : size?.name || `Beden ${index + 1}`}
                      </Badge>
                    ))}
                  </div>
                </div>
                
                <div>
                  <h4 className="font-semibold mb-2">Özellikler</h4>
                  <div className="flex flex-wrap gap-2">
                    {features.slice(0, 10).map((feature: string, index: number) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {feature.length > 30 ? feature.substring(0, 30) + '...' : feature}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pricing">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                AI Varyant Fiyat Analizi
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {priceAnalysis.priceRange && (
                  <div>
                    <h4 className="font-semibold mb-3">Fiyat Aralığı</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="text-center p-3 bg-green-50 rounded-lg">
                        <div className="text-2xl font-bold text-green-600">
                          {priceAnalysis.priceRange.min} TL
                        </div>
                        <div className="text-sm text-gray-600">En Düşük</div>
                      </div>
                      <div className="text-center p-3 bg-red-50 rounded-lg">
                        <div className="text-2xl font-bold text-red-600">
                          {priceAnalysis.priceRange.max} TL
                        </div>
                        <div className="text-sm text-gray-600">En Yüksek</div>
                      </div>
                      <div className="text-center p-3 bg-blue-50 rounded-lg">
                        <div className="text-2xl font-bold text-blue-600">
                          {priceAnalysis.priceRange.difference} TL
                        </div>
                        <div className="text-sm text-gray-600">Fark</div>
                      </div>
                    </div>
                  </div>
                )}
                
                {priceAnalysis.colorPricing && Object.keys(priceAnalysis.colorPricing).length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-3">Renk Bazlı Fiyatlandırma</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {Object.entries(priceAnalysis.colorPricing).map(([color, price]: [string, any]) => (
                        <div key={color} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                          <span className="font-medium">{color}</span>
                          <span className="text-green-600 font-bold">{typeof price === 'object' ? price.formatted : price} TL</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {priceAnalysis.variants && priceAnalysis.variants.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-3">Detaylı Varyant Fiyatları</h4>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {priceAnalysis.variants.map((variant: any, index: number) => (
                        <div key={index} className={`p-3 rounded border ${variant.available ? 'bg-white' : 'bg-gray-100'}`}>
                          <div className="flex justify-between items-center">
                            <div>
                              <span className="font-medium">{variant.color}</span>
                              {variant.size && <span className="text-gray-500 ml-2">({variant.size})</span>}
                              {!variant.available && <span className="text-red-500 text-xs ml-2">(Stokta Yok)</span>}
                            </div>
                            <div className="text-right">
                              <div className="font-bold text-green-600">{variant.price} {variant.currency}</div>
                              {variant.originalPrice && variant.originalPrice > variant.price && (
                                <div className="text-sm text-gray-500 line-through">{variant.originalPrice} {variant.currency}</div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {priceAnalysis.aiAnalysis && (
                  <div>
                    <h4 className="font-semibold mb-3">AI Fiyatlandırma Stratejisi</h4>
                    <div className="p-4 bg-blue-50 rounded-lg">
                      <div className="mb-2">
                        <span className="font-medium">Strateji:</span> {priceAnalysis.aiAnalysis.strategy}
                      </div>
                      <div className="mb-2">
                        <span className="font-medium">Analiz:</span> {priceAnalysis.aiAnalysis.reasoning}
                      </div>
                      {priceAnalysis.aiAnalysis.recommendations && (
                        <div>
                          <span className="font-medium">Öneriler:</span>
                          <ul className="list-disc list-inside mt-1">
                            {priceAnalysis.aiAnalysis.recommendations.map((rec: string, idx: number) => (
                              <li key={idx} className="text-sm">{rec}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                <div>
                  <h4 className="font-semibold mb-2">Fiyatlandırma Stratejisi</h4>
                  <Badge variant="outline" className="text-lg px-3 py-1">
                    {priceAnalysis.pricingStrategy === 'color_based' && 'Renk Bazlı Fiyatlandırma'}
                    {priceAnalysis.pricingStrategy === 'size_based' && 'Beden Bazlı Fiyatlandırma'}
                    {priceAnalysis.pricingStrategy === 'complex' && 'Karmaşık Fiyatlandırma'}
                    {priceAnalysis.pricingStrategy === 'uniform' && 'Tekdüzen Fiyatlandırma'}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="features">
          <Card>
            <CardHeader>
              <CardTitle>AI Destekli Ürün Özellikleri</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {enhancedFeatures.basicFeatures && enhancedFeatures.basicFeatures.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-3">Temel Özellikler</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {enhancedFeatures.basicFeatures.slice(0, 10).map((feature: any, index: number) => (
                        <div key={index} className="p-2 bg-gray-50 rounded text-sm">
                          <span className="font-medium">{feature.name}:</span> {feature.value}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {enhancedFeatures.technicalSpecs && enhancedFeatures.technicalSpecs.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-3">Teknik Özellikler</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {enhancedFeatures.technicalSpecs.map((feature: any, index: number) => (
                        <div key={index} className="p-2 bg-blue-50 rounded text-sm">
                          <span className="font-medium">{feature.name}:</span> {feature.value}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {enhancedFeatures.careInstructions && enhancedFeatures.careInstructions.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-3">Bakım Talimatları</h4>
                    <div className="space-y-1">
                      {enhancedFeatures.careInstructions.map((feature: any, index: number) => (
                        <div key={index} className="p-2 bg-green-50 rounded text-sm">
                          <span className="font-medium">{feature.name}:</span> {feature.value}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {enhancedFeatures.sizeGuide && enhancedFeatures.sizeGuide.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-3">Beden Rehberi</h4>
                    <div className="space-y-1">
                      {enhancedFeatures.sizeGuide.map((feature: any, index: number) => (
                        <div key={index} className="p-2 bg-purple-50 rounded text-sm">
                          <span className="font-medium">{feature.name}:</span> {feature.value}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="materials">
          <Card>
            <CardHeader>
              <CardTitle>AI Tespit Edilen Malzemeler ve Özellikler</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-2">Malzemeler</h4>
                  <div className="flex flex-wrap gap-2">
                    {materials.map((material: string) => (
                      <Badge key={material} variant="outline">{material}</Badge>
                    ))}
                  </div>
                </div>
                
                {enhancedFeatures.materialInfo && enhancedFeatures.materialInfo.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2">AI Tespit Edilen Malzeme Bilgileri</h4>
                    <div className="space-y-2">
                      {enhancedFeatures.materialInfo.map((feature: any, index: number) => (
                        <div key={index} className="p-3 bg-orange-50 rounded-lg">
                          <div className="font-medium text-sm">{feature.name}</div>
                          <div className="text-sm text-gray-600">{feature.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {enhancedFeatures.structuredData && (
                  <div>
                    <h4 className="font-semibold mb-2">Yapılandırılmış Ürün Verisi</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {enhancedFeatures.structuredData.brand && (
                        <div><span className="font-medium">Marka:</span> {enhancedFeatures.structuredData.brand}</div>
                      )}
                      {enhancedFeatures.structuredData.model && (
                        <div><span className="font-medium">Model:</span> {enhancedFeatures.structuredData.model}</div>
                      )}
                      {enhancedFeatures.structuredData.weight && (
                        <div><span className="font-medium">Ağırlık:</span> {enhancedFeatures.structuredData.weight}</div>
                      )}
                      {enhancedFeatures.structuredData.origin && (
                        <div><span className="font-medium">Menşei:</span> {enhancedFeatures.structuredData.origin}</div>
                      )}
                    </div>
                  </div>
                )}
                
                <div>
                  <h4 className="font-semibold mb-2">AI Optimize Edilmiş Açıklama</h4>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {description?.substring(0, 300)}...
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="shopify">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                Shopify Optimizasyonu
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-2">SEO Optimizasyonu</h4>
                  <div className="space-y-2">
                    <div>
                      <span className="text-sm font-medium">SEO Başlık:</span>
                      <p className="text-sm text-gray-700">{shopifyData.seoTitle}</p>
                    </div>
                    <div>
                      <span className="text-sm font-medium">SEO Açıklama:</span>
                      <p className="text-sm text-gray-700">{shopifyData.seoDescription}</p>
                    </div>
                    <div>
                      <span className="text-sm font-medium">URL Handle:</span>
                      <p className="text-sm text-gray-700">{shopifyData.handle}</p>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h4 className="font-semibold mb-2">Shopify Etiketleri</h4>
                  <div className="flex flex-wrap gap-2">
                    {shopifyData.tags?.map((tag: string) => (
                      <Badge key={tag} variant="secondary">{tag}</Badge>
                    ))}
                  </div>
                </div>
                
                <div>
                  <h4 className="font-semibold mb-2">Anahtar Kelimeler</h4>
                  <div className="flex flex-wrap gap-2">
                    {shopifyData.keywords?.map((keyword: string) => (
                      <Badge key={keyword} variant="outline">{keyword}</Badge>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai-analysis">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                AI Kapsamlı Ürün Analizi
              </CardTitle>
            </CardHeader>
            <CardContent>
              {aiAnalysis ? (
                <div className="space-y-6">
                  {/* Satış Tahmini */}
                  {aiAnalysis.salesPrediction && (
                    <div>
                      <h4 className="font-semibold mb-3">Satış Tahmini</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="text-center p-3 bg-blue-50 rounded-lg">
                          <div className="text-2xl font-bold text-blue-600">
                            {aiAnalysis.salesPrediction.estimatedYearlySales?.toLocaleString()}
                          </div>
                          <div className="text-sm text-gray-600">Yıllık Satış Tahmini</div>
                        </div>
                        <div className="text-center p-3 bg-green-50 rounded-lg">
                          <div className="text-2xl font-bold text-green-600">
                            {aiAnalysis.salesPrediction.popularityScore}/10
                          </div>
                          <div className="text-sm text-gray-600">Popülerlik Skoru</div>
                        </div>
                        <div className="text-center p-3 bg-purple-50 rounded-lg">
                          <div className="text-2xl font-bold text-purple-600">
                            {aiAnalysis.salesPrediction.salesTrend}
                          </div>
                          <div className="text-sm text-gray-600">Satış Trendi</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Coğrafi Analiz */}
                  {aiAnalysis.geographicAnalysis && (
                    <div>
                      <h4 className="font-semibold mb-3 flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        Coğrafi Satış Dağılımı
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {aiAnalysis.geographicAnalysis.topSellingCities?.slice(0, 6).map((city: any) => (
                          <div key={city.city} className="p-2 bg-gray-50 rounded">
                            <div className="font-medium">{city.city}</div>
                            <div className="text-sm text-gray-600">{city.percentage}%</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Fiyat Analizi */}
                  {aiAnalysis.priceAnalysis && (
                    <div>
                      <h4 className="font-semibold mb-3">Fiyat Analizi</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="text-center">
                          <div className="text-lg font-semibold">{aiAnalysis.priceAnalysis.currentPrice} TL</div>
                          <div className="text-sm text-gray-600">Mevcut Fiyat</div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-semibold">{aiAnalysis.priceAnalysis.recommendedPrice} TL</div>
                          <div className="text-sm text-gray-600">Önerilen Fiyat</div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-semibold">{aiAnalysis.priceAnalysis.pricePosition}</div>
                          <div className="text-sm text-gray-600">Fiyat Konumu</div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-semibold">
                            {aiAnalysis.priceAnalysis.priceHistory?.length || 0}
                          </div>
                          <div className="text-sm text-gray-600">Ay Verisi</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center text-gray-500 py-8">
                  AI analizi yükleniyor...
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}