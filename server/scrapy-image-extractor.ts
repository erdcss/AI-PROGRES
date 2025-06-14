/**
 * Scrapy-Enhanced Image Extractor
 * Integrates Scrapy spider with Node.js for superior image extraction
 */

import { spawn } from 'child_process';
import { join } from 'path';
import fs from 'fs';
import { InsertProduct } from "@shared/schema";

interface ScrapyImageResult {
  title: string;
  images: string[];
  price: string;
  description: string;
  brand: string;
}

/**
 * Scrapy tabanlı gelişmiş görsel çıkarma sistemi
 * Python Scrapy'in güçlü parsing yeteneklerini kullanır
 */
export async function extractWithScrapy(url: string): Promise<string[]> {
  console.log('🕷️ Scrapy görsel çıkarma sistemi başlatılıyor...');
  
  try {
    // Scrapy spider'ı çalıştır
    const scrapyResult = await runScrapySpider(url);
    
    if (scrapyResult && scrapyResult.images) {
      console.log(`🕷️ Scrapy ${scrapyResult.images.length} görsel buldu`);
      
      // Görselleri kalite ve geçerlilik kontrolünden geçir
      const validImages = scrapyResult.images
        .filter(isValidProductImage)
        .sort(sortByImageQuality)
        .slice(0, 5); // En kaliteli 5 görsel
      
      console.log(`🕷️ ${validImages.length} kaliteli görsel seçildi`);
      return validImages;
    }
    
    console.log('🕷️ Scrapy sonuç bulunamadı');
    return [];
    
  } catch (error: any) {
    console.log(`🕷️ Scrapy hatası: ${error.message}`);
    return [];
  }
}

/**
 * Scrapy spider'ını çalıştırır ve JSON sonuç alır
 */
async function runScrapySpider(url: string): Promise<ScrapyImageResult | null> {
  return new Promise((resolve, reject) => {
    const scrapyPath = join(process.cwd(), 'trendyol');
    const outputFile = join(process.cwd(), 'temp', `scrapy_output_${Date.now()}.json`);
    
    // Scrapy komutunu hazırla
    const scrapyProcess = spawn('python', [
      '-m', 'scrapy', 'crawl', 'urun_gorseli',
      '-a', `start_urls=${url}`,
      '-o', outputFile,
      '-t', 'json'
    ], {
      cwd: scrapyPath,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    scrapyProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    scrapyProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    scrapyProcess.on('close', (code) => {
      if (code === 0) {
        try {
          // JSON sonucunu oku
          if (fs.existsSync(outputFile)) {
            const jsonData = fs.readFileSync(outputFile, 'utf8');
            const results = JSON.parse(jsonData);
            
            // Temp dosyayı temizle
            fs.unlinkSync(outputFile);
            
            if (results && results.length > 0) {
              resolve(results[0]);
            } else {
              resolve(null);
            }
          } else {
            resolve(null);
          }
        } catch (parseError: any) {
          console.log(`🕷️ JSON parse hatası: ${parseError.message}`);
          resolve(null);
        }
      } else {
        console.log(`🕷️ Scrapy process hatası: ${stderr}`);
        resolve(null);
      }
    });
    
    scrapyProcess.on('error', (error) => {
      console.log(`🕷️ Scrapy spawn hatası: ${error.message}`);
      resolve(null);
    });
    
    // 30 saniye timeout
    setTimeout(() => {
      scrapyProcess.kill();
      resolve(null);
    }, 30000);
  });
}

/**
 * Görsel kalitesini değerlendirir ve sıralar
 */
function sortByImageQuality(a: string, b: string): number {
  let scoreA = 0, scoreB = 0;
  
  // Çözünürlük puanları
  if (a.includes('1200x1800')) scoreA += 100;
  if (b.includes('1200x1800')) scoreB += 100;
  
  if (a.includes('_org_zoom')) scoreA += 80;
  if (b.includes('_org_zoom')) scoreB += 80;
  
  if (a.includes('mnresize/1200')) scoreA += 60;
  if (b.includes('mnresize/1200')) scoreB += 60;
  
  // Dosya formatı puanları
  if (a.includes('.jpg')) scoreA += 20;
  if (b.includes('.jpg')) scoreB += 20;
  
  if (a.includes('.webp')) scoreA += 10;
  if (b.includes('.webp')) scoreB += 10;
  
  return scoreB - scoreA;
}

/**
 * Gerçek ürün görseli kontrolü
 */
function isValidProductImage(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  
  // Trendyol CDN kontrolü
  if (!url.includes('cdn.dsmcdn.com')) return false;
  
  // Logo ve sistem görsellerini filtrele
  const blacklist = [
    'logo', 'icon', 'badge', 'sprite', 'placeholder',
    'ty-web.svg', 'favicon', 'button', 'arrow', 'star',
    'social', 'payment', 'delivery', 'security', 'banner'
  ];
  
  const urlLower = url.toLowerCase();
  if (blacklist.some(term => urlLower.includes(term))) {
    return false;
  }
  
  // Ürün görseli pattern kontrolü
  const productPatterns = [
    'product/media/images',
    '_org_zoom',
    '/prod/'
  ];
  
  return productPatterns.some(pattern => url.includes(pattern));
}

/**
 * Scrapy ile tam ürün bilgisi çıkarma (ana görsel çıkarma sistemiyle entegrasyon)
 */
export async function scrapeProductWithScrapy(url: string): Promise<Partial<InsertProduct> | null> {
  console.log('🕷️ Scrapy ile tam ürün analizi başlatılıyor...');
  
  try {
    const result = await runScrapySpider(url);
    
    if (!result) {
      console.log('🕷️ Scrapy ürün bilgisi bulunamadı');
      return null;
    }
    
    const images = result.images 
      ? result.images
          .filter(isValidProductImage)
          .sort(sortByImageQuality)
          .slice(0, 5)
      : [];
    
    console.log(`🕷️ Scrapy ürün verisi: ${result.title}, ${images.length} görsel`);
    
    return {
      title: result.title || '',
      description: result.description || '',
      price: result.price || '',
      brand: result.brand || 'turmarkt',
      images: images
    };
    
  } catch (error: any) {
    console.log(`🕷️ Scrapy ürün analizi hatası: ${error.message}`);
    return null;
  }
}