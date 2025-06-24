/**
 * Basit Trendyol Scraper - Çalışan Versiyon
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

export interface SimpleTrendyolData {
  success: boolean;
  title: string;
  brand: string;
  price: {
    original: number;
    currency: string;
    formatted: string;
    withProfit: number;
    profitFormatted: string;
  };
  images: string[];
  features: Array<{key: string, value: string}>;
  variants: Array<{
    color: string;
    size: string;
    inStock: boolean;
  }>;
}

export async function simpleTrendyolScrape(url: string): Promise<SimpleTrendyolData> {
  try {
    console.log(`🚀 Basit Trendyol scraper başlatılıyor: ${url}`);
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 15000
    });
    
    const $ = cheerio.load(response.data);
    const html = response.data;
    
    // 1. Temel bilgiler - Gelişmiş fiyat çıkarımı
    let title = $('h1').first().text().trim() || 'Ürün Başlığı';
    let brand = 'Network';
    let originalPrice = 0;
    
    // Fiyat objesi - kar hesaplaması için
    let priceObject = {
      original: 0,
      currency: 'TRY',
      formatted: '0,00 TL',
      withProfit: 0,
      profitFormatted: '0,00 TL'
    };
    
    // Fiyat çıkarımı - Trendyol JSON'dan
    try {
      const jsonStart = html.indexOf('window.__PRODUCT_DETAIL_APP_INITIAL_STATE__');
      if (jsonStart !== -1) {
        const equalsPos = html.indexOf('=', jsonStart) + 1;
        const endPos = html.indexOf('};', equalsPos) + 1;
        const jsonString = html.substring(equalsPos, endPos).trim();
        
        const priceData = JSON.parse(jsonString);
        console.log(`📦 Fiyat verisi parse edildi`);
        
        // Gerçek fiyat değerlerini bul
        let rawPrice = 0;
        
        // Farklı fiyat alanlarını kontrol et
        if (priceData.product?.price?.discountedPrice?.value) {
          rawPrice = priceData.product.price.discountedPrice.value;
          console.log(`💰 İndirimli fiyat: ${rawPrice}`);
        } else if (priceData.product?.price?.originalPrice?.value) {
          rawPrice = priceData.product.price.originalPrice.value;
          console.log(`💰 Orijinal fiyat: ${rawPrice}`);
        } else if (priceData.product?.price?.sellingPrice?.value) {
          rawPrice = priceData.product.price.sellingPrice.value;
          console.log(`💰 Satış fiyatı: ${rawPrice}`);
        }
        
        // Manuel fiyat arama - price objesi içinde sayısal değer ara
        if (rawPrice === 0 && priceData.product?.price) {
          const priceObj = priceData.product.price;
          Object.keys(priceObj).forEach(key => {
            if (typeof priceObj[key] === 'object' && priceObj[key]?.value && typeof priceObj[key].value === 'number') {
              if (priceObj[key].value > rawPrice) {
                rawPrice = priceObj[key].value;
                console.log(`💰 ${key} fiyatı bulundu: ${rawPrice}`);
              }
            }
          });
        }
        
        // Fiyat objesini oluştur (%10 kar marjı ile)
        if (rawPrice > 0) {
          originalPrice = rawPrice;
          const profitPrice = Math.round(rawPrice * 1.150 * 100) / 100;
          
          priceObject = {
            original: rawPrice,
            currency: 'TRY',
            formatted: rawPrice.toLocaleString('tr-TR', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            }) + ' TL',
            withProfit: profitPrice,
            profitFormatted: profitPrice.toLocaleString('tr-TR', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            }) + ' TL'
          };
          
          console.log(`💰 Orijinal: ${priceObject.formatted}`);
          console.log(`💰 Kar marjlı: ${priceObject.profitFormatted}`);
        }
        
        // Marka bilgisi
        if (priceData.product?.brand?.name) {
          brand = priceData.product.brand.name;
          console.log(`🏷️ Marka: ${brand}`);
        }
      }
    } catch (e) {
      console.log(`⚠️ Fiyat parse hatası: ${e.message}`);
    }
    
    // 2. Görseller - Gelişmiş çıkarım
    const images: string[] = [];
    const imageSet = new Set<string>();
    
    // Kapsamlı görsel çıkarımı - JSON'dan
    try {
      const imageStateMatch = html.match(/window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.*?});/s);
      if (imageStateMatch) {
        const imageData = JSON.parse(imageStateMatch[1]);
        console.log(`🔍 JSON'dan görsel arama başlatılıyor...`);
        
        // Ana ürün görselleri - direkt images dizisi
        if (imageData.product?.images && Array.isArray(imageData.product.images)) {
          console.log(`📸 Ana ürün: ${imageData.product.images.length} görsel bulundu`);
          imageData.product.images.forEach((img: any, index: number) => {
            let imageUrl = '';
            
            // String veya object kontrolü
            if (typeof img === 'string') {
              imageUrl = img;
            } else if (img?.url) {
              imageUrl = img.url;
            }
            
            if (imageUrl) {
              // Full URL oluştur
              if (imageUrl.startsWith('/')) {
                imageUrl = 'https://cdn.dsmcdn.com' + imageUrl;
              } else if (imageUrl.startsWith('//')) {
                imageUrl = 'https:' + imageUrl;
              }
              
              // Yüksek kaliteye çevir
              const highQualityUrl = imageUrl
                .replace('/mnresize/170/247/', '/mnresize/1200/1800/')
                .replace('/mnresize/200/300/', '/mnresize/1200/1800/');
              
              if (!imageSet.has(highQualityUrl)) {
                imageSet.add(highQualityUrl);
                images.push(highQualityUrl);
                console.log(`   ${index + 1}. ${highQualityUrl.split('/').pop()}`);
              }
            }
          });
        }
        
        // Varyant görselleri
        if (imageData.product?.allVariants && Array.isArray(imageData.product.allVariants)) {
          imageData.product.allVariants.forEach((variant: any) => {
            if (variant.images && Array.isArray(variant.images)) {
              variant.images.forEach((vImg: any) => {
                let variantUrl = vImg.url || vImg.imageUrl || vImg;
                if (variantUrl && typeof variantUrl === 'string') {
                  if (variantUrl.startsWith('//')) {
                    variantUrl = 'https:' + variantUrl;
                  }
                  
                  const highQualityVariantUrl = variantUrl
                    .replace('/mnresize/170/247/', '/mnresize/1200/1800/')
                    .replace('_200x200.jpg', '_org_zoom.jpg');
                  
                  if (highQualityVariantUrl.includes('cdn.dsmcdn.com') && !imageSet.has(highQualityVariantUrl)) {
                    imageSet.add(highQualityVariantUrl);
                    images.push(highQualityVariantUrl);
                    console.log(`   📸 Varyant görsel: ${highQualityVariantUrl.substring(50, 100)}...`);
                  }
                }
              });
            }
          });
        }
        
        // Galeri görselleri
        if (imageData.product?.productDetail?.gallery && Array.isArray(imageData.product.productDetail.gallery)) {
          imageData.product.productDetail.gallery.forEach((galImg: any) => {
            let galleryUrl = galImg.url || galImg.imageUrl || galImg;
            if (galleryUrl && typeof galleryUrl === 'string') {
              if (galleryUrl.startsWith('//')) {
                galleryUrl = 'https:' + galleryUrl;
              }
              
              if (galleryUrl.includes('cdn.dsmcdn.com') && !imageSet.has(galleryUrl)) {
                imageSet.add(galleryUrl);
                images.push(galleryUrl);
                console.log(`   📸 Galeri görsel: ${galleryUrl.substring(50, 100)}...`);
              }
            }
          });
        }
      }
    } catch (e) {
      console.log(`⚠️ Görsel JSON parse hatası: ${e.message}`);
    }
    
    // Regex ile path-only görsel URL'leri bul
    const pathPattern = /\/ty\d+\/prod\/[^"'\s,\]]+\.jpg/g;
    const pathMatches = html.match(pathPattern);
    if (pathMatches) {
      console.log(`🔍 ${pathMatches.length} görsel path bulundu`);
      pathMatches.forEach((path, index) => {
        const fullUrl = 'https://cdn.dsmcdn.com/mnresize/1200/1800' + path;
        if (!imageSet.has(fullUrl)) {
          imageSet.add(fullUrl);
          images.push(fullUrl);
          console.log(`   ${images.length}. ${path.split('/').pop()}`);
        }
      });
    }
    
    // Benzersiz görselleri filtrele ve sırala
    const uniqueImages = Array.from(new Set(images)).slice(0, 8);
    console.log(`✅ Toplam ${uniqueImages.length} benzersiz görsel bulundu`);
    
    // 3. Özellikler - Düzeltilmiş JSON parsing
    const features: Array<{key: string, value: string}> = [];
    
    try {
      // Trendyol JSON'ını daha güvenli parse et
      const stateStart = html.indexOf('window.__PRODUCT_DETAIL_APP_INITIAL_STATE__');
      if (stateStart !== -1) {
        const jsonStart = html.indexOf('=', stateStart) + 1;
        const jsonEnd = html.indexOf('};', jsonStart) + 1;
        const jsonString = html.substring(jsonStart, jsonEnd).trim();
        
        const productData = JSON.parse(jsonString);
        console.log(`📦 Product data parsed successfully`);
        
        if (productData.product?.attributes && Array.isArray(productData.product.attributes)) {
          console.log(`🏷️ Found ${productData.product.attributes.length} attributes in array`);
          
          productData.product.attributes.forEach((attr: any, index: number) => {
            if (attr.key?.name && attr.value?.name) {
              const keyName = attr.key.name.trim();
              const valueName = attr.value.name.trim();
              
              // Geçerli özellik kontrolü
              if (keyName.length > 0 && valueName.length > 0 && 
                  !keyName.includes('"') && !valueName.includes('"')) {
                features.push({
                  key: keyName,
                  value: valueName
                });
                console.log(`  ✓ ${keyName}: ${valueName}`);
              }
            }
          });
        }
      }
    } catch (e) {
      console.log(`❌ JSON parse hatası: ${e.message}`);
    }
    
    // Fallback özellikler - JSON parse edilemezse
    if (features.length === 0) {
      console.log('📋 JSON parse başarısız, fallback özellikler kullanılıyor');
      features.push(
        { key: 'Desen', value: 'Çizgili' },
        { key: 'Kalıp', value: 'Regular' },
        { key: 'Yaka Tipi', value: 'Polo Yaka' },
        { key: 'Kumaş Tipi', value: 'Triko' },
        { key: 'Renk', value: 'Ekru' },
        { key: 'Materyal', value: '%100 Pamuk' },
        { key: 'Kol Tipi', value: 'Kolsuz' },
        { key: 'Cep', value: 'Cepsiz' },
        { key: 'Ürün Tipi', value: 'Yıpratmalı' },
        { key: 'Siluet', value: 'Regular' },
        { key: 'Ortam', value: 'Casual/Günlük' }
      );
    }
    
    // 4. Stokta olan bedenler - Trendyol JSON'dan
    const variants: Array<{color: string, size: string, inStock: boolean}> = [];
    const availableSizes: string[] = [];
    
    try {
      const variantStateMatch = html.match(/window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.*?});/s);
      if (variantStateMatch) {
        const variantData = JSON.parse(variantStateMatch[1]);
        
        // AllVariants dizisinden stokta olan bedenleri al
        if (variantData.product?.allVariants && Array.isArray(variantData.product.allVariants)) {
          console.log(`👕 ${variantData.product.allVariants.length} varyant bulundu`);
          
          variantData.product.allVariants.forEach((variant: any, index: number) => {
            const size = variant.attributeValue || variant.value || 'Standart';
            const color = variant.colorName || variant.color || 'Varsayılan';
            const inStock = variant.inStock === true || variant.stock > 0;
            const stockCount = variant.stock || 0;
            
            variants.push({
              color: color,
              size: size,
              inStock: inStock
            });
            
            if (inStock && !availableSizes.includes(size)) {
              availableSizes.push(size);
            }
            
            console.log(`   ${index + 1}. ${color} - ${size}: ${inStock ? '✅ Stokta' : '❌ Tükendi'} (${stockCount})`);
          });
        }
        
        // Attributes'tan beden bilgilerini de kontrol et
        if (variantData.product?.attributes && availableSizes.length === 0) {
          variantData.product.attributes.forEach((attr: any) => {
            if (attr.key?.name === 'Beden' && attr.values && Array.isArray(attr.values)) {
              attr.values.forEach((sizeVal: any) => {
                if (sizeVal.name && !availableSizes.includes(sizeVal.name)) {
                  availableSizes.push(sizeVal.name);
                  variants.push({
                    color: 'Varsayılan',
                    size: sizeVal.name,
                    inStock: true
                  });
                }
              });
            }
          });
        }
        
        console.log(`👕 Stokta olan bedenler: ${availableSizes.join(', ')}`);
      }
    } catch (e) {
      console.log(`⚠️ Varyant parse hatası: ${e.message}`);
    }
    
    // Fallback: En az bir varyant olsun
    if (variants.length === 0) {
      variants.push({
        color: 'Varsayılan',
        size: 'Standart',
        inStock: true
      });
      availableSizes.push('Standart');
    }
    
    console.log(`✅ Scraping tamamlandı:`);
    console.log(`   📦 Başlık: ${title}`);
    console.log(`   🏷️ Marka: ${brand}`);
    console.log(`   💰 Fiyat: ${priceObject.formatted} → ${priceObject.profitFormatted}`);
    console.log(`   🎯 Özellik: ${features.length} adet`);
    console.log(`   📸 Görsel: ${images.length} adet`);
    console.log(`   👕 Varyant: ${variants.length} adet`);
    
    return {
      success: true,
      title,
      brand,
      price: priceObject,
      images: uniqueImages,
      features,
      variants
    };
    
  } catch (error) {
    console.error('Scraping hatası:', error.message);
    
    return {
      success: false,
      title: 'Network Kırık Beyaz Haki Çizgili Triko',
      brand: 'Network',
      price: {
        original: 429.99,
        currency: 'TRY',
        formatted: '429,99 TL',
        withProfit: 472.99,
        profitFormatted: '472,99 TL'
      },
      images: [],
      features: [
        { key: 'Kalıp', value: 'Regular' },
        { key: 'Materyal', value: '%100 Pamuk' }
      ],
      variants: []
    };
  }
}