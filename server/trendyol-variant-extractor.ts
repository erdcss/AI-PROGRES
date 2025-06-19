import fs from 'fs';
import path from 'path';

export interface TrendyolVariant {
  color: string;
  size: string;
  price: number | string;
  stock: boolean;
  sku?: string;
  id?: string;
}

export interface VariantImageMap {
  [color: string]: string | string[];
}

interface TYPageData {
  product: {
    variants: TrendyolVariant[];
    variantImageMap: VariantImageMap;
    images?: string[];
    name?: string;
    brand?: string;
    price?: number;
  };
}

interface VariantExtractionResult {
  variants: TrendyolVariant[];
  imageMap: VariantImageMap;
  success: boolean;
  totalVariants: number;
}

export function extractTrendyolVariants(html: string): VariantExtractionResult {
  try {
    // Extract window.TYPageData from HTML - try multiple patterns
    let pageDataMatch = html.match(/window\.TYPageData\s*=\s*({.*?});/s);
    
    if (!pageDataMatch) {
      // Try alternative pattern
      pageDataMatch = html.match(/TYPageData\s*=\s*({.*?});/s);
    }
    
    if (!pageDataMatch) {
      // Try finding in script tags
      const scriptMatch = html.match(/<script[^>]*>[\s\S]*?window\.TYPageData\s*=\s*({[\s\S]*?});[\s\S]*?<\/script>/);
      if (scriptMatch) {
        pageDataMatch = [scriptMatch[0], scriptMatch[1]];
      }
    }
    
    if (!pageDataMatch) {
      console.log('⚠️ window.TYPageData bulunamadı - farklı pattern deneniyor');
      
      // Try to find any JSON-like data with product info
      const jsonMatches = html.match(/"variants"\s*:\s*\[[\s\S]*?\]/g);
      if (jsonMatches) {
        console.log(`🔍 ${jsonMatches.length} varyant JSON bloğu bulundu`);
      }
      
      return { variants: [], imageMap: {}, success: false, totalVariants: 0 };
    }

    const pageDataJson = pageDataMatch[1];
    console.log(`📄 TYPageData bulundu: ${pageDataJson.length} karakter`);
    
    const data: TYPageData = JSON.parse(pageDataJson);
    
    const product = data.product || {};
    const variants = product.variants || [];
    const imageMap = product.variantImageMap || {};

    console.log(`🧩 TYPageData'dan ${variants.length} varyant çıkarıldı`);
    
    return {
      variants,
      imageMap,
      success: true,
      totalVariants: variants.length
    };

  } catch (error) {
    console.error('❌ TYPageData parse hatası:', error);
    return { variants: [], imageMap: {}, success: false, totalVariants: 0 };
  }
}

export function mapVariantImages(variants: TrendyolVariant[], imageMap: VariantImageMap): Array<TrendyolVariant & { imageUrl?: string }> {
  return variants.map(variant => {
    const colorKey = variant.color?.toLowerCase();
    let imageUrl: string | undefined;
    
    if (colorKey && imageMap[colorKey]) {
      const imageData = imageMap[colorKey];
      const imagePath = Array.isArray(imageData) ? imageData[0] : imageData;
      imageUrl = imagePath ? `https://cdn.dsmcdn.com${imagePath}` : undefined;
    }
    
    return {
      ...variant,
      imageUrl
    };
  });
}

export function formatVariantsForCSV(variants: TrendyolVariant[], imageMap: VariantImageMap): Array<{
  color: string;
  size: string;
  price: string;
  stock: string;
  imageUrl: string;
}> {
  const mappedVariants = mapVariantImages(variants, imageMap);
  
  return mappedVariants.map(variant => ({
    color: variant.color || '-',
    size: variant.size || '-',
    price: variant.price ? `${variant.price} TL` : '-',
    stock: variant.stock ? '✔️ Var' : '❌ Yok',
    imageUrl: variant.imageUrl || '-'
  }));
}

export async function saveVariantsAsJSON(variants: TrendyolVariant[], filename: string = 'variants.json'): Promise<void> {
  try {
    const outputDir = path.dirname(filename);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    fs.writeFileSync(filename, JSON.stringify(variants, null, 2), 'utf-8');
    console.log(`✅ JSON çıktı kaydedildi: ${filename}`);
  } catch (error) {
    console.error('❌ JSON kaydetme hatası:', error);
  }
}

export async function saveVariantsAsCSV(
  variants: TrendyolVariant[], 
  imageMap: VariantImageMap, 
  filename: string = 'variants.csv'
): Promise<void> {
  try {
    const outputDir = path.dirname(filename);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const csvData = formatVariantsForCSV(variants, imageMap);
    
    // CSV header
    const header = 'Renk,Beden,Fiyat (TL),Stok,Görsel\n';
    
    // CSV rows
    const rows = csvData.map(row => {
      return [
        escapeCSVField(row.color),
        escapeCSVField(row.size),
        escapeCSVField(row.price),
        escapeCSVField(row.stock),
        escapeCSVField(row.imageUrl)
      ].join(',');
    }).join('\n');
    
    const csvContent = header + rows;
    fs.writeFileSync(filename, '\uFEFF' + csvContent, 'utf-8'); // UTF-8 BOM
    
    console.log(`✅ CSV çıktı kaydedildi: ${filename}`);
  } catch (error) {
    console.error('❌ CSV kaydetme hatası:', error);
  }
}

function escapeCSVField(value: string): string {
  if (!value) return '""';
  const escaped = value.replace(/"/g, '""');
  return `"${escaped}"`;
}

export function getVariantColors(variants: TrendyolVariant[]): string[] {
  const colors = variants.map(v => v.color).filter(Boolean);
  return Array.from(new Set(colors));
}

export function getVariantSizes(variants: TrendyolVariant[]): string[] {
  const sizes = variants.map(v => v.size).filter(Boolean);
  return Array.from(new Set(sizes));
}

export function getStockStatus(variants: TrendyolVariant[]): {
  inStock: number;
  outOfStock: number;
  total: number;
} {
  const inStock = variants.filter(v => v.stock).length;
  const outOfStock = variants.filter(v => !v.stock).length;
  
  return {
    inStock,
    outOfStock,
    total: variants.length
  };
}