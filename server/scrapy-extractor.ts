/**
 * Scrapy-based Enhanced Image Extractor
 * Utilizes Python Scrapy for advanced web scraping with better bot detection bypass
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export async function extractImagesWithScrapy(url: string): Promise<string[]> {
  console.log('🕷️ Scrapy Enhanced Extractor başlatılıyor...');
  
  try {
    // 1. Scrapy spider'ını özelleştirilmiş URL ile çalıştır
    const scrapyResults = await runScrapySpider(url);
    
    // 2. Scrapy sonuçlarını işle
    const extractedImages = processScrapyResults(scrapyResults);
    
    console.log(`🕷️ Scrapy Extractor sonuç: ${extractedImages.length} görsel`);
    return extractedImages;
    
  } catch (error) {
    console.error('❌ Scrapy Extractor hatası:', error);
    return [];
  }
}

/**
 * Scrapy spider'ını çalıştırır
 */
async function runScrapySpider(url: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    // Scrapy projesini kopyala
    const scrapyDir = setupScrapyProject();
    
    // Özelleştirilmiş spider oluştur
    createCustomSpider(url, scrapyDir);
    
    // Scrapy komutunu çalıştır
    const scrapyProcess = spawn('python', ['-m', 'scrapy', 'crawl', 'custom_product_spider', '-o', 'output.json'], {
      cwd: scrapyDir,
      env: { ...process.env, PYTHONPATH: scrapyDir }
    });
    
    let output = '';
    let errorOutput = '';
    
    scrapyProcess.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    scrapyProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    scrapyProcess.on('close', (code) => {
      if (code === 0) {
        try {
          // JSON output dosyasını oku
          const outputFile = path.join(scrapyDir, 'output.json');
          if (fs.existsSync(outputFile)) {
            const jsonData = fs.readFileSync(outputFile, 'utf8');
            const results = JSON.parse(jsonData);
            resolve(results);
          } else {
            resolve([]);
          }
        } catch (error) {
          console.error('JSON parse hatası:', error);
          resolve([]);
        }
      } else {
        console.error('Scrapy hatası:', errorOutput);
        reject(new Error(`Scrapy process exited with code ${code}`));
      }
    });
    
    // Timeout
    setTimeout(() => {
      scrapyProcess.kill();
      reject(new Error('Scrapy timeout'));
    }, 30000);
  });
}

/**
 * Scrapy projesini hazırlar
 */
function setupScrapyProject(): string {
  const tempDir = path.join(process.cwd(), 'temp', 'scrapy_project');
  
  // Temp dizini oluştur
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  // Scrapy.cfg dosyası
  const scrapyCfg = `[settings]
default = trendyol_custom.settings

[deploy]
project = trendyol_custom
`;
  fs.writeFileSync(path.join(tempDir, 'scrapy.cfg'), scrapyCfg);
  
  // Python package dizini
  const packageDir = path.join(tempDir, 'trendyol_custom');
  if (!fs.existsSync(packageDir)) {
    fs.mkdirSync(packageDir, { recursive: true });
  }
  
  const spidersDir = path.join(packageDir, 'spiders');
  if (!fs.existsSync(spidersDir)) {
    fs.mkdirSync(spidersDir, { recursive: true });
  }
  
  // __init__.py dosyaları
  fs.writeFileSync(path.join(packageDir, '__init__.py'), '');
  fs.writeFileSync(path.join(spidersDir, '__init__.py'), '');
  
  // Settings.py
  const settingsPy = `BOT_NAME = 'trendyol_custom'

SPIDER_MODULES = ['trendyol_custom.spiders']
NEWSPIDER_MODULE = 'trendyol_custom.spiders'

ROBOTSTXT_OBEY = False

USER_AGENT_LIST = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
]

DOWNLOAD_DELAY = 2
RANDOMIZE_DOWNLOAD_DELAY = 0.5

AUTOTHROTTLE_ENABLED = True
AUTOTHROTTLE_START_DELAY = 1
AUTOTHROTTLE_MAX_DELAY = 10
AUTOTHROTTLE_TARGET_CONCURRENCY = 1.0
AUTOTHROTTLE_DEBUG = False

DOWNLOADER_MIDDLEWARES = {
    'trendyol_custom.middlewares.RotateUserAgentMiddleware': 400,
}

CONCURRENT_REQUESTS = 1
CONCURRENT_REQUESTS_PER_DOMAIN = 1

DEFAULT_REQUEST_HEADERS = {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'DNT': '1',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
}
`;
  fs.writeFileSync(path.join(packageDir, 'settings.py'), settingsPy);
  
  // Middlewares.py
  const middlewaresPy = `import random
from scrapy.downloadermiddlewares.useragent import UserAgentMiddleware

class RotateUserAgentMiddleware(UserAgentMiddleware):
    def __init__(self, user_agent=''):
        self.user_agent = user_agent
        self.user_agent_list = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/121.0'
        ]

    def process_request(self, request, spider):
        ua = random.choice(self.user_agent_list)
        request.headers['User-Agent'] = ua
        return None
`;
  fs.writeFileSync(path.join(packageDir, 'middlewares.py'), middlewaresPy);
  
  return tempDir;
}

