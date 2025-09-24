import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  Package, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Palette,
  Ruler,
  DollarSign,
  ShoppingCart
} from "lucide-react";

interface Variant {
  color?: string;
  size?: string;
  inStock?: boolean;
  price?: number;
  sku?: string;
  inventory?: number;
}

interface VariantDisplayProps {
  variants: Variant[];
  title?: string;
  showPricing?: boolean;
  showInventory?: boolean;
}

const StockIcon = ({ inStock }: { inStock?: boolean }) => {
  if (inStock === undefined) return <AlertCircle className="w-4 h-4 text-gray-400" />;
  return inStock ? 
    <CheckCircle className="w-4 h-4 text-green-500" /> : 
    <XCircle className="w-4 h-4 text-red-500" />;
};

const StockBadge = ({ inStock }: { inStock?: boolean }) => {
  if (inStock === undefined) {
    return <Badge variant="secondary" className="text-xs">Bilinmiyor</Badge>;
  }
  return (
    <Badge 
      variant={inStock ? "default" : "destructive"} 
      className="text-xs"
    >
      {inStock ? "Stokta" : "Tükendi"}
    </Badge>
  );
};

export function VariantDisplay({ 
  variants = [], 
  title = "Ürün Varyantları",
  showPricing = true,
  showInventory = true 
}: VariantDisplayProps) {
  
  if (!variants || variants.length === 0) {
    return (
      <Card className="bg-gray-900/50 border-gray-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-400" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-400">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Varyant bilgisi bulunamadı</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Varyant istatistikleri
  const totalVariants = variants.length;
  const inStockVariants = variants.filter(v => v.inStock === true).length;
  const outOfStockVariants = variants.filter(v => v.inStock === false).length;
  const unknownStockVariants = variants.filter(v => v.inStock === undefined).length;
  
  // Benzersiz renkler ve bedenler
  const uniqueColors = [...new Set(variants.map(v => v.color).filter(Boolean))];
  const uniqueSizes = [...new Set(variants.map(v => v.size).filter(Boolean))];

  return (
    <Card className="bg-gray-900/50 border-gray-700">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Package className="w-5 h-5 text-blue-400" />
          {title}
          <Badge variant="outline" className="ml-auto text-xs">
            {totalVariants} varyant
          </Badge>
        </CardTitle>
        
        {/* Varyant özeti */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
          <div className="flex items-center gap-2 text-sm">
            <Palette className="w-4 h-4 text-purple-400" />
            <span className="text-gray-400">Renkler:</span>
            <span className="text-white font-medium">{uniqueColors.length}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Ruler className="w-4 h-4 text-green-400" />
            <span className="text-gray-400">Bedenler:</span>
            <span className="text-white font-medium">{uniqueSizes.length}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <span className="text-gray-400">Stokta:</span>
            <span className="text-green-400 font-medium">{inStockVariants}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <XCircle className="w-4 h-4 text-red-500" />
            <span className="text-gray-400">Tükenen:</span>
            <span className="text-red-400 font-medium">{outOfStockVariants}</span>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        <Separator className="mb-4" />
        
        {/* Renk listesi */}
        {uniqueColors.length > 0 && (
          <div className="mb-4">
            <h4 className="text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
              <Palette className="w-4 h-4 text-purple-400" />
              Mevcut Renkler ({uniqueColors.length})
            </h4>
            <div className="flex flex-wrap gap-2">
              {uniqueColors.map((color, index) => (
                <Badge key={index} variant="secondary" className="text-xs">
                  {color}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Beden listesi */}
        {uniqueSizes.length > 0 && (
          <div className="mb-4">
            <h4 className="text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
              <Ruler className="w-4 h-4 text-green-400" />
              Mevcut Bedenler ({uniqueSizes.length})
            </h4>
            <div className="flex flex-wrap gap-2">
              {uniqueSizes.map((size, index) => {
                // Check if this size has any out-of-stock variants
                const hasOutOfStockVariant = variants.some(v => v.size === size && v.inStock === false);
                const hasInStockVariant = variants.some(v => v.size === size && v.inStock !== false);
                
                return (
                  <Badge 
                    key={index} 
                    variant={hasOutOfStockVariant && !hasInStockVariant ? "secondary" : "outline"} 
                    className={`text-xs ${hasOutOfStockVariant && !hasInStockVariant ? 'line-through opacity-60' : ''}`}
                  >
                    {size}
                    {hasOutOfStockVariant && !hasInStockVariant && (
                      <span className="ml-1 text-red-400">✗</span>
                    )}
                  </Badge>
                );
              })}
            </div>
          </div>
        )}

        <Separator className="my-4" />

        {/* Detaylı varyant listesi */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-blue-400" />
            Tüm Varyantlar ({totalVariants})
          </h4>
          
          <ScrollArea className="h-64">
            <div className="space-y-2 pr-4">
              {variants.map((variant, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50 hover:border-gray-600 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <StockIcon inStock={variant.inStock} />
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          {variant.color && (
                            <span className={`text-sm font-medium ${variant.inStock === false ? 'text-purple-400/60 line-through' : 'text-purple-300'}`}>
                              {variant.color}
                            </span>
                          )}
                          {variant.size && (
                            <span className={`text-sm ${variant.inStock === false ? 'text-green-400/60 line-through' : 'text-green-300'}`}>
                              {variant.size}
                            </span>
                          )}
                          {variant.sku && (
                            <span className="text-xs text-gray-500">
                              SKU: {variant.sku}
                            </span>
                          )}
                        </div>
                        {showInventory && variant.inventory && (
                          <div className="text-xs text-gray-400">
                            Stok: {variant.inventory} adet
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {showPricing && variant.price && (
                        <div className="flex items-center gap-1 text-sm">
                          <DollarSign className="w-3 h-3 text-yellow-400" />
                          <span className="text-yellow-300 font-medium">
                            {variant.price.toFixed(2)} TL
                          </span>
                        </div>
                      )}
                      <StockBadge inStock={variant.inStock} />
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
}

export default VariantDisplay;