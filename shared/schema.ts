import { pgTable, text, serial, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Ürün özellikleri için dinamik şema
export const attributeSchema = z.record(z.string());

// Varyant şeması - beden, renk ve stokta olan bedenler için
export const variantSchema = z.object({
  size: z.array(z.string()).optional(),
  color: z.array(z.string()).optional(),
  hasVariants: z.boolean().optional(),
  availableSizes: z.array(z.string()).optional() // Stokta olan bedenleri içeren yeni alan
});

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  url: text("url").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  price: text("price").notNull(),
  basePrice: text("base_price").default("0"),
  images: text("images").array().notNull(),
  video: text("video"),
  variants: jsonb("variants").notNull(),
  attributes: jsonb("attributes").$type<Record<string, string>>().notNull(),
  category: text("category").default("Other"),       // Ana kategori
  subcategory: text("subcategory").default(""),      // Alt kategori
  productType: text("product_type").default(""),     // Ürün tipi/türü
  tags: text("tags").array().default([]),            // Etiketler
  categories: text("categories").array().default([]),  // Kategoriler
  brand: text("brand"),                             // Marka adı
  vendor: text("vendor").default("turmarkt")         // Vendor/Satıcı ismi
});

// Ürün ekleme şeması
export const insertProductSchema = createInsertSchema(products).extend({
  attributes: attributeSchema
});

export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;

// CSV önizleme istek şeması
export const csvPreviewSchema = z.object({
  url: z.string().url()
});

export const urlSchema = z.object({
  url: z.string().refine((url) => {
    try {
      // Daha esnek URL doğrulaması
      const urlStr = url.trim();
      
      // Protokol kontrolü - protokol yoksa ekle
      let fullUrl = urlStr;
      if (!urlStr.startsWith('http://') && !urlStr.startsWith('https://')) {
        fullUrl = 'https://' + urlStr;
      }
      
      const parsedUrl = new URL(fullUrl);
      
      // Hostname kontrolü - www. olmadan da çalışsın
      const isValidHost = parsedUrl.hostname === "www.trendyol.com" || 
                          parsedUrl.hostname === "trendyol.com";
      
      // Ürün URL kontrolü - daha esnek
      const isProductUrl = parsedUrl.pathname.includes("/p-") || 
                          parsedUrl.pathname.includes("-p-") ||
                          parsedUrl.pathname.match(/\/[^\/]+\/[^\/]+-p-\d+/);
      
      return isValidHost && isProductUrl;
    } catch (e) {
      console.error("URL parse hatası:", e);
      return false;
    }
  }, "Geçerli bir Trendyol ürün URL'si giriniz. Örnek: https://www.trendyol.com/marka/urun-adi-p-123456")
});