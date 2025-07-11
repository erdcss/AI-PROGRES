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
      
      // Generate image URLs based on Arçelik's CDN pattern
      if (productCode) {
        const basePatterns = [
          `/media/resize/${productCode}_LO1_20180501_232912.png`,
          `/media/resize/${productCode}_LO2_20180501_232912.png`,
          `/media/resize/${productCode}_LO3_20180501_232912.png`,
          `/media/resize/${productCode}_LO4_20180501_232912.png`,
          `/media/resize/${productCode}_LO5_20180501_232912.png`,
          `/media/resize/${productCode}_LO6_20180501_232912.png`,
          `/media/resize/${productCode}_LO7_20180501_232912.png`,
          `/media/resize/${productCode}_LO8_20180501_232912.png`,
          `/media/resize/${productCode}_LO9_20180501_232912.png`,
          `/media/resize/${productCode}_LO10_20180501_232912.png`
        ];
        
        // Try different sizes and formats
        const sizes = ['265Wx265H', '400Wx400H', '600Wx600H', '800Wx800H'];
        const formats = ['jpg', 'png', 'webp'];
        
        for (const pattern of basePatterns) {
          for (const size of sizes) {
            for (const format of formats) {
              const imageUrl = `https://www.arcelik.com.tr${pattern}/${size}/image.${format}`;
              if (!images.includes(imageUrl)) {
                images.push(imageUrl);
              }
            }
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
              const fullUrl = img.startsWith('http') ? img : `https://www.arcelik.com.tr${img}`;
              if (!images.includes(fullUrl)) {
                images.push(fullUrl);
              }
            });
          }
        } catch (e) {
          // Ignore JSON parsing errors
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
            
            if (fullUrl.includes('arcelik') && 
                (fullUrl.includes('.jpg') || fullUrl.includes('.png') || fullUrl.includes('.webp')) &&
                !fullUrl.includes('logo') && !fullUrl.includes('icon') &&
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