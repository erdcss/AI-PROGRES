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