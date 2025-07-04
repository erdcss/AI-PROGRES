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

## User Preferences

Preferred communication style: Simple, everyday language.