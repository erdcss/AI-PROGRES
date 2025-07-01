/**
 * Standalone Scrapy Image Extractor
 * Direct Python script execution for enhanced image extraction
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export async function extractImagesWithStandaloneScrapy(url: string): Promise<string[]> {
  console.log('🕷️ Standalone Scrapy Extractor başlatılıyor...');
  
  try {
    // Create standalone Python script
    const pythonScript = createStandalonePythonScript(url);
    const scriptPath = path.join(process.cwd(), 'temp', 'scrapy_standalone.py');
    
    // Ensure temp directory exists
    const tempDir = path.dirname(scriptPath);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Write Python script
    fs.writeFileSync(scriptPath, pythonScript);
    
    // Execute Python script
    const results = await executeStandalonePython(scriptPath);
    
    // Parse results
    const images = parseScrapyResults(results);
    
    console.log(`🕷️ Standalone Scrapy Extractor sonuç: ${images.length} görsel`);
    return images;
    
  } catch (error) {
    console.error('❌ Standalone Scrapy Extractor hatası:', error);
    return [];
  }
}

/**
 * Creates standalone Python script for image extraction
 */
function createStandalonePythonScript(url: string): string {
  return `#!/usr/bin/env python3
import requests
import json
import re
import time
import random
from urllib.parse import urljoin, urlparse
from fake_useragent import UserAgent

class TrendyolImageExtractor:
    def __init__(self):
        self.session = requests.Session()
        self.ua = UserAgent()
        self.setup_session()
    
    def setup_session(self):
        """Setup session with rotating user agents and headers"""
        self.session.headers.update({
            'User-Agent': self.ua.random,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none'
        })
    
    def extract_images(self, url):
        """Extract images from Trendyol product page"""
        images = []
        
        try:
            # Add random delay to avoid detection
            time.sleep(random.uniform(1, 3))
            
            # Make request with retry mechanism
            response = self.make_request(url)
            if not response:
                return images
            
            html = response.text
            
            # Extract images using multiple methods
            images.extend(self.extract_from_json_ld(html))
            images.extend(self.extract_from_html_patterns(html))
            images.extend(self.extract_from_data_attributes(html))
            images.extend(self.extract_from_script_tags(html))
            
            # Remove duplicates and filter valid images
            unique_images = list(set(images))
            valid_images = [img for img in unique_images if self.is_valid_image(img)]
            
            return valid_images
            
        except Exception as e:
            print(f"Error extracting images: {e}")
            return images
    
    def make_request(self, url, retries=3):
        """Make HTTP request with retry mechanism"""
        for attempt in range(retries):
            try:
                # Rotate user agent for each attempt
                self.session.headers['User-Agent'] = self.ua.random
                
                response = self.session.get(url, timeout=15, allow_redirects=True)
                
                if response.status_code == 200:
                    return response
                elif response.status_code == 429:
                    # Rate limited, wait longer
                    time.sleep(random.uniform(5, 10))
                else:
                    print(f"HTTP {response.status_code} for {url}")
                    
            except Exception as e:
                print(f"Request attempt {attempt + 1} failed: {e}")
                if attempt < retries - 1:
                    time.sleep(random.uniform(2, 5))
        
        return None
    
    def extract_from_json_ld(self, html):
        """Extract images from JSON-LD structured data"""
        images = []
        
        # Find JSON-LD scripts
        json_ld_pattern = r'<script type="application/ld\+json"[^>]*>(.*?)</script>'
        scripts = re.findall(json_ld_pattern, html, re.DOTALL)
        
        for script in scripts:
            try:
                data = json.loads(script.strip())
                
                # ProductGroup type
                if data.get('@type') == 'ProductGroup':
                    # Main product images
                    if 'image' in data and 'contentUrl' in data['image']:
                        content_urls = data['image']['contentUrl']
                        if isinstance(content_urls, list):
                            images.extend(content_urls)
                        else:
                            images.append(content_urls)
                    
                    # Variant images
                    if 'hasVariant' in data:
                        for variant in data['hasVariant']:
                            if 'image' in variant:
                                if isinstance(variant['image'], str):
                                    images.append(variant['image'])
                                elif isinstance(variant['image'], dict) and 'contentUrl' in variant['image']:
                                    images.append(variant['image']['contentUrl'])
                
                # Product type
                elif data.get('@type') == 'Product':
                    if 'image' in data:
                        if isinstance(data['image'], str):
                            images.append(data['image'])
                        elif isinstance(data['image'], dict) and 'url' in data['image']:
                            images.append(data['image']['url'])
                        elif isinstance(data['image'], list):
                            for img in data['image']:
                                if isinstance(img, str):
                                    images.append(img)
                                elif isinstance(img, dict) and 'url' in img:
                                    images.append(img['url'])
                
            except json.JSONDecodeError:
                continue
        
        return images
    
    def extract_from_html_patterns(self, html):
        """Extract images using regex patterns"""
        images = []
        
        # Common Trendyol image URL patterns
        patterns = [
            r'https://cdn\\.dsmcdn\\.com/ty\\d+/prod/QC/\\d+/\\d+/[a-f0-9-]+/\\d+_org_zoom\\.jpg',
            r'https://cdn\\.dsmcdn\\.com/ty\\d+/prod/QC/\\d+/\\d+/[a-f0-9-]+/\\d+_org\\.jpg',
            r'https://cdn\\.dsmcdn\\.com/ty\\d+/product/media/images/\\d+/\\d+/\\d+/[a-f0-9-]+\\.jpg',
            r'https://cdn\\.dsmcdn\\.com/[^"\\s]+\\.(jpg|jpeg|png|webp)',
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, html, re.IGNORECASE)
            if isinstance(matches[0], tuple) if matches else False:
                # Handle tuple results from groups
                images.extend([match[0] if isinstance(match, tuple) else match for match in matches])
            else:
                images.extend(matches)
        
        return images
    
    def extract_from_data_attributes(self, html):
        """Extract images from data attributes"""
        images = []
        
        # Data attribute patterns
        data_patterns = [
            r'data-src="([^"]*cdn\\.dsmcdn\\.com[^"]*\\.(jpg|jpeg|png|webp)[^"]*)"',
            r'data-image="([^"]*cdn\\.dsmcdn\\.com[^"]*\\.(jpg|jpeg|png|webp)[^"]*)"',
            r'data-original="([^"]*cdn\\.dsmcdn\\.com[^"]*\\.(jpg|jpeg|png|webp)[^"]*)"',
            r'data-lazy="([^"]*cdn\\.dsmcdn\\.com[^"]*\\.(jpg|jpeg|png|webp)[^"]*)"'
        ]
        
        for pattern in data_patterns:
            matches = re.findall(pattern, html, re.IGNORECASE)
            for match in matches:
                images.append(match[0] if isinstance(match, tuple) else match)
        
        return images
    
    def extract_from_script_tags(self, html):
        """Extract images from JavaScript variables in script tags"""
        images = []
        
        # Look for image URLs in script tags
        script_pattern = r'<script[^>]*>(.*?)</script>'
        scripts = re.findall(script_pattern, html, re.DOTALL)
        
        for script in scripts:
            # Look for image URL patterns in JavaScript
            js_image_patterns = [
                r'"(https://cdn\\.dsmcdn\\.com[^"]*\\.(jpg|jpeg|png|webp)[^"]*)"',
                r"'(https://cdn\\.dsmcdn\\.com[^']*\\.(jpg|jpeg|png|webp)[^']*)'",
                r'url\\s*:\\s*"([^"]*cdn\\.dsmcdn\\.com[^"]*\\.(jpg|jpeg|png|webp)[^"]*)"'
            ]
            
            for pattern in js_image_patterns:
                matches = re.findall(pattern, script, re.IGNORECASE)
                for match in matches:
                    images.append(match[0] if isinstance(match, tuple) else match)
        
        return images
    
    def is_valid_image(self, url):
        """Check if URL is a valid product image"""
        if not url or not isinstance(url, str):
            return False
        
        # Must be from Trendyol CDN
        if 'cdn.dsmcdn.com' not in url:
            return False
        
        # Must be an image file
        if not any(ext in url.lower() for ext in ['.jpg', '.jpeg', '.png', '.webp']):
            return False
        
        # Exclude non-product images
        exclude_keywords = ['badge', 'icon', 'logo', 'sprite', 'placeholder', 'avatar']
        if any(keyword in url.lower() for keyword in exclude_keywords):
            return False
        
        # Must be properly formatted URL
        try:
            parsed = urlparse(url)
            return bool(parsed.scheme and parsed.netloc)
        except:
            return False

def main():
    """Main execution function"""
    url = "${url}"
    
    extractor = TrendyolImageExtractor()
    images = extractor.extract_images(url)
    
    # Output results as JSON
    result = {
        "url": url,
        "images": images,
        "count": len(images)
    }
    
    print(json.dumps(result, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
`;
}

/**
 * Execute standalone Python script
 */
async function executeStandalonePython(scriptPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const pythonProcess = spawn('python', [scriptPath], {
      env: { ...process.env, PYTHONPATH: process.cwd() }
    });
    
    let output = '';
    let errorOutput = '';
    
    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    pythonProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    pythonProcess.on('close', (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        console.error('Python script error:', errorOutput);
        reject(new Error(`Python script exited with code ${code}`));
      }
    });
    
    // Timeout after 30 seconds
    setTimeout(() => {
      pythonProcess.kill();
      reject(new Error('Python script timeout'));
    }, 30000);
  });
}

/**
 * Parse Scrapy results from JSON output
 */
function parseScrapyResults(output: string): string[] {
  try {
    const lines = output.trim().split('\n');
    const jsonLine = lines.find(line => line.trim().startsWith('{'));
    
    if (jsonLine) {
      const result = JSON.parse(jsonLine);
      return result.images || [];
    }
    
    return [];
  } catch (error) {
    console.error('Error parsing Scrapy results:', error);
    return [];
  }
}