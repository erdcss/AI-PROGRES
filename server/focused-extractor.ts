/**
 * Focused Extractor - Sadece istenen 5 veri tipini çıkarır
 * 1. Ürün markası
 * 2. Ürün başlığı  
 * 3. Ürün görselleri
 * 4. Ürün varyantları
 * 5. Ürün özellikleri
 */

export interface FocusedProductData {
  brand: string;
  title: string;
  images: string[];
  variants: Array<{
    color: string;
    size: string;
    inStock: boolean;
    stockCount: number;
  }>;
  features: Array<{
    key: string;
    value: string;
  }>;
}

export async function extractFocusedData(url: string): Promise<FocusedProductData> {
  console.log(`🎯 Focused extraction başlatılıyor: ${url}`);
  
  // Sayfa içeriğini fetch et
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'tr-TR,tr;q=0.9'
    }
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  
  const htmlContent = await response.text();
  
  // Product state JSON çıkar
  const productStateRegex = /window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.*?});/s;
  const match = htmlContent.match(productStateRegex);
  
  if (!match) {
    throw new Error('Ürün verisi bulunamadı');
  }
  
  const productState = JSON.parse(match[1]);
  const product = productState.product;
  
  if (!product) {
    throw new Error('Product data yok');
  }
  
  // 1. MARKA
  const brand = product.brand?.name || 'Bilinmiyor';
  console.log(`✓ Marka: ${brand}`);
  
  // 2. BAŞLIK
  const title = product.name || 'Başlık bulunamadı';
  console.log(`✓ Başlık: ${title}`);
  
  // 3. GÖRSELLER - Gelişmiş görsel çıkarma
  const images: string[] = [];
  
  // Ana ürün görselleri
  if (product.images && Array.isArray(product.images)) {
    product.images.forEach((img: any) => {
      let imageUrl = null;
      
      // Farklı görsel formatları kontrol et
      if (typeof img === 'string' && img.includes('dsmcdn.com')) {
        imageUrl = img;
      } else if (img?.url && typeof img.url === 'string' && img.url.includes('dsmcdn.com')) {
        imageUrl = img.url;
      } else if (img?.link && typeof img.link === 'string' && img.link.includes('dsmcdn.com')) {
        imageUrl = img.link;
      }
      
      if (imageUrl && !images.includes(imageUrl)) {
        images.push(imageUrl);
        console.log(`📸 Ana görsel: ${imageUrl}`);
      }
    });
  }
  
  // Varyant görselleri
  if (product.allVariants && Array.isArray(product.allVariants)) {
    product.allVariants.forEach((variant: any) => {
      if (variant.images && Array.isArray(variant.images)) {
        variant.images.forEach((img: any) => {
          let imageUrl = null;
          
          if (typeof img === 'string' && img.includes('dsmcdn.com')) {
            imageUrl = img;
          } else if (img?.url && img.url.includes('dsmcdn.com')) {
            imageUrl = img.url;
          }
          
          if (imageUrl && !images.includes(imageUrl)) {
            images.push(imageUrl);
            console.log(`📸 Varyant görseli: ${imageUrl}`);
          }
        });
      }
    });
  }
  
  // Alternatif görsel kaynakları
  if (images.length === 0) {
    console.log(`⚠️ Ana kaynaklardan görsel bulunamadı, alternatif kaynaklar kontrol ediliyor...`);
    
    // Product detail içindeki diğer görsel alanları kontrol et
    const alternativeSources = [
      product.productImages,
      product.galleryImages,
      product.media?.images,
      productState.productDetail?.images,
      productState.gallery?.images
    ];
    
    alternativeSources.forEach((source, index) => {
      console.log(`🔍 Alternatif kaynak ${index + 1} kontrol ediliyor:`, !!source);
      
      if (source && Array.isArray(source)) {
        source.forEach((img: any) => {
          let imageUrl = null;
          
          if (typeof img === 'string' && img.includes('dsmcdn.com')) {
            imageUrl = img;
          } else if (img?.url && img.url.includes('dsmcdn.com')) {
            imageUrl = img.url;
          }
          
          if (imageUrl && !images.includes(imageUrl)) {
            images.push(imageUrl);
            console.log(`📸 Alternatif görsel: ${imageUrl}`);
          }
        });
      }
    });
  }
  
  // Son çare: HTML'den görsel URL'lerini regex ile çıkar
  if (images.length === 0) {
    console.log(`⚠️ JSON'dan görsel bulunamadı, HTML'den regex ile aranıyor...`);
    
    const imageRegexes = [
      /https:\/\/cdn\.dsmcdn\.com\/ty\d+\/product\/media\/images\/[^"'\s]+\.jpg/g,
      /https:\/\/cdn\.dsmcdn\.com\/ty\d+\/product\/media\/images\/[^"'\s]+\.jpeg/g,
      /https:\/\/cdn\.dsmcdn\.com\/ty\d+\/product\/media\/images\/[^"'\s]+\.webp/g,
      /"url":"(https:\/\/cdn\.dsmcdn\.com[^"]+)"/g
    ];
    
    imageRegexes.forEach(regex => {
      const matches = htmlContent.match(regex) || [];
      matches.forEach(match => {
        let imageUrl = match;
        if (match.includes('"url":"')) {
          imageUrl = match.replace('"url":"', '').replace('"', '');
        }
        
        if (imageUrl.includes('dsmcdn.com') && !images.includes(imageUrl)) {
          images.push(imageUrl);
          console.log(`📸 HTML'den görsel: ${imageUrl}`);
        }
      });
    });
  }
  
  console.log(`✓ Görseller: ${images.length} adet`);
  
  // Debug: Görsel verilerini detaylı logla
  if (images.length === 0) {
    console.log(`❌ GÖRSEL BULUNAMADI - Debug bilgileri:`);
    console.log(`📦 Product var: ${!!product}`);
    console.log(`🖼️ Product.images var: ${!!product?.images}`);
    console.log(`📊 Product.images length: ${product?.images?.length || 0}`);
    
    if (product?.images && product.images.length > 0) {
      console.log(`🔍 İlk görsel objesi:`, JSON.stringify(product.images[0], null, 2));
    }
  } else {
    console.log(`✅ İlk görsel: ${images[0]}`);
  }
  
  // 4. VARYANTLAR
  const variants: Array<{
    color: string;
    size: string;
    inStock: boolean;
    stockCount: number;
  }> = [];
  
  if (product.allVariants && Array.isArray(product.allVariants)) {
    product.allVariants.forEach((variant: any) => {
      if (!variant) return;
      
      const attributes = variant.attributes || {};
      const color = attributes.RENK || attributes.Renk || variant.color || 'Varsayılan';
      const size = attributes.BEDEN || attributes.Beden || variant.size || 'Tek Beden';
      const stockCount = parseInt(variant.stock || variant.stockCount || '0');
      const inStock = stockCount > 0;
      
      // Sadece stokta olanları ekle
      if (inStock) {
        variants.push({
          color: String(color),
          size: String(size),
          inStock: true,
          stockCount
        });
      }
    });
  }
  
  console.log(`✓ Varyantlar: ${variants.length} adet (stokta)`);
  
  // 5. ÖZELLİKLER
  const features: Array<{
    key: string;
    value: string;
  }> = [];
  
  // Product attributes'dan
  if (product.attributes && typeof product.attributes === 'object') {
    Object.entries(product.attributes).forEach(([key, value]) => {
      if (key && value && 
          typeof key === 'string' && typeof value === 'string' &&
          key.length > 1 && key.length < 50 &&
          value.length > 1 && value.length < 100 &&
          !key.includes('"') && !value.includes('"') &&
          !key.includes('{') && !value.includes('{')) {
        features.push({
          key: key.trim(),
          value: value.trim()
        });
      }
    });
  }
  
  console.log(`✓ Özellikler: ${features.length} adet`);
  
  const result: FocusedProductData = {
    brand,
    title,
    images: images.slice(0, 10), // İlk 10 görsel
    variants: variants.slice(0, 20), // İlk 20 varyant
    features: features.slice(0, 15) // İlk 15 özellik
  };
  
  console.log(`🎯 Focused extraction tamamlandı`);
  
  return result;
}