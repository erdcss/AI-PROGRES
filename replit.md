# Trendyol to Shopify Product Converter

## Overview
This application is a comprehensive e-commerce product data conversion tool. It extracts product information from Trendyol (a Turkish e-commerce platform) and converts it into a Shopify-compatible CSV format. The system leverages advanced web scraping, AI-powered data enhancement, and multiple extraction strategies to ensure high-quality product data conversion. Its main purpose is to streamline the process of transferring product listings from Trendyol to Shopify, enabling businesses to easily expand their online presence.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application features a full-stack architecture with clear separation of concerns.

**Frontend**: A React-based Single Page Application (SPA) built with TypeScript, Vite, Radix UI for components, and TailwindCSS for styling. React Query manages state and API calls.

**Backend**: An Express.js server developed with TypeScript, providing RESTful API endpoints for product extraction and conversion. It incorporates multiple extraction strategies enhanced by AI.

**Database**: PostgreSQL is used for data storage and caching, with Drizzle ORM for database operations. It supports product data storage, user history tracking, and variant/attribute management.

**Core System Design**:
- **Product Data Extraction**: Utilizes a multi-strategy approach combining Puppeteer, Cheerio, and direct API calls, along with AI (Anthropic Claude) for data enhancement and real-time stock detection. Fallback mechanisms ensure high success rates.
- **Image Processing**: Extracts all product images, including variants, optimizing URLs and mapping images to specific color/size combinations. It includes CDN pattern analysis for additional images.
- **CSV Generation**: Produces Shopify-compatible CSV files with correct variant handling and batch processing capabilities.
- **AI Integration**: Implements AI for product categorization, content enhancement (descriptions, SEO), quality validation, and intelligent feature extraction.
- **Scenario-based Scraper**: The system reorganizes around a scenario-based architecture (e.g., single-variant, multi-size, multi-color), where a ScenarioManager detects extraction scenarios, and ScenarioExtractors handle specialized extraction with confidence scoring.
- **Platform-Specific Extraction**: Supports extraction from both Trendyol and Arçelik, with dedicated branding and optimized extraction logic for each platform.
- **UI/UX Decisions**: The application features a responsive design, clear product display layouts (e.g., horizontal layout for product transfer page), and interactive elements like image previews and thumbnail navigation. It emphasizes a compact and user-friendly interface.
- **Automated Monitoring System**: Comprehensive hourly price monitoring with Telegram notifications, integrated with daily scheduled tasks (08:00 analysis, 12:00 updates, 23:00 reports). The system uses simple-scheduler for task management and filtered-telegram-notifier for targeted alerts.
- **Enhanced Color Detection System** (August 2025): Implemented intelligent color detection with multiple fallback strategies including script analysis, DOM inspection, and URL parsing. System now prioritizes authentic color data and avoids false color detection.
- **Improved Stock Management**: Advanced stock checking algorithms that validate availability through button states, script data, and HTML patterns. Provides accurate in-stock/out-of-stock status for size variants.
- **UI Terminology Updates**: Changed user interface from "Renk" (Color) to "Ürün" (Product) terminology for better user understanding. Updated button text to "SHOPIFY'A AKTAR" for clearer action indication.
- **Fake Variant Data Removal** (August 2025): Completely disabled automatic fake variant generation in extractEnhancedVariants function. System now returns empty variant arrays instead of generating misleading size/color combinations that don't exist.
- **Enhanced Product Features Extraction** (August 2025): Improved feature extraction system with additional selectors for Turkish e-commerce patterns, category detection from breadcrumbs, brand information extraction, and product code/SKU identification. Increased feature limit to 20 items.
- **CSV Preview UI Optimization**: Implemented ultra-compact CSV preview cards with aggressive text truncation, minimized badge sizes, removed button text (icons only), and title length limits to prevent overflow issues.
- **Comprehensive Fake Size Data Elimination** (August 2025): Systematically removed all hardcoded 'S', 'M', 'L' size generation across entire system. Updated multi-variant CSV generator, Shopify API uploader, scenario extractors, and all variant processing modules to only use authentic product data.
- **Image Upload Debugging Enhancement** (August 2025): Added comprehensive image validation and logging throughout Shopify upload process. Implemented URL validation, position tracking, and detailed response monitoring to troubleshoot image upload failures.
- **Enhanced Product Preview UI** (August 2025): Added 300x100 product preview cards above CSV listings with image slider, price comparison (original vs 10% markup), and dynamic variant information display.
- **Advanced Price Extraction** (August 2025): Improved CSV price parsing with multiple fallback strategies including header-based detection and title price extraction for accurate pricing information in product previews.
- **Complete Fake Variant Elimination** (August 2025): Disabled all remaining hardcoded size generation across focused-extractor, working-variant-extractor, and scenario-based systems. System now exclusively uses authentic product data from actual e-commerce sources.
- **Critical Image System Fix** (August 12, 2025): Resolved complete image upload failure to Shopify by fixing data format incompatibility between scenario-based scraper and CSV generator. Implemented unified image format with {url, colorName, position, alt} structure.
- **Enhanced Price Processing System** (August 12, 2025): Fixed critical price calculation bugs including kuruş/TL conversion (>1000 values), minimum price enforcement (>1 TL), profit margin calculation accuracy, and compare price generation with 2-decimal precision.
- **Critical Shopify Upload Fix** (August 13, 2025): Resolved product upload failures by removing metafield from initial product creation request. Products now successfully upload to Shopify with correct pricing, images, and variants. Metafields are added separately after product creation.
- **Comprehensive Price Correction System** (August 12, 2025): Implemented intelligent price correction for Turkish e-commerce kuruş/TL conversion issues. System now correctly handles 950 kuruş → 950 TL and 24960 kuruş → 24960 TL conversions based on user expectations. Fixed CSV compare price generation to use corrected original prices without double conversion.
- **Real-time URL Tracking System** (August 12, 2025): Implemented comprehensive URL tracking with PostgreSQL database storage. URLs are automatically monitored every 5 minutes, price changes are detected and stored in history. Telegram notifications are sent for all price changes with detailed information including percentage change and price difference.
- **Dynamic Product Color Detection** (August 12, 2025): Replaced "Standart" color labels with intelligent color extraction from product titles, descriptions, and metadata. System now detects Turkish color names (Altın, Siyah, Beyaz, etc.) and specific product characteristics (14 Ayar Altın) for accurate product categorization.
- **Enhanced JSON-LD Variant Detection** (August 12, 2025): Implemented comprehensive JSON-LD structured data extraction for variant detection. System now successfully captures both colors and sizes from Trendyol's hasVariant arrays, including measurement-based sizes (e.g., "42 cm"). Multi-source extraction combines DOM selectors, JavaScript data, and JSON-LD structured data for maximum accuracy.
- **Automatic URL Tracking Integration** (August 12, 2025): Implemented automatic URL tracking for all processed products. Every scraped URL and Shopify upload automatically triggers tracking activation with 5-minute price monitoring intervals. Real-time Telegram notifications for price changes include detailed change percentage, price difference, and timestamp. System supports both manual and automatic tracking modes with comprehensive error handling.
- **Comprehensive Shopify Product Lifecycle Tracking** (August 12, 2025): Implemented complete Shopify product tracking system with shopifyTransferredProducts and shopifyProductChanges database tables. System automatically registers all Shopify transfers, tracks every change (price, stock, status, content, variant), and provides real-time monitoring with 5-minute checks. Features include severity-based notifications, detailed change history, comprehensive statistics, and automated hourly/daily reports via Telegram. Frontend interface at /shopify-tracking provides real-time dashboard with product overview, change tracking, and system status monitoring.
- **Unique Tracking ID via Shopify Metafields** (August 13, 2025): Implemented unique product tracking IDs using Shopify custom metafields (custom.repli_t_id). System generates unique IDs for each product and includes them in CSV exports as "Metafield: custom.repli_t_id [single_line_text_field]" column. IDs are sent via API when creating products, enabling tracking through Shopify admin panel. Updated csv-generator.ts, multi-variant-csv-generator.ts, shopify-api-uploader.ts, and shopify-integration.ts to support metafield handling. Using repli_t_id key for proper CSV header formatting. Added separate metafield API call after product creation for better reliability. Updated API version to 2024-01 for improved metafield support.
- **Mobile-Responsive T Bot AI Interface** (August 12, 2025): Completely optimized T Bot AI assistant component for mobile devices. Reduced container width from 480px to 300px on mobile, compressed heights from 600px to 450px, minimized header padding and icon sizes, simplified tab labels for mobile (Chat/Nav/Aksiyon), and optimized float button positioning. Enhanced responsive design ensures seamless user experience across all device sizes while maintaining full functionality.
- **Critical Price Precision Fix** (August 12, 2025): Resolved decimal precision loss in price extraction system. Fixed Math.round() truncation issue in fixed-authentic-scraper.ts and scenario-based-scraper.ts by implementing Math.round(price * 100) / 100 preservation method. Added DOM-first extraction strategy for Turkish decimal prices (67,13 TL pattern). System now accurately extracts 67.13 TL instead of 67 TL, ensuring precise price tracking and Telegram notifications.
- **Ultimate Price Extractor System** (August 13, 2025): Completely rebuilt price extraction architecture with comprehensive multi-strategy approach. New system tests 6 different extraction methods (DOM selectors, JSON-LD structured data, script parsing, advanced selectors, regex patterns, meta tags), compares all results, and selects the most accurate price. Fixed critical price accuracy issues by prioritizing JSON-LD structured data over DOM elements. System now correctly extracts 65.72 TL instead of incorrect 93.06 TL from same product page. Implemented intelligent price comparison logic that filters reasonable price ranges and selects lowest authentic price. All extraction strategies run independently and results are analyzed for optimal accuracy.
- **Critical Price Selection Algorithm Fix** (August 13, 2025): Fixed major price extraction error where system would choose incorrect lower prices (25 TL instead of 479.90 TL for Oral-B products). Changed algorithm to select HIGHEST reasonable price instead of lowest to avoid incorrect discount prices. Expanded reasonable price range from 10-500 TL to 10-100000 TL to support expensive items. System now correctly extracts 449 TL for Oral-B products.

## External Dependencies

- **Drizzle ORM**: For database interactions.
- **Anthropic SDK**: For AI-powered data analysis and enhancement.
- **Puppeteer**: For advanced web scraping and bypassing bot detection.
- **Cheerio**: For HTML parsing and DOM manipulation.
- **Axios**: For HTTP requests with retry logic.
- **Radix UI**: Frontend component library.
- **TailwindCSS**: Frontend styling framework.
- **React Hook Form**: For form state management.
- **Zod**: For runtime type validation.
- **Telegram Integration**: For real-time notifications and monitoring.
- **Email Service**: For automated reporting and alerts.
- **Monitoring System**: For performance tracking and error detection.