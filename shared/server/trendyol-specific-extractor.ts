/**
 * Trendyol-Specific Data Extractor
 * Targets exact Trendyol DOM structure for features and variants
 */

import * as cheerio from 'cheerio';
import { extractRealSizes, type RealSizeData } from './real-size-extractor';

export interface TrendyolFeature {
  key: string;
  value: string;
}

export interface TrendyolVariant {
  size: string;
  inStock: boolean;
}

export interface TrendyolSpecificData {
  features: TrendyolFeature[];
  variants: TrendyolVariant[];
  hasRealVariants: boolean;
}

export function extractTrendyolSpecificData(html: string): TrendyolSpecificData {
  const $ = cheerio.load(html);
  
  console.log('🎯 Trendyol-specific extraction başlatılıyor...');
  
  const features: TrendyolFeature[] = [];
  const variants: TrendyolVariant[] = [];
  
  // 1. Script içindeki JSON verilerini ara
  $('script').each((i, el) => {
    const scriptContent = $(el).html() || '';
    
    // Product data JSON'ını ara
    const productDataMatch = scriptContent.match(/"product":\s*({[^}]+})/);
    if (productDataMatch) {
      try {
        const productData = JSON.parse(productDataMatch[1]);
        console.log('📦 Product data bulundu');
        
        // Özellikleri çıkar
        if (productData.attributes) {
          Object.entries(productData.attributes).forEach(([key, value]) => {
            features.push({ key, value: String(value) });
          });
        }
      } catch (e) {
        console.log('⚠️ Product data parse hatası');
      }
    }
    
    // Variant data ara
    const variantMatch = scriptContent.match(/"variants":\s*\[([^\]]+)\]/);
    if (variantMatch) {
      try {
        const variantContent = variantMatch[1];
        // Size pattern'leri ara
        const sizeMatches = variantContent.match(/"size":"([^"]+)"/g);
        if (sizeMatches) {
          sizeMatches.forEach(match => {
            const size = match.match(/"size":"([^"]+)"/)?.[1];
            if (size && /^[0-9]{2,3}$/.test(size)) {
              variants.push({ size, inStock: true });
            }
          });
        }
      } catch (e) {
        console.log('⚠️ Variant parse hatası');
      }
    }
  });
  
  // 2. HTML text içinde özellik arama
  const htmlText = $('body').text();
  
  // Özellik tablosu arama - DOM elements
  $('table tr, .product-attributes tr, .attribute-table tr').each((i, el) => {
    const cells = $(el).find('td, th');
    if (cells.length >= 2) {
      const key = $(cells[0]).text().trim();
      const value = $(cells[1]).text().trim();
      
      if (key && value && key.length > 1 && value.length > 1) {
        features.push({ key, value });
        console.log(`📋 Tablo: ${key}: ${value}`);
      }
    }
  });
  
  // Attribute list arama
  $('.attribute-list li, .product-attributes li, .detail-attributes li').each((i, el) => {
    const text = $(el).text().trim();
    if (text.includes(':')) {
      const [key, ...valueParts] = text.split(':');
      const value = valueParts.join(':').trim();
      
      if (key && value && key.trim().length > 1 && value.length > 1) {
        features.push({ key: key.trim(), value });
        console.log(`📋 Liste: ${key.trim()}: ${value}`);
      }
    }
  });
  
  // Türkçe özellik kalıpları - İyileştirilmiş
  const featureMatches = {
    'Kalıp': htmlText.match(/Kalıp[:\s]+(Regular|Slim|Oversize|Bol|Dar|Normal)/i)?.[1]?.trim(),
    'Materyal': htmlText.match(/Materyal[:\s]+([A-Za-zğüşöçıİĞÜŞÖÇ\s%]+(?:Karışımlı)?)/i)?.[1]?.trim(),
    'Cep': htmlText.match(/Cep[:\s]+(Cepli|Cepsiz|Yan Cepli|Ön Cepli)/i)?.[1]?.trim(),
    'Astar Durumu': htmlText.match(/Astar\s+Durumu[:\s]+(Astarlı|Astarsız)/i)?.[1]?.trim(),
    'Kol Tipi': htmlText.match(/Kol\s+Tipi[:\s]+(Standart Kol|Uzun Kol|Kısa Kol|Kolsuz)/i)?.[1]?.trim(),
    'Desen': htmlText.match(/Desen[:\s]+(Düz|Çizgili|Desenli|Kareli|Puantiyeli)/i)?.[1]?.trim(),
    'Yaka Tipi': htmlText.match(/Yaka\s+Tipi[:\s]+(Ceket Yaka|V Yaka|Bisiklet Yaka|Polo Yaka)/i)?.[1]?.trim(),
    'Kumaş Tipi': htmlText.match(/Kumaş\s+Tipi[:\s]+(Dokuma|Örme|Triko|Denim)/i)?.[1]?.trim(),
    'Renk': htmlText.match(/(?:Renk[:\s]+)([A-Za-zğüşöçıİĞÜŞÖÇ]+)(?:\s|$)/i)?.[1]?.trim(),
    'Kapama Şekli': htmlText.match(/Kapama\s+Şekli[:\s]+(Düğmeli|Fermuarlı|Çıtçıtlı|Bağlamalı)/i)?.[1]?.trim(),
    'Ürün Detayı': htmlText.match(/Ürün\s+Detayı[:\s]+(Düğmeli|Fermuarlı|Çıtçıtlı|Bağlamalı)/i)?.[1]?.trim(),
    'Kol Boyu': htmlText.match(/Kol\s+Boyu[:\s]+(Uzun|Kısa|3\/4|7\/8)/i)?.[1]?.trim(),
    'Koleksiyon': htmlText.match(/Koleksiyon[:\s]+(Design|Basic|Premium|Sport|Classic)/i)?.[1]?.trim(),
    'Kalınlık': htmlText.match(/Kalınlık[:\s]+(İnce|Orta|Kalın|Ağır)/i)?.[1]?.trim(),
    'Boy': htmlText.match(/(?:Boy[:\s]+)(Crop|Mini|Midi|Maxi|Normal|Uzun|Kısa)/i)?.[1]?.trim(),
    'Siluet': htmlText.match(/Siluet[:\s]+(Kruvaze|A|H|Düz|Bol|Dar)/i)?.[1]?.trim(),
    'Ortam': htmlText.match(/Ortam[:\s]+(Casual\/Günlük|Şık|Sport|İş|Gece)/i)?.[1]?.trim(),
    'Ek Özellik': htmlText.match(/Ek\s+Özellik[:\s]+(.*?)(?:\n|Dokuma|$)/i)?.[1]?.trim(),
    'Dokuma Tipi': htmlText.match(/Dokuma\s+Tipi[:\s]+([A-Za-zğüşöçıİĞÜŞÖÇ\s]+)(?:\n|Sürdürülebilirlik|$)/i)?.[1]?.trim(),
    'Sürdürülebilirlik Detayı': htmlText.match(/Sürdürülebilirlik\s+Detayı[:\s]+(Hayır|Evet|.*?)(?:\n|$)/i)?.[1]?.trim()
  };
  
  Object.entries(featureMatches).forEach(([key, value]) => {
    if (value && value.length > 0 && value.length < 100) {
      features.push({ key, value });
      console.log(`✅ ${key}: ${value}`);
    }
  });
  
  // 3. Gerçek beden seçeneklerini çıkar
  console.log('🎯 Gerçek beden seçenekleri çıkarılıyor...');
  const realSizeResult = extractRealSizes(html);
  
  // Convert to TrendyolVariant format
  const realVariants: TrendyolVariant[] = realSizeResult.sizes.map(size => ({
    size: size.size,
    inStock: size.inStock
  }));
  
  // Combine with any existing variants
  realVariants.forEach(realVariant => {
    if (!variants.find(v => v.size === realVariant.size)) {
      variants.push(realVariant);
    }
  });
  
  // Benzersiz varyantlar
  const uniqueVariants = variants.filter((v, i, arr) => 
    arr.findIndex(x => x.size === v.size) === i
  );
  
  console.log(`✅ ${features.length} özellik, ${uniqueVariants.length} varyant çıkarıldı`);
  
  return {
    features,
    variants: uniqueVariants,
    hasRealVariants: uniqueVariants.length > 0
  };
}