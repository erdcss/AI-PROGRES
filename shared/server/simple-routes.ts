import type { Express } from "express";
import express from "express";
import cheerio from "cheerio";
import { Product, InsertProduct, insertProductSchema, urlSchema } from "@shared/schema";
import { storage } from "./storage";
import { handleError } from "./errors";
import { createServer } from "http";

export async function registerRoutes(app: Express) {
  const httpServer = createServer(app);

  // Ürün çekmeyi dene
  app.post('/api/scrape', async (req, res) => {
    console.log("Scrape isteği alındı ama geçici implementasyon");
    
    try {
      // Geçici olarak Philips Lattego ürünleri için hata dön
      return res.status(500).json({
        message: "Philips Lattego ürünleri için desteğimiz bakım altında",
        details: "Lütfen farklı bir ürün deneyin"
      });
    } catch (error: any) {
      const errorResponse = handleError(error);
      return res.status(errorResponse.status).json(errorResponse.body);
    }
  });

  // Geçmiş URL'leri listele
  app.get('/api/history', (_req, res) => {
    try {
      const history = storage.getHistory();
      return res.status(200).json({ urls: history });
    } catch (error: any) {
      return res.status(500).json({ 
        message: "Geçmiş yüklenirken hata oluştu",
        error: error.message 
      });
    }
  });

  return httpServer;
}