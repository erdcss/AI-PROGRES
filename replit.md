# Trendyol to Shopify Product Converter

## Overview

This application is a comprehensive e-commerce product data conversion tool that extracts product information from Trendyol (Turkish e-commerce platform) and converts it to Shopify-compatible CSV format. The system uses advanced web scraping techniques, AI-powered data analysis, and multiple fallback strategies to ensure reliable product data extraction.

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
- **Quality validation**: Ensures data completeness and accuracy
- **Feature extraction**: Intelligent parsing of product specifications

## Data Flow

1. **URL Input**: User provides Trendyol product URL
2. **Validation**: System validates URL format and accessibility
3. **Extraction**: Multiple strategies attempt to extract product data
4. **AI Enhancement**: Anthropic Claude analyzes and enhances extracted data
5. **Processing**: Data is cleaned, validated, and structured
6. **Storage**: Product information is cached in PostgreSQL
7. **CSV Generation**: Shopify-compatible CSV is generated on-demand
8. **Download**: User receives processed CSV file

## External Dependencies

### Core Dependencies
- **Database**: PostgreSQL 16 with Neon serverless connection
- **AI Service**: Anthropic Claude API for intelligent data processing
- **Web Scraping**: Puppeteer with Chromium for dynamic content extraction
- **HTTP Client**: Axios with retry logic for reliable requests

### Development Tools
- **Build System**: Vite for frontend, esbuild for backend
- **Type Safety**: TypeScript throughout the stack
- **Code Quality**: ESLint and Prettier for consistent code style
- **Database Management**: Drizzle Kit for schema migrations

### UI Framework
- **Component Library**: Radix UI primitives
- **Styling**: TailwindCSS with custom configuration
- **Icons**: Lucide React icon set
- **Forms**: React Hook Form with Zod validation

## Deployment Strategy

**Platform**: Replit with autoscale deployment target
- **Frontend**: Served as static files from `/dist/public`
- **Backend**: Node.js server running on production environment
- **Database**: Neon PostgreSQL serverless connection
- **File Storage**: Replit object storage for temporary CSV files

**Build Process**:
1. Frontend assets built with Vite
2. Backend compiled with esbuild
3. Database schema pushed with Drizzle
4. Production server started with optimized settings

**Environment Configuration**:
- Development: `npm run dev` - concurrent frontend and backend
- Production: `npm start` - optimized production build
- Database: `npm run db:push` - schema synchronization

## Changelog

- June 24, 2025: Initial setup and configuration
- June 24, 2025: Successfully tested enhanced scraping system with SWORD terlik product
- June 24, 2025: Confirmed working scraper extracting 319KB+ of authentic product data
- June 24, 2025: Application running on port 5000 with full React frontend and API backend
- June 24, 2025: Updated profit margin from 10% to 15% across all pricing calculations
- June 24, 2025: Added profit amount display to product preview interface
- June 24, 2025: Implemented advanced memory system with PostgreSQL integration
- June 24, 2025: Added Shopify API integration for real-time synchronization
- June 24, 2025: Created monitoring service for automatic price/stock tracking
- June 24, 2025: Built memory dashboard for system management

## User Preferences

Preferred communication style: Simple, everyday language.