/**
 * Özelleştirilmiş spider oluşturur
 */
function createCustomSpider(url: string, scrapyDir: string): void {
  const spiderPy = `import scrapy
import json
import re
from urllib.parse import urljoin

class CustomProductSpider(scrapy.Spider):
    name = 'custom_product_spider'
    allowed_domains = ['trendyol.com']
    start_urls = ['${url}']
    
    def parse(self, response):
        images = []
        
        # 1. JSON-LD structured data'dan görselleri çıkar
        json_ld_scripts = response.xpath('//script[@type="application/ld+json"]/text()').getall()
        for script in json_ld_scripts:
            try:
                data = json.loads(script)
                if data.get('@type') == 'ProductGroup':
                    # Ana ürün görselleri
                    if 'image' in data and 'contentUrl' in data['image']:
                        content_urls = data['image']['contentUrl']
                        if isinstance(content_urls, list):
                            images.extend(content_urls)
                        else:
                            images.append(content_urls)
                    
                    # Varyant görselleri
                    if 'hasVariant' in data:
                        for variant in data['hasVariant']:
                            if 'image' in variant:
                                if isinstance(variant['image'], str):
                                    images.append(variant['image'])
                                elif isinstance(variant['image'], dict) and 'contentUrl' in variant['image']:
                                    images.append(variant['image']['contentUrl'])
                    
                    # İlişkili ürünlerden görseller
                    if 'isRelatedTo' in data:
                        for related_url in data['isRelatedTo'][:3]:  # İlk 3 tanesi
                            if isinstance(related_url, str):
                                yield scrapy.Request(
                                    url=related_url,
                                    callback=self.parse_related_product,
                                    meta={'images': images}
                                )
            except json.JSONDecodeError:
                continue
        
        # 2. HTML'den img etiketlerini çıkar
        img_urls = response.xpath('//img/@src | //img/@data-src').getall()
        for img_url in img_urls:
            if img_url and self.is_valid_product_image(img_url):
                full_url = urljoin(response.url, img_url)
                images.append(full_url)
        
        # 3. CSS selectors ile ürün galerisi görselleri
        gallery_images = response.css('div[class*="gallery"] img::attr(src), div[class*="product-image"] img::attr(src)').getall()
        for img in gallery_images:
            if img and self.is_valid_product_image(img):
                full_url = urljoin(response.url, img)
                images.append(full_url)
        
        # 4. Data attributes'lerden görseller
        data_images = response.xpath('//*[@data-image-url]/@data-image-url | //*[@data-img]/@data-img').getall()
        for img in data_images:
            if img and self.is_valid_product_image(img):
                full_url = urljoin(response.url, img)
                images.append(full_url)
        
        # Duplicate'leri kaldır
        unique_images = list(set(images))
        
        # Sonuçları yield et
        for image_url in unique_images:
            yield {
                'url': response.url,
                'image_url': image_url,
                'source': 'main_product'
            }
    
    def parse_related_product(self, response):
        images = response.meta.get('images', [])
        
        # İlişkili ürünlerden JSON-LD görselleri çıkar
        json_ld_scripts = response.xpath('//script[@type="application/ld+json"]/text()').getall()
        for script in json_ld_scripts:
            try:
                data = json.loads(script)
                if data.get('@type') == 'ProductGroup' and 'image' in data:
                    if 'contentUrl' in data['image']:
                        content_urls = data['image']['contentUrl']
                        if isinstance(content_urls, list):
                            for img_url in content_urls[:2]:  # İlk 2 görsel
                                yield {
                                    'url': response.url,
                                    'image_url': img_url,
                                    'source': 'related_product'
                                }
                        else:
                            yield {
                                'url': response.url,
                                'image_url': content_urls,
                                'source': 'related_product'
                            }
            except json.JSONDecodeError:
                continue
    
    def is_valid_product_image(self, url):
        if not url or not isinstance(url, str):
            return False
        
        return (
            'cdn.dsmcdn.com' in url and
            any(ext in url.lower() for ext in ['.jpg', '.jpeg', '.png', '.webp']) and
            not any(exclude in url.lower() for exclude in ['badge', 'icon', 'logo', 'sprite'])
        )
`;
  
  const spidersDir = path.join(scrapyDir, 'trendyol_custom', 'spiders');
  fs.writeFileSync(path.join(spidersDir, 'custom_product_spider.py'), spiderPy);
}

/**
 * Scrapy sonuçlarını işler
 */
function processScrapyResults(results: any[]): string[] {
  const images: string[] = [];
  
  results.forEach(item => {
    if (item.image_url && typeof item.image_url === 'string') {
      if (!images.includes(item.image_url)) {
        images.push(item.image_url);
      }
    }
  });
  
  return images;
}