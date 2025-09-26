import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Edit3, DollarSign, AlertCircle, Check } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { normalizePrice, formatOriginalPrice, formatSalePrice, validatePriceInput, calculatePriceWithCustomMargin, type StandardPrice } from '@/utils/price-utils';

interface PriceEditorProps {
  currentPrice: StandardPrice;
  productTitle?: string;
  onPriceUpdate: (newPrice: StandardPrice) => void;
  className?: string;
}

export function PriceEditor({ currentPrice, productTitle, onPriceUpdate, className }: PriceEditorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [originalPriceInput, setOriginalPriceInput] = useState(currentPrice.original.toString());
  const [profitMarginInput, setProfitMarginInput] = useState((currentPrice.profitPercentage / 100).toString());
  const [errors, setErrors] = useState<{ originalPrice?: string; profitMargin?: string }>({});
  const [previewPrice, setPreviewPrice] = useState<StandardPrice | null>(null);

  // Calculate preview price when inputs change
  const updatePreview = (originalInput: string, marginInput: string) => {
    const originalValidation = validatePriceInput(originalInput);
    const marginValue = parseFloat(marginInput);

    if (originalValidation.isValid && !isNaN(marginValue) && marginValue >= 0 && marginValue <= 1) {
      const preview = calculatePriceWithCustomMargin(originalValidation.value!, marginValue);
      setPreviewPrice(preview);
    } else {
      setPreviewPrice(null);
    }
  };

  const handleOriginalPriceChange = (value: string) => {
    setOriginalPriceInput(value);
    
    const validation = validatePriceInput(value);
    setErrors(prev => ({
      ...prev,
      originalPrice: validation.isValid ? undefined : validation.error
    }));
    
    updatePreview(value, profitMarginInput);
  };

  const handleProfitMarginChange = (value: string) => {
    setProfitMarginInput(value);
    
    const marginValue = parseFloat(value);
    const isValid = !isNaN(marginValue) && marginValue >= 0 && marginValue <= 1;
    
    setErrors(prev => ({
      ...prev,
      profitMargin: isValid ? undefined : 'Kar marjı 0 ile 1 arasında olmalı (örn: 0.10 = %10)'
    }));
    
    updatePreview(originalPriceInput, value);
  };

  const handleSave = () => {
    const originalValidation = validatePriceInput(originalPriceInput);
    const marginValue = parseFloat(profitMarginInput);

    if (!originalValidation.isValid) {
      setErrors(prev => ({ ...prev, originalPrice: originalValidation.error }));
      return;
    }

    if (isNaN(marginValue) || marginValue < 0 || marginValue > 1) {
      setErrors(prev => ({ ...prev, profitMargin: 'Geçerli bir kar marjı giriniz (0-1 arası)' }));
      return;
    }

    const newPrice = calculatePriceWithCustomMargin(originalValidation.value!, marginValue);
    onPriceUpdate(newPrice);
    setIsOpen(false);
    
    toast({
      title: "✅ Fiyat Güncellendi",
      description: `Yeni satış fiyatı: ${formatSalePrice(newPrice)} (${formatProfitAmount(newPrice)} kar)`,
    });
  };

  const handleReset = () => {
    setOriginalPriceInput(currentPrice.original.toString());
    setProfitMarginInput((currentPrice.profitPercentage / 100).toString());
    setErrors({});
    setPreviewPrice(currentPrice);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className={`bg-blue-900/30 border-blue-600/40 text-blue-300 hover:bg-blue-800/40 ${className}`}
        >
          <Edit3 className="w-3 h-3 mr-1" />
          Fiyat Düzenle
        </Button>
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-md bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-green-400" />
            Fiyat Düzenleme
          </DialogTitle>
          {productTitle && (
            <p className="text-slate-400 text-sm truncate">{productTitle}</p>
          )}
        </DialogHeader>

        <div className="space-y-4">
          {/* Mevcut Fiyat Bilgisi */}
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-slate-400 text-xs mb-2">Mevcut Fiyat</div>
            <div className="flex justify-between items-center text-sm">
              <span>Alış: <span className="text-white font-medium">{formatOriginalPrice(currentPrice)}</span></span>
              <span>Satış: <span className="text-green-400 font-medium">{formatSalePrice(currentPrice)}</span></span>
              <Badge className="bg-green-900/30 text-green-300 text-xs">
                {formatProfitAmount(currentPrice)}
              </Badge>
            </div>
          </div>

          {/* Alış Fiyatı Düzenleme */}
          <div className="space-y-2">
            <Label htmlFor="originalPrice" className="text-white text-sm">
              Alış Fiyatı (TL)
            </Label>
            <Input
              id="originalPrice"
              type="text"
              value={originalPriceInput}
              onChange={(e) => handleOriginalPriceChange(e.target.value)}
              className="bg-slate-800 border-slate-600 text-white"
              placeholder="139.90"
            />
            {errors.originalPrice && (
              <div className="flex items-center gap-1 text-red-400 text-xs">
                <AlertCircle className="w-3 h-3" />
                {errors.originalPrice}
              </div>
            )}
          </div>

          {/* Kar Marjı Düzenleme */}
          <div className="space-y-2">
            <Label htmlFor="profitMargin" className="text-white text-sm">
              Kar Marjı (0-1 arası, örn: 0.10 = %10)
            </Label>
            <Input
              id="profitMargin"
              type="text"
              value={profitMarginInput}
              onChange={(e) => handleProfitMarginChange(e.target.value)}
              className="bg-slate-800 border-slate-600 text-white"
              placeholder="0.10"
            />
            {errors.profitMargin && (
              <div className="flex items-center gap-1 text-red-400 text-xs">
                <AlertCircle className="w-3 h-3" />
                {errors.profitMargin}
              </div>
            )}
          </div>

          {/* Önizleme */}
          {previewPrice && (
            <div className="bg-green-900/20 border border-green-700/50 rounded-lg p-3">
              <div className="text-green-400 text-xs mb-2">Yeni Fiyat Önizlemesi</div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-white">
                  Alış: <span className="font-medium">{formatOriginalPrice(previewPrice)}</span>
                </span>
                <span className="text-green-400">
                  Satış: <span className="font-medium">{formatSalePrice(previewPrice)}</span>
                </span>
                <Badge className="bg-green-800/30 text-green-300 text-xs">
                  {formatProfitAmount(previewPrice)}
                </Badge>
              </div>
              <div className="text-green-400 text-xs mt-1">
                Kar Marjı: {formatProfitPercentage(previewPrice)}
              </div>
            </div>
          )}

          {/* Buttons */}
          <div className="flex justify-between pt-2">
            <Button 
              variant="outline" 
              onClick={handleReset}
              className="bg-slate-700 border-slate-600 text-slate-300"
            >
              Sıfırla
            </Button>
            
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={() => setIsOpen(false)}
                className="bg-slate-700 border-slate-600 text-slate-300"
              >
                İptal
              </Button>
              <Button 
                onClick={handleSave}
                disabled={!!errors.originalPrice || !!errors.profitMargin || !previewPrice}
                className="bg-green-700 hover:bg-green-600 text-white"
              >
                <Check className="w-4 h-4 mr-1" />
                Kaydet
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}