import axios from 'axios';
import * as cheerio from 'cheerio';

interface ArcelikImageData {
  images: string[];
  productCode: string;
  title: string;
}

export class ArcelikImageExtractor {
  async extractImages(url: string): Promise<ArcelikImageData> {
    try {
      console.log('🖼️ Arçelik görsel çıkarma başlatılıyor...');
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        timeout: 15000
      });
      
      const $ = cheerio.load(response.data);
      const images: string[] = [];
      
      // Extract from meta tags (OpenGraph and Twitter)
      const metaImage = $('meta[property="og:image"]').attr('content') || 
                       $('meta[name="twitter:image"]').attr('content');
      if (metaImage) {
        const fullUrl = metaImage.startsWith('http') ? metaImage : `https://www.arcelik.com.tr${metaImage}`;
        images.push(fullUrl);
      }
      
      // Extract product code from URL
      const productCode = url.match(/\/(\d+)-/)?.[1] || '';
      
      // Generate ONLY product-specific image URLs based on Arçelik's CDN pattern
      if (productCode) {
        // Only extract the main product images (reduced from 10 to 6 views)
        const basePatterns = [
          `/media/resize/${productCode}_LO1_20180501_232912.png`,
          `/media/resize/${productCode}_LO2_20180501_232912.png`,
          `/media/resize/${productCode}_LO3_20180501_232912.png`,
          `/media/resize/${productCode}_LO4_20180501_232912.png`,
          `/media/resize/${productCode}_LO5_20180501_232912.png`,
          `/media/resize/${productCode}_LO6_20180501_232912.png`
        ];
        
        // Use only the standard size for product images
        const standardSize = '600Wx600H';
        const format = 'png';
        
        for (const pattern of basePatterns) {
          const imageUrl = `https://www.arcelik.com.tr${pattern}/${standardSize}/image.${format}`;
          if (!images.includes(imageUrl)) {
            images.push(imageUrl);
          }
        }
      }
      
      // Extract from JSON-LD structured data
      $('script[type="application/ld+json"]').each((_, script) => {
        try {
          const jsonData = JSON.parse($(script).html() || '{}');
          if (jsonData.image) {
            const imageUrls = Array.isArray(jsonData.image) ? jsonData.image : [jsonData.image];
            imageUrls.forEach((img: string) => {
              let fullUrl = img;
              if (img.startsWith('www.')) {
                fullUrl = 'https://' + img;
              } else if (img.startsWith('/')) {
                fullUrl = 'https://www.arcelik.com.tr' + img;
              } else if (!img.startsWith('http')) {
                fullUrl = 'https://www.arcelik.com.tr/' + img;
              }
              if (!images.includes(fullUrl)) {
                images.push(fullUrl);
              }
            });
          }
        } catch (e) {
          console.log('JSON-LD parsing error:', e.message);
        }
      });
      
      // Extract from all img tags with various attributes
      $('img').each((_, img) => {
        const sources = [
          $(img).attr('src'),
          $(img).attr('data-src'),
          $(img).attr('data-original'),
          $(img).attr('data-lazy'),
          $(img).attr('data-image')
        ];
        
        sources.forEach(src => {
          if (src) {
            let fullUrl = src;
            if (src.startsWith('//')) {
              fullUrl = 'https:' + src;
            } else if (src.startsWith('/')) {
              fullUrl = 'https://www.arcelik.com.tr' + src;
            }
            
            // Only include product-specific images
            if (fullUrl.includes('arcelik') && 
                (fullUrl.includes('.jpg') || fullUrl.includes('.png') || fullUrl.includes('.webp')) &&
                !fullUrl.includes('logo') && !fullUrl.includes('icon') && 
                !fullUrl.includes('banner') && !fullUrl.includes('ui-') &&
                (fullUrl.includes(productCode) || fullUrl.includes('media/resize')) &&
                !images.includes(fullUrl)) {
              images.push(fullUrl);
            }
          }
        });
      });
      
      // Extract from CSS background-image properties
      $('[style*="background-image"]').each((_, elem) => {
        const style = $(elem).attr('style');
        const match = style?.match(/background-image:\s*url\(['"]?([^'")]+)['"]?\)/);
        if (match) {
          let src = match[1];
          if (src.startsWith('/')) {
            src = 'https://www.arcelik.com.tr' + src;
          }
          if (src.includes('arcelik') && !images.includes(src)) {
            images.push(src);
          }
        }
      });
      
      // Extract from script content
      const scriptContent = $('script').text();
      const imageMatches = scriptContent.match(/https?:\/\/[^"'\s]*\.(?:jpg|jpeg|png|webp|gif)/gi);
      if (imageMatches) {
        imageMatches.forEach(url => {
          if (url.includes('arcelik') && !images.includes(url)) {
            images.push(url);
          }
        });
      }
      
      const title = $('h1').first().text().trim() || 'Arçelik Ürün';
      
      console.log(`✅ ${images.length} adet görsel çıkarıldı`);
      
      return {
        images: images.slice(0, 12), // Limit to first 12 images
        productCode,
        title
      };
      
    } catch (error) {
      console.error('❌ Görsel çıkarma hatası:', error.message);
      return {
        images: [],
        productCode: '',
        title: ''
      };
    }
  }
}

export const arcelikImageExtractor = new ArcelikImageExtractor();