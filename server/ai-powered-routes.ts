import express from 'express';
import { openaiEnhancedExtractor } from './openai-enhanced-extractor';

export function addAIPoweredRoutes(app: express.Application) {
  
  // AI-Enhanced Product Analysis
  app.post('/api/ai-enhance-product', async (req, res) => {
    try {
      const { productData } = req.body;
      
      if (!productData || !productData.title) {
        return res.status(400).json({
          success: false,
          error: 'Product data gerekli'
        });
      }

      console.log('🤖 AI enhancement başlatılıyor:', productData.title);
      
      const enhancedProduct = await openaiEnhancedExtractor.enhanceProductData(productData);
      
      res.json({
        success: true,
        enhancedProduct,
        message: 'Ürün AI ile başarıyla geliştirildi'
      });

    } catch (error: any) {
      console.error('❌ AI enhancement error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        message: 'AI geliştirme işlemi başarısız'
      });
    }
  });

  // AI Product Summary Generation
  app.post('/api/ai-generate-summary', async (req, res) => {
    try {
      const { productData } = req.body;
      
      const summary = await openaiEnhancedExtractor.generateProductSummary(productData);
      
      res.json({
        success: true,
        summary,
        message: 'Ürün özeti oluşturuldu'
      });

    } catch (error: any) {
      console.error('❌ AI summary error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // AI Image Analysis
  app.post('/api/ai-analyze-image', async (req, res) => {
    try {
      const { imageUrl } = req.body;
      
      if (!imageUrl) {
        return res.status(400).json({
          success: false,
          error: 'Image URL gerekli'
        });
      }

      const analysis = await openaiEnhancedExtractor.analyzeImageContent(imageUrl);
      
      res.json({
        success: true,
        analysis,
        message: 'Görsel analizi tamamlandı'
      });

    } catch (error: any) {
      console.error('❌ AI image analysis error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // AI Title Improvement
  app.post('/api/ai-improve-title', async (req, res) => {
    try {
      const { title, brand } = req.body;
      
      const improvedTitle = await openaiEnhancedExtractor.improveProductTitle(title, brand);
      
      res.json({
        success: true,
        originalTitle: title,
        improvedTitle,
        message: 'Başlık geliştirildi'
      });

    } catch (error: any) {
      console.error('❌ AI title improvement error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // AI Keyword Generation
  app.post('/api/ai-generate-keywords', async (req, res) => {
    try {
      const { productData } = req.body;
      
      const keywords = await openaiEnhancedExtractor.generateSearchKeywords(productData);
      
      res.json({
        success: true,
        keywords,
        count: keywords.length,
        message: 'Anahtar kelimeler oluşturuldu'
      });

    } catch (error: any) {
      console.error('❌ AI keywords error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // AI Quality Detection
  app.post('/api/ai-detect-quality-issues', async (req, res) => {
    try {
      const { productData } = req.body;
      
      const issues = await openaiEnhancedExtractor.detectProductQualityIssues(productData);
      
      res.json({
        success: true,
        issues,
        qualityScore: issues.length === 0 ? 95 : Math.max(50, 95 - (issues.length * 10)),
        message: 'Kalite analizi tamamlandı'
      });

    } catch (error: any) {
      console.error('❌ AI quality detection error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // AI-Enhanced Scraping with Auto-Enhancement
  app.post('/api/ai-enhanced-scrape', async (req, res) => {
    try {
      const { url } = req.body;
      
      if (!url) {
        return res.status(400).json({
          success: false,
          error: 'URL gerekli'
        });
      }

      console.log('🤖 AI-Enhanced Scraping başlatılıyor:', url);

      // First do normal scraping
      const scenarioBasedScraperModule = await import('./scenario-based-scraper');
      const scrapingResult = await scenarioBasedScraperModule.extractProduct(url);
      
      if (!scrapingResult.success) {
        return res.json(scrapingResult);
      }

      // Then enhance with AI
      const productData = {
        title: scrapingResult.title,
        brand: scrapingResult.brand,
        price: scrapingResult.price.original,
        images: scrapingResult.images,
        features: scrapingResult.features,
        description: scrapingResult.description,
        variants: scrapingResult.variants
      };

      const enhancedProduct = await openaiEnhancedExtractor.enhanceProductData(productData);
      
      // Combine scraping result with AI enhancements
      const finalResult = {
        ...scrapingResult,
        aiEnhancements: {
          enhancedDescription: enhancedProduct.enhancedDescription,
          seoTitle: enhancedProduct.seoTitle,
          seoDescription: enhancedProduct.seoDescription,
          suggestedTags: enhancedProduct.suggestedTags,
          categoryMatch: enhancedProduct.categoryMatch,
          qualityScore: enhancedProduct.qualityScore,
          marketingDescription: enhancedProduct.marketingDescription,
          targetAudience: enhancedProduct.targetAudience,
          aiAnalysis: enhancedProduct.aiAnalysis
        }
      };

      console.log('✅ AI-Enhanced Scraping tamamlandı:', enhancedProduct.qualityScore, 'kalite skoru');

      res.json({
        success: true,
        ...finalResult,
        message: 'AI-Enhanced extraction başarılı'
      });

    } catch (error: any) {
      console.error('❌ AI-Enhanced Scraping error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        message: 'AI-Enhanced scraping başarısız'
      });
    }
  });

  console.log('✅ AI-Powered routes eklendi');
}