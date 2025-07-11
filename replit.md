# Trendyol to Shopify Product Converter

## Overview

This application is a comprehensive e-commerce product data conversion tool that extracts product information from Trendyol (Turkish e-commerce platform) and converts it to Shopify-compatible CSV format. The system uses advanced web scraping techniques, AI-powered data enhancement, and multiple extraction strategies to ensure high-quality product data conversion.

## System Architecture

The application follows a full-stack architecture with clear separation of concerns:

**Frontend**: React-based SPA with TypeScript
- Built with Vite for fast development and optimized builds
- Uses Radix UI components for consistent interface
- TailwindCSS for styling with custom theming support
- React Query for state management and API calls

**Backend**: Express.js server with TypeScript
- RESTful API endpoints for product extraction and conversion
- Multiple extraction strategies with AI enhancement
- PostgreSQL database with Drizzle ORM
- File generation and download capabilities

**Database**: PostgreSQL with Drizzle ORM
- Product data storage and caching
- User history tracking
- Variant and attribute management

## Key Components

### Product Data Extraction System
- **Multi-strategy scraping**: Combines Puppeteer, Cheerio, and direct API calls
- **AI-powered enhancement**: Uses Anthropic Claude for intelligent data analysis
- **Fallback mechanisms**: Multiple extraction methods ensure high success rates
- **Real-time stock detection**: Identifies actual product availability

### Image Processing Pipeline
- **Comprehensive image extraction**: Captures all product images including variants
- **Quality optimization**: Filters and optimizes image URLs for e-commerce use
- **Variant-specific images**: Maps images to specific color/size combinations
- **CDN pattern analysis**: Discovers additional images through URL pattern matching

### CSV Generation Engine
- **Shopify compatibility**: Generates properly formatted CSV files for direct import
- **Variant handling**: Correctly structures product variants with options
- **Batch processing**: Supports multiple products in single CSV export
- **Real-time generation**: Instant CSV creation with download capability

### AI Integration Layer
- **Product categorization**: Automatic category detection and mapping
- **Content enhancement**: AI-generated descriptions and SEO optimization
- **Quality validation**: AI-powered data verification and cleanup
- **Intelligent feature extraction**: Smart identification of product attributes

## Data Flow

1. **URL Input**: User provides Trendyol product URL
2. **Multi-Strategy Extraction**: System attempts various scraping methods
3. **AI Enhancement**: Raw data is processed and enhanced using Claude
4. **Quality Validation**: Data is verified for completeness and accuracy
5. **CSV Generation**: Product data is formatted for Shopify import
6. **Storage**: Processed data is cached for future use

## External Dependencies

### Core Dependencies
- **Drizzle ORM**: Database operations and schema management
- **Anthropic SDK**: AI-powered data analysis and enhancement
- **Puppeteer**: Advanced web scraping and bot detection bypass
- **Cheerio**: HTML parsing and DOM manipulation
- **Axios**: HTTP requests with retry logic

### UI Dependencies
- **Radix UI**: Component library for consistent interfaces
- **TailwindCSS**: Utility-first CSS framework
- **React Hook Form**: Form state management
- **Zod**: Runtime type validation

### Additional Services
- **Telegram Integration**: Real-time notifications and monitoring
- **Email Service**: Automated reporting and alerts
- **Monitoring System**: Performance tracking and error detection

## Deployment Strategy

The application is designed for deployment on Replit with the following considerations:

1. **Environment Variables**: All sensitive data stored in environment variables
2. **Database**: PostgreSQL connection via DATABASE_URL
3. **Static Assets**: Built files served from dist/public
4. **API Routes**: RESTful endpoints under /api prefix
5. **File Storage**: Temporary CSV files in memory or local storage

## Changelog

- July 03, 2025: Initial setup
- July 03, 2025: Advanced Turkish price extraction system implemented with smart selection algorithm that prioritizes ideal-range frequent prices over extremes
- July 04, 2025: Fixed Authentic Scraper successfully implemented and integrated as primary extraction method
- July 04, 2025: Hex color variant system completed with proper colorCode field mapping (#049B24, #000000)
- July 04, 2025: Accurate price detection achieved for 3199 TL products with 15% profit margin calculation
- July 04, 2025: Broken authentic-trendyol-scraper replaced with working fixed-authentic-scraper in all endpoints
- July 04, 2025: Enhanced price detection system with JSON-LD structured data priority for all products
- July 04, 2025: Fixed frontend price display issues (4047 TL → 3679 TL) and decimal formatting errors
- July 04, 2025: Backend now returns proper price structure with original and profit prices separately
- July 04, 2025: Completely overhauled variant system from static hardcoded data to dynamic extraction of actual color and size options
- July 04, 2025: Enhanced color mapping system to handle Turkish color combinations like "Mavi/Yeşil"
- July 04, 2025: Fixed color mapping for "Kahve" (brown) - now correctly maps to #8B4513 instead of blue
- July 04, 2025: Enhanced variant extraction with multiple data sources (JSON-LD, DOM, script content) and quality filtering
- July 04, 2025: Comprehensive out-of-stock size detection system implemented with DOM analysis, script parsing, and visual indicators
- July 07, 2025: Fixed fake variant creation issue - system now only shows authentic variants when they actually exist, eliminating fake "Standart" color and "Tek Beden" size for products without variant options
- July 07, 2025: Complete mobile browser optimization implemented - responsive design for all components, compact mobile layout, smaller buttons and input fields, mobile-friendly navigation, condensed mobile clock display
- July 08, 2025: Enhanced variant detection system successfully implemented - now accurately extracts authentic size variants (S, M) from aria-label and title attributes, eliminating fake variant creation for products with real variant options
- July 08, 2025: Complete system reorganization to scenario-based architecture implemented - ScenarioManager detects extraction scenarios (single-variant, multi-size, multi-color, full-matrix, out-of-stock, complex-variants), ScenarioExtractors handle specialized extraction for each scenario, scenario-based scraper provides main integration point with confidence scoring and evidence tracking
- July 09, 2025: Major UI improvements implemented - redesigned product images section with responsive 3/4/6 column grid layout, hover effects with blue borders and scale animations, larger thumbnails with improved visual presentation, enhanced header design with icons and modern badge styling
- July 09, 2025: Advanced variant extraction system with comprehensive debug logging implemented - enhanced size detection with multiple selector patterns and HTML content analysis, intelligent color extraction from product titles with Turkish color mapping, improved stock status detection for accurate variant availability, eliminated static data fallback with authentic product data extraction
- July 10, 2025: Fake variant data elimination completed - system now returns empty variants when no authentic size/color options exist, preventing fake "Tek Beden" and "Standart" variants from being displayed, cleaner product display with conditional variant sections
- July 10, 2025: Image display area redesigned - organized card-based layout with proper numbering, aspect-ratio containers, hover effects, and better responsive grid system, removed duplicate image sections
- July 10, 2025: Scenario-based scraper image extraction fixed - updated image filtering logic to properly extract product images, now successfully extracts 7 images from Simtech ventilator product
- July 10, 2025: Comprehensive connection testing system implemented - created dedicated test endpoints for Telegram and Shopify connections with detailed status reporting, Shopify connection confirmed working, Telegram bot token needs updating
- July 10, 2025: Home page navigation issue resolved - fixed Button component wrapping inside Link causing navigation failure, separated home page route to show MainDashboard instead of ScraperPage, implemented proper routing structure with dedicated scraper routes
- July 10, 2025: Image display system completely redesigned - replaced problematic image proxy with URL display system, created comprehensive image preview interface showing extracted URLs with "Aç" buttons for direct access, implemented placeholder-based preview grid, eliminated image loading errors while maintaining full functionality for CSV export and Shopify integration
- July 10, 2025: Image preview system enhanced with actual product images - implemented real image previews in both main display and thumbnail grid, added interactive thumbnail navigation allowing users to click and change main image, maintained graceful error handling with fallback placeholders, preserved technical URL display for advanced users
- July 10, 2025: Smart placeholder preview system implemented - replaced direct image loading with intelligent placeholder previews due to Trendyol's CORS restrictions, created visually appealing product cards showing brand and product information, maintained all original image URLs for CSV export functionality, added "Güvenli Mod" indicator to inform users about the preview system
- July 10, 2025: Horizontal layout design implemented for product transfer page - redesigned interface with two-column layout (images on left, product details on right), integrated advanced feature extraction system with precise feature extractor and enhanced scraper fallbacks, restored comprehensive image extraction using complete-image-extractor module, organized product information display for better usability and cleaner presentation
- July 10, 2025: Enhanced image extraction system implemented - multi-method approach with CDN regex pattern matching, enhanced DOM selectors, JSON-LD structured data extraction, comprehensive feature extraction with product attributes, meta properties, and specification lists, direct variant extraction fallback system for authentic color and size detection
- July 10, 2025: Authentic-only variant extraction system implemented - enhanced size detection with comprehensive selectors (buttons, spans, divs, data attributes), JSON-LD structured data extraction, HTML pattern matching for real variant data, strict validation to prevent fake variants, system now returns empty arrays when no authentic variants exist instead of creating placeholder data
- July 10, 2025: Arçelik ürün çıkarma sistemi tamamlandı - Ana dashboard'a Arçelik seçeneği eklendi (yeşil tema), Trendyol ile aynı arayüz tasarımı uygulandı, Shopify'a direkt yükleme butonu eklendi, kapsamlı Arçelik API endpoint'i oluşturuldu, Puppeteer ve Cheerio ile çifte çıkarma stratejisi, otomatik Telegram bildirimleri aktiv
- July 10, 2025: Arçelik sayfası tamamen marka kimliğine uygun hale getirildi - Arçelik logosu ve yeşil tema renkleri uygulandı, beyaz eşya kategorilerine özel 8 kategori eklendi (Klima & Isıtma, Buzdolabı & Dondurucu, Çamaşır & Kurutma, Ankastre & Ocak, Bulaşık Makinesi, Elektrikli Süpürge, Kahve Makinesi, Küçük Ev Aletleri), Arçelik'e özel avantajlar ve sistem özellikleri bölümü eklendi, kullanım kılavuzu Arçelik'e özel olarak güncelendi, markaya uygun branding ve arayüz tasarımı tamamlandı
- July 11, 2025: Arçelik router problemi çözüldü - /arcelik rotası client/src/App.tsx dosyasına eklendi, Arçelik sayfası artık erişilebilir durumda, "HATA" sorunu giderildi, Arçelik branding tamamen uygulandı ve "Trendyol" referansları temizlendi, arcelik.com.tr domain doğrulaması aktiv, sistem hot reload ile güncellenmiş durumda
- July 11, 2025: Arçelik ürün çıkarma sistemi tamamen geliştirildi - Kapsamlı görsel çıkarma sistemi (135 adet görsel), detaylı özellik çıkarma (50+ özellik), CDN tabanlı görsel URL üretimi, meta etiket çıkarma, JSON-LD veri çıkarma, çoklu format desteği (JPG, PNG, WebP), çoklu boyut desteği (265x265, 400x400, 600x600), teknik özellik tanıma (voltaj, soğutucu akışkan, BTU), taksit bilgileri çıkarma, otomatik ürün kodu algılama, test URL başarıyla çıkarıldı (18325 Ekolojik Klima - 53,802 TL)
- July 11, 2025: Arçelik sayfası arcelik.com.tr için optimize edildi - URL doğrulama sistemi (sadece arcelik.com.tr kabul), gelişmiş arayüz tasarımı (Arçelik marka kimliği), 8 kategori rehberi (Klima, Buzdolabı, Çamaşır, Ankastre, Bulaşık, Süpürge, Kahve, Küçük Ev Aletleri), anlık hata uyarıları, Enter tuşu desteği, otomatik çıkarma sistemi (12 görsel + 81 özellik), SimpleProductPreview error düzeltmesi, syntax error çözümü
- July 11, 2025: Arçelik unhandled rejection hataları giderildi - Geliştirilmiş JSON-LD yapılandırılmış veri çıkarma sistemi, güvenli hafıza kaydetme ile hata kontrolü, 87 adet özellik + 8 adet görsel çıkarma başarımı, GTIN, boyutlar ve fiyat bilgileri çıkarma, platform-specific error handling, authentic data extraction enhancement

## User Preferences

Preferred communication style: Simple, everyday language.