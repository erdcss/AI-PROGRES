import * as cheerio from 'cheerio';

interface ProductFeatures {
  [key: string]: string;
}

export function extractProductFeatures(html: string): ProductFeatures {
  const $ = cheerio.load(html);
  const features: ProductFeatures = {};

  // Trendyol sayfasında özellikler genelde bu sınıf içinde oluyor
  const detailSection = $('.detail-attr-container');
  if (detailSection.length === 0) {
    console.log('⚠️ Ürün özellikleri bölümü bulunamadı');
    return features;
  }

  detailSection.find('li').each((_, element) => {
    const label = $(element).find('.attr-label').text().trim();
    const value = $(element).find('.attr-value').text().trim();
    
    if (label && value) {
      // Temizle ve normalize et
      const cleanLabel = label.replace(':', '').trim();
      features[cleanLabel] = value;
    }
  });

  console.log(`📋 ${Object.keys(features).length} ürün özelliği çıkarıldı`);
  return features;
}

export function extractAdvancedProductAttributes(html: string): {
  features: ProductFeatures;
  specifications: ProductFeatures;
  details: ProductFeatures;
} {
  const $ = cheerio.load(html);
  
  const features = extractProductFeatures(html);
  const specifications: ProductFeatures = {};
  const details: ProductFeatures = {};

  // Alternatif özellik bölümleri
  $('.product-specs, .spec-list, .product-attributes').each((_, section) => {
    $(section).find('li, tr, .spec-item').each((_, item) => {
      const label = $(item).find('.spec-label, .attr-label, td:first-child, dt').text().trim();
      const value = $(item).find('.spec-value, .attr-value, td:last-child, dd').text().trim();
      
      if (label && value) {
        const cleanLabel = label.replace(':', '').trim();
        specifications[cleanLabel] = value;
      }
    });
  });

  // Ürün detayları için farklı selektörler
  $('.product-detail-content, .detail-section').each((_, section) => {
    $(section).find('p, span, div').each((_, element) => {
      const text = $(element).text().trim();
      if (text.includes(':') && text.length < 200) {
        const [key, ...valueParts] = text.split(':');
        if (key && valueParts.length > 0) {
          const value = valueParts.join(':').trim();
          if (value) {
            details[key.trim()] = value;
          }
        }
      }
    });
  });

  return { features, specifications, details };
}

export function formatProductAttributes(attributes: ProductFeatures): string[] {
  const formatted: string[] = [];
  
  Object.entries(attributes).forEach(([key, value]) => {
    if (value && value.length > 0) {
      formatted.push(`${key}: ${value}`);
    }
  });

  return formatted;
}

export function generateProductDescription(
  title: string,
  features: ProductFeatures,
  specifications: ProductFeatures
): string {
  const allAttributes = { ...features, ...specifications };
  const attributeLines = formatProductAttributes(allAttributes);
  
  let description = `<h3>${title}</h3>\n\n`;
  description += `<p>Yüksek kaliteli malzeme ile üretilmiştir. Günlük kullanım için ideal. Rahat kesim ve şık tasarım.</p>\n\n`;
  
  if (attributeLines.length > 0) {
    description += `<h4>Ürün Özellikleri:</h4>\n<ul>\n`;
    attributeLines.slice(0, 8).forEach(attr => {
      description += `<li>${attr}</li>\n`;
    });
    description += `</ul>\n\n`;
  }
  
  description += `<p>Uzun ömürlü kullanım için tasarlanmıştır.</p>`;
  
  return description;
}