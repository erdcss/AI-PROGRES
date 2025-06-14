
import scrapy
import json
import re
from urllib.parse import urljoin

class TrendyolSpider(scrapy.Spider):
    name = "urun_gorseli"
    allowed_domains = ["trendyol.com"]
    
    def __init__(self, start_urls=None, *args, **kwargs):
        super(TrendyolSpider, self).__init__(*args, **kwargs)
        if start_urls:
            self.start_urls = [start_urls] if isinstance(start_urls, str) else start_urls
        else:
            self.start_urls = ["https://www.trendyol.com/sr?q=telefon"]

    def parse(self, response):
        # Tek ürün sayfasıysa direkt parse et
        if '/p-' in response.url:
            yield from self.parse_product(response)
        else:
            # Arama sayfasıysa ürünleri bul
            for product in response.css("div.p-card-wrppr"):
                product_url = product.css("a::attr(href)").get()
                if product_url:
                    yield response.follow(product_url, callback=self.parse_product)

    def parse_product(self, response):
        """Ürün sayfasından detaylı bilgi çıkar"""
        
        # Başlık
        title = (
            response.css('[data-testid="product-name"]::text').get() or
            response.css('.pr-new-br-nm::text').get() or
            response.css('.product-brand span::text').get() or
            response.css('h1::text').get() or
            ""
        ).strip()
        
        # Fiyat
        price = (
            response.css('[data-testid="price-current"]::text').get() or
            response.css('.prc-dsc::text').get() or
            response.css('.product-price-container .prc-dsc::text').get() or
            ""
        ).strip()
        
        # Marka
        brand = (
            response.css('[data-testid="product-brand"]::text').get() or
            response.css('.product-title-brand span::text').get() or
            response.css('.prdct-desc-cntnr-ttl::text').get() or
            "turmarkt"
        ).strip()
        
        # Açıklama
        description = (
            response.css('[data-testid="product-description"]::text').get() or
            response.css('.description-text::text').get() or
            response.css('.detail-desc-list::text').get() or
            title
        ).strip()
        
        # Gelişmiş görsel çıkarma
        images = self.extract_enhanced_images(response)
        
        yield {
            "title": title,
            "price": price,
            "brand": brand,
            "description": description,
            "images": images,
            "url": response.url
        }
    
    def extract_enhanced_images(self, response):
        """Gelişmiş görsel çıkarma sistemi"""
        images = set()
        
        # 1. JSON-LD structured data'dan görsel çıkar
        json_ld_scripts = response.css('script[type="application/ld+json"]::text').getall()
        for script in json_ld_scripts:
            try:
                data = json.loads(script)
                if isinstance(data, dict):
                    # Product schema
                    if data.get('@type') == 'Product':
                        img_data = data.get('image', [])
                        if isinstance(img_data, list):
                            images.update(img_data)
                        elif isinstance(img_data, str):
                            images.add(img_data)
                    
                    # WebPage schema içindeki görseller
                    main_entity = data.get('mainEntity', {})
                    if isinstance(main_entity, dict) and main_entity.get('@type') == 'Product':
                        img_data = main_entity.get('image', [])
                        if isinstance(img_data, list):
                            images.update(img_data)
                        elif isinstance(img_data, str):
                            images.add(img_data)
            except (json.JSONDecodeError, AttributeError):
                continue
        
        # 2. Doğrudan img etiketlerinden görsel çıkar
        img_selectors = [
            '[data-testid="product-image"] img::attr(src)',
            '[data-testid="product-gallery"] img::attr(src)',
            '.product-slide img::attr(src)',
            '.slick-slide img::attr(src)',
            '.gallery-modal img::attr(src)',
            '.product-gallery img::attr(src)',
            '.product-images img::attr(src)',
            '.image-gallery img::attr(src)',
            '.product-detail-images img::attr(src)',
            '.prd-img img::attr(src)',
            '.product-photo img::attr(src)',
            'img[src*="product/media"]::attr(src)',
            'img[src*="ty"]::attr(src)',
            'img[data-src*="product"]::attr(data-src)',
            '.swiper-slide img::attr(src)',
            '.thumbnail img::attr(src)',
            '.main-image img::attr(src)'
        ]
        
        for selector in img_selectors:
            img_urls = response.css(selector).getall()
            for url in img_urls:
                if url:
                    # Relative URL'leri absolute'a çevir
                    absolute_url = urljoin(response.url, url)
                    images.add(absolute_url)
        
        # 3. data-src attributelerini de kontrol et
        data_src_imgs = response.css('img[data-src]::attr(data-src)').getall()
        for url in data_src_imgs:
            if url and ('product' in url or 'ty' in url):
                absolute_url = urljoin(response.url, url)
                images.add(absolute_url)
        
        # 4. JavaScript içindeki görsel URL'lerini çıkar
        scripts = response.css('script::text').getall()
        for script in scripts:
            # Regex ile görsel URL'lerini bul
            img_patterns = [
                r'"(https://cdn\.dsmcdn\.com/[^"]*\.(?:jpg|jpeg|png|webp))"',
                r"'(https://cdn\.dsmcdn\.com/[^']*\.(?:jpg|jpeg|png|webp))'",
                r'(https://cdn\.dsmcdn\.com/\S+\.(?:jpg|jpeg|png|webp))'
            ]
            
            for pattern in img_patterns:
                matches = re.findall(pattern, script, re.IGNORECASE)
                images.update(matches)
        
        # Görselleri filtrele ve sırala
        filtered_images = self.filter_and_sort_images(list(images))
        
        return filtered_images
    
    def filter_and_sort_images(self, images):
        """Görselleri filtrele ve kaliteye göre sırala"""
        
        # Logo ve gereksiz görselleri filtrele
        blacklist = [
            'logo', 'icon', 'badge', 'sprite', 'placeholder', 'avatar',
            'ty-web.svg', 'favicon', 'button', 'arrow', 'star', 'rating',
            'social', 'payment', 'delivery', 'security', 'banner', 'advertisement',
            'default-thumb', 'basketPreview', 'master/', 'web/master', 'web/logo',
            'sticker', 'etiket', 'kampanya', 'overlay', 'text-label', 'stamp',
            'indexing-sticker', 'authorized-seller', 'free-shipping', 'shipping-icon'
        ]
        
        valid_images = []
        for img in images:
            if not img or not isinstance(img, str):
                continue
                
            img_lower = img.lower()
            
            # CDN kontrolü
            if 'cdn.dsmcdn.com' not in img:
                continue
            
            # Blacklist kontrolü
            if any(term in img_lower for term in blacklist):
                continue
            
            # Ürün görseli pattern kontrolü
            if any(pattern in img for pattern in ['product/media/images/', '_org_zoom', '/prod/']):
                valid_images.append(img)
        
        # Duplicate'leri kaldır
        unique_images = list(set(valid_images))
        
        # Kaliteye göre sırala
        def quality_score(img):
            score = 0
            if '_org_zoom' in img:
                score += 100
            if '/1200/1800/' in img or 'mnresize/1200' in img:
                score += 50
            if '.jpg' in img:
                score += 20
            if '.webp' in img:
                score += 10
            return score
        
        sorted_images = sorted(unique_images, key=quality_score, reverse=True)
        
        # En kaliteli 5 görseli al
        return sorted_images[:5]
