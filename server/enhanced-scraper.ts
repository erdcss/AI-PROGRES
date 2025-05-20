/**
 * Geliştirilmiş Scraper
 * Standart scraper gibi çalışır ama daha fazla görsel için özel bir modül kullanır
 */

import { scrapeProductWithPuppeteer } from "./fixed-puppeteer-scraper";
import { getAllProductImages } from "./image-extractor";
import { extractVariants } from "./enhanced-variant-extractor";
import { extractAttributes } from "./enhanced-attributes-extractor";
import * as cheerio from "cheerio";
import { Product, InsertProduct } from "@shared/schema";

/**
 * Bir URL'deki ürünü Puppeteer ile kazır ve görselleri direkt image-extractor ile getirir
 * @param url Kazınacak ürünün URL'si
 * @returns Standart scrape ama tüm görsellerle tamamlanmış
 */
export async function scrapeWithEnhancedImages(url: string): Promise<InsertProduct> {
  // 1. Standart scraper ile ürünü kazı
  console.log(`Geliştirilmiş scraper çalışıyor: ${url}`);
  const htmlContent = await scrapeProductWithPuppeteer(url);
  
  // 2. HTML'i parse et ve ürün verilerini çıkar
  const $ = cheerio.load(htmlContent);
  
  // 3. Standart parsing işlemi
  const title = $("h1.pr-new-br").text().trim() || $("h1.detail-name").text().trim();
  const description = $("div.detail-desc-content").text().trim();
  
  // 4. Tüm görsel URL'lerini özel modülle çek
  console.log(`Tüm görseller özel modül ile çekiliyor: ${url}`);
  const images = await getAllProductImages(url);
  console.log(`Toplam ${images.length} görsel başarıyla çekildi`);

  // 5. Diğer verileri standart şekilde al
  // Fiyat
  let price = $("span.prc-dsc").text().trim();
  price = price.replace(/[^\d,.]/g, '').replace(/\./g, '').replace(',', '.');

  // Orijinal fiyat
  let basePrice = $("span.prc-org").text().trim();
  basePrice = basePrice ? basePrice.replace(/[^\d,.]/g, '').replace(/\./g, '').replace(',', '.') : null;

  // Kar marjı ekle
  if (price && !isNaN(parseFloat(price))) {
    const originalPrice = parseFloat(price);
    const priceWithProfit = (originalPrice * 1.10).toFixed(2);  // %10 kâr payı
    console.log(`Orijinal fiyat: ${originalPrice}, %10 kar marjı: ${priceWithProfit}`);
    price = priceWithProfit;
  }

  // Geliştirilmiş ürün özellikleri çıkarıcı ile tüm özellikleri çek
  console.log(`Ürün özellikleri geliştirilmiş modül ile çekiliyor...`);
  const attributes = extractAttributes($);
  console.log(`Toplam ${Object.keys(attributes).length} ürün özelliği bulundu`);

  // Geliştirilmiş varyant çıkarıcı ile tüm beden ve renk seçeneklerini çek
  console.log(`Ürün varyantları geliştirilmiş modül ile çekiliyor...`);
  const variants = extractVariants($);
  console.log(`Toplam ${variants.size.length} beden, ${variants.color.length} renk varyantı bulundu`);

  // Kategori ve marka bilgisi
  const brand = $("h1.pr-new-br a").first().text().trim() || null;
  const category = $("ul.breadcrumbs li:not(:first-child) a").map((_, el) => $(el).text().trim()).get().join(" > ");
  
  // Etiketler (tags)
  const tags = [];
  if (category) {
    const parts = category.split(">");
    for (let i = 0; i < Math.min(parts.length, 3); i++) {
      tags.push(parts[i].trim());
    }
  }

  // Ürün verilerini birleştir
  const productData: InsertProduct = {
    url,
    title,
    description,
    price,
    basePrice,
    images, // Tüm görseller burada
    variants,
    attributes,
    tags,
    category,
    brand,
    vendor: "turmarkt", // sabit vendor değeri
    video: null, // varsayılan olarak video yok
    subcategory: "", // alt kategori boş
    productType: "", // ürün tipi boş
  };

  return productData;
}