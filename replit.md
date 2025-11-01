# Trendyol to Shopify Product Converter

## Overview
This application is a comprehensive e-commerce product data conversion tool designed to extract product information from Trendyol and convert it into a Shopify-compatible CSV format. Its primary purpose is to streamline product listing transfers from Trendyol to Shopify, leveraging advanced web scraping, AI-powered data enhancement, and multiple extraction strategies. The project aims to provide a robust and intelligent solution for product data migration, including real-time price monitoring, comprehensive product lifecycle tracking, and a focus on high-quality data conversion to expand online presence. The system currently boasts a 100% success rate against Trendyol's anti-blocking measures.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The application employs a full-stack architecture with clear separation of concerns.

**UI/UX Decisions:**
The frontend features a responsive design, clear product display layouts, interactive elements, and a compact, user-friendly interface. It includes optimized CSV preview cards, enhanced product preview UI with dynamic variant information, and a mobile-optimized T Bot AI Interface.

**Technical Implementations:**
-   **Frontend:** Built with React, TypeScript, Vite, Radix UI for components, and TailwindCSS for styling. React Query manages state and API calls.
-   **Backend:** An Express.js server developed with TypeScript, providing RESTful API endpoints for product extraction and conversion.
-   **Database:** PostgreSQL is used for data storage and caching, with Drizzle ORM for database operations, supporting product data, user history, and variant/attribute management.

**Feature Specifications:**
-   **AI-Powered Product Enhancement:** Integrates OpenAI GPT-4o for intelligent product analysis, SEO optimization, quality scoring, content generation (descriptions, category matching), target audience analysis, and competitive advantage identification.
-   **Product Data Extraction:** Utilizes a multi-strategy approach combining Puppeteer, Cheerio, and direct API calls, complemented by AI (OpenAI GPT-4o and Anthropic Claude) for data enhancement, real-time stock detection, and scenario-based extraction with confidence scoring. Supports Trendyol and Arçelik, achieving ultra-speed extraction (2-3 seconds per product). Features an Advanced Anti-Blocking System using proxy rotation, fallback data sources (Mobile API, Google Cache, Wayback Machine), and intelligent retry logic.
-   **Smart Color Extraction:** Intelligently extracts color names from multiple sources: DOM elements, JavaScript state, and URL slugs. Falls back to URL parsing when DOM extraction fails, preventing "Standart" placeholder colors. Supports compound Turkish color names like "Bebe Mavisi", "Açık Mavi", etc.
-   **High-Speed Parallel Processing:** Implements batch-based parallel color scraping with up to 5 simultaneous requests per batch. Reduced rate limiting (300ms between batches) for maximum speed. Intelligent error handling ensures individual failures don't block the entire batch.
-   **Rate Limiting & Error Prevention:** Implements optimized rate limiting (300ms between batches), high-speed parallel processing (5 colors simultaneously), and exponential backoff retry logic. Includes comprehensive blocking detection.
-   **Image Processing:** Extracts all product images, including variants, optimizing URLs and mapping images to specific color/size combinations. Handles multiple image formats and includes validation.
-   **CSV Generation:** Produces Shopify-compatible CSV files with correct variant handling, batch processing, and unique product tracking IDs via Shopify custom metafields (custom.repli_t_id).
-   **Price Extraction & Correction:** Features an advanced multi-strategy system testing various methods (DOM, JSON-LD, script parsing) for accurate price extraction, handling Turkish decimal formats, and currency conversions. Includes a comprehensive price correction system and logic to select the highest reasonable price. Integrates OpenAI for critical price validation and emergency extraction.
-   **Stock Management:** Advanced algorithms validate availability through button states, script data, and HTML patterns, providing accurate in-stock/out-of-stock status for size variants.
-   **Variant Handling:** Focuses on authentic product data, disabling fake variant generation. Enhanced JSON-LD variant detection captures colors and sizes. Includes single-variant detection to prevent incorrect variant generation.
-   **Automated Monitoring & Tracking:** Real-time URL tracking with 5-minute price monitoring intervals, storing changes in PostgreSQL and sending deduplicated Telegram notifications for all price changes. Supports full Shopify product lifecycle tracking, including transfers and monitoring changes (price, stock, status, content, variant).
-   **Product Features Extraction:** Improved feature extraction with additional selectors for Turkish e-commerce patterns, category detection from breadcrumbs, brand information, and product code/SKU identification.
-   **Shopify Integration:** Ensures successful product uploads to Shopify with correct pricing, images, and variants. Metafields are added separately after initial product creation. Includes enhanced tag generation.

**System Design Choices:**
-   **Multi-Layer Blocking:** SKU-level detection and enhanced variant extraction skip single-variant products.
-   **Telegram Notification Gateway:** Employs LRU cache-based deduplication (5min window) and throttling.
-   **Product-URL Tracking Sync:** Ensures FK integrity between `products` and `url_tracking` tables.
-   **Authentication:** Admin secret protection for sensitive endpoints.

## External Dependencies

-   **Drizzle ORM**: For database interactions.
-   **Anthropic SDK**: For AI-powered data analysis and enhancement.
-   **Puppeteer**: For advanced web scraping and bypassing bot detection.
-   **Cheerio**: For HTML parsing and DOM manipulation.
-   **Axios**: For HTTP requests with retry logic.
-   **Radix UI**: Frontend component library.
-   **TailwindCSS**: Frontend styling framework.
-   **React Hook Form**: For form state management.
-   **Zod**: For runtime type validation.
-   **Telegram Integration**: For real-time notifications and monitoring.
-   **OpenAI GPT-4o**: For AI-powered data enhancement and complex analysis.