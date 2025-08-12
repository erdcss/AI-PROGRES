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
- **Comprehensive Price Correction System** (August 12, 2025): Implemented intelligent price correction for Turkish e-commerce kuruş/TL conversion issues. System now correctly handles 950 kuruş → 950 TL and 24960 kuruş → 24960 TL conversions based on user expectations. Fixed CSV compare price generation to use corrected original prices without double conversion.

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