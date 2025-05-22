/**
 * Geliştirilmiş Shopify CSV Exporter
 * Tüm ürün ve varyant bilgilerini doğru formatta Shopify CSV'sine dönüştürür
 */

import { Product } from "@shared/schema";
import { createObjectCsvWriter } from "csv-writer";
import { join } from "path";
import fs from "fs";

// GÖRSEL FİLTRELEME TAMAMEN KALDIRILDI
// Tüm görseller olduğu gibi CSV'ye aktarılıyor 

/**
 * Ürün varyantlarını işler ve Shopify formatında varyant satırları oluşturur
 * @param product Ana ürün verisi
 * @param baseRow Temel CSV satır şablonu
 * @returns Tüm varyant satırlarını içeren dizi
 */
function processVariants(product: Product, baseRow: any): any[] {
  const rows: any[] = [];
  
  if (!product.variants || typeof product.variants !== "object") {
    // Varyant yoksa, sadece ana ürün satırını döndür
    baseRow.option1_name = 'Title';
    baseRow.option1_value = 'Default Title';
    rows.push(baseRow);
    return rows;
  }
  
  const variants = product.variants as any;
  
  // Beden ve Renk varyantlarını kontrol et
  const hasColors = variants.color && Array.isArray(variants.color) && variants.color.length > 0;
  
  // Öncelikle stokta olan bedenleri kontrol et, yoksa tüm beden listesini kullan
  // Stokta bulunma kontrolü: Sadece stokta olan bedenleri varyant olarak ekle
  const availableSizes = variants.availableSizes && Array.isArray(variants.availableSizes) && variants.availableSizes.length > 0
    ? variants.availableSizes
    : (variants.size && Array.isArray(variants.size) ? variants.size : []);
  
  // Stok durumu hakkında log
  if (variants.availableSizes && Array.isArray(variants.availableSizes)) {
    console.log(`STOK DURUMU: ${variants.availableSizes.length} beden stokta var, ${
      (variants.unavailableSizes && Array.isArray(variants.unavailableSizes)) 
        ? variants.unavailableSizes.length 
        : 0
    } beden stokta yok`);
    
    if (variants.availableSizes.length > 0) {
      console.log(`Stokta BULUNAN bedenler: ${variants.availableSizes.join(', ')}`);
    }
    
    if (variants.unavailableSizes && variants.unavailableSizes.length > 0) {
      console.log(`Stokta OLMAYAN bedenler: ${variants.unavailableSizes.join(', ')}`);
    }
  }
    
  const hasSizes = availableSizes.length > 0;
  
  // Her iki varyant türü varsa: Renk + Beden kombinasyonları oluştur
  if (hasColors && hasSizes) {
    console.log(`İki türlü varyant bulundu: ${variants.color.length} renk, ${variants.size.length} beden`);
    
    // Option isimleri ayarla (Shopify formatı)
    baseRow.option1_name = 'Renk';
    baseRow.option2_name = 'Beden';
    
    // İlk satır ana üründür, sadece varyant ekle
    let isFirstRow = true;
    
    // Renk ve stokta olan beden kombinasyonu
    variants.color.forEach((color: string) => {
      availableSizes.forEach((size: string) => {
        const variantRow = {...baseRow};
        
        // İlk satır ana ürünün detaylarını içerir
        if (!isFirstRow) {
          // Varyant satırlarında bazı bilgiler tekrarlanmaz
          variantRow.title = "";
          variantRow.body_html = "";
          variantRow.tags = "";
          variantRow.images = "";
        }
        
        // Varyant bilgilerini ekle
        variantRow.option1_value = color;
        variantRow.option2_value = size;
        
        // SKU oluştur (Shopify için gerekli)
        variantRow.variant_sku = `${baseRow.handle}-${color.toLowerCase()}-${size}`.replace(/\s+/g, '-');
        
        // İlk varyant satırını ekledikten sonra bayrak değişir
        isFirstRow = false;
        
        rows.push(variantRow);
      });
    });
  } 
  // Sadece Renk varyantı varsa
  else if (hasColors) {
    console.log(`Tek türlü varyant bulundu: ${variants.color.length} renk`);
    
    // Option ismini ayarla
    baseRow.option1_name = 'Renk';
    
    // İlk satır ana üründür, tüm detayları içerir
    let isFirstRow = true;
    
    // Her renk için bir satır oluştur
    variants.color.forEach((color: string) => {
      const variantRow = {...baseRow};
      
      // İlk satır dışındaki satırlarda bazı bilgiler tekrarlanmaz
      if (!isFirstRow) {
        variantRow.title = "";
        variantRow.body_html = "";
        variantRow.tags = "";
        variantRow.images = "";
      }
      
      // Renk bilgisini ekle
      variantRow.option1_value = color;
      
      // SKU oluştur
      variantRow.variant_sku = `${baseRow.handle}-${color.toLowerCase()}`.replace(/\s+/g, '-');
      
      isFirstRow = false;
      rows.push(variantRow);
    });
  } 
  // Sadece Beden varyantı varsa
  else if (hasSizes) {
    console.log(`Tek türlü varyant bulundu: ${availableSizes.length} beden (stokta olan)`);
    
    // Option ismini ayarla
    baseRow.option1_name = 'Beden';
    
    // İlk satır ana üründür, tüm detayları içerir
    let isFirstRow = true;
    
    // Sadece stokta olan bedenler için bir satır oluştur
    availableSizes.forEach((size: string) => {
      const variantRow = {...baseRow};
      
      // İlk satır dışındaki satırlarda bazı bilgiler tekrarlanmaz
      if (!isFirstRow) {
        variantRow.title = "";
        variantRow.body_html = "";
        variantRow.tags = "";
        variantRow.images = "";
      }
      
      // Beden bilgisini ekle
      variantRow.option1_value = size;
      
      // SKU oluştur
      variantRow.variant_sku = `${baseRow.handle}-${size}`.replace(/\s+/g, '-');
      
      isFirstRow = false;
      rows.push(variantRow);
    });
  } 
  // Varyant yoksa, tek satır oluştur (Default Title)
  else {
    console.log("Varyant bulunamadı, tek satır CSV oluşturuluyor");
    baseRow.option1_name = 'Title';
    baseRow.option1_value = 'Default Title';
    rows.push(baseRow);
  }
  
  return rows;
}

/**
 * Ürün özelliklerini işler ve Shopify Metafields formatına dönüştürür
 * @param attributes Ürün özellikleri
 * @returns Shopify metafields formatında özellikler
 */
function processAttributes(attributes: Record<string, string>): Record<string, string> {
  if (!attributes || Object.keys(attributes).length === 0) {
    return {};
  }
  
  // Shopify metafield formatı
  const metafields: Record<string, string> = {};
  
  // Özellik alanları için prefix
  const metafieldPrefix = 'metafield.';
  
  Object.entries(attributes).forEach(([key, value]) => {
    // Özel Türkçe karakterleri düzelt
    const safeKey = key
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_]/g, "_")
      .toLowerCase();
    
    // Shopify metafield formatında ekle
    metafields[`${metafieldPrefix}${safeKey}`] = value;
  });
  
  return metafields;
}

/**
 * Ürün bilgilerini Shopify uyumlu CSV'ye dönüştürür
 * @param product Ürün verisi
 * @param outputPath CSV çıktı yolu
 * @returns CSV dosya yolu
 */
export async function generateEnhancedShopifyCSV(
  product: Product,
  outputPath: string = join(process.cwd(), './exports', `shopify_export_${Date.now()}.csv`)
): Promise<string> {
  console.log(`Geliştirilmiş Shopify CSV oluşturuluyor: ${product.title}`);
  
  try {
    // Türkçe karakterleri İngilizce karşılıklarına çeviren yardımcı fonksiyon
    const turkishToEnglish = (text: string): string => {
      if (!text) return '';
      return text
        .replace(/ç/g, 'c')
        .replace(/Ç/g, 'C')
        .replace(/ğ/g, 'g')
        .replace(/Ğ/g, 'G')
        .replace(/ı/g, 'i')
        .replace(/İ/g, 'I')
        .replace(/ö/g, 'o')
        .replace(/Ö/g, 'O')
        .replace(/ş/g, 's')
        .replace(/Ş/g, 'S')
        .replace(/ü/g, 'u')
        .replace(/Ü/g, 'U');
    };
    
    // Ürün handle (slug) oluştur
    const handle = turkishToEnglish(product.title)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 60);
    
    // Tüm etiketleri birleştir ve uzunluğu 255 karakterle sınırla (Shopify limiti)
    let tags = '';
    if (product.tags && Array.isArray(product.tags)) {
      // İlk etiketi ana kategori olarak al (en önemli etiket)
      const mainCategory = product.tags[0] || '';
      
      // En fazla 8 etiket, ilk 3'ü kategori yapısını takip edecek şekilde
      const maxTags = 8;
      const selectedTags = product.tags.slice(0, maxTags);
      
      // Tüm etiketleri birleştir, 'Trendyol' kelimesi varsa kaldır
      tags = selectedTags
        .map(tag => tag.replace(/Trendyol/g, '').trim())
        .filter(tag => tag.length > 0 && tag.length <= 20) // Etiket uzunluğu maksimum 20 karakter
        .join(', ');
      
      console.log(`Ürün etiketleri: ${tags}`);
    }
    
    // Temel CSV satırı
    const baseRow: any = {
      handle: handle,
      title: product.title,
      body_html: product.description,
      vendor: "turmarkt", // Vendor her zaman "turmarkt" olacak
      published: "TRUE",
      status: "active",
      published_at: new Date().toISOString(),
      published_scope: "web",
      tags: tags,
      
      // Görseller için ünlü görselleri birleştir ve filtreleme kaldırıldı
      image_src: product.images && product.images.length > 0 ? product.images[0] : '',
      image_position: 1,
      
      // Diğer görseller (ikinci görselden itibaren hepsi)
      // Her bir görsel için ayrı satır oluşturmak yerine, Shopify import için tüm görselleri koma ile ayırıyoruz
      images: product.images && product.images.length > 1 
        ? product.images.slice(1).join(', ') 
        : '',
      
      // Fiyat (kar marjı eklendi)
      price: product.price,
      compare_at_price: product.basePrice,
      
      // Ürün türü ve kategori
      standard_product_type: product.category || '',
      custom_product_type: product.productType || '',
      
      // Envanter ayarları
      variant_inventory_qty: "10",
      variant_inventory_policy: "deny",
      variant_inventory_tracker: "shopify",
      variant_fulfillment_service: "manual",
      
      // Gönderim ve vergi ayarları
      variant_requires_shipping: "TRUE",
      variant_taxable: "TRUE",
      
      // İlk başta boş, daha sonra processVariants fonksiyonu tarafından doldurulacak
      option1_name: '',
      option1_value: '',
      option2_name: '',
      option2_value: '',
      option3_name: '',
      option3_value: '',
    };
    
    // Ürün özelliklerini metafields olarak ekle
    const metafields = processAttributes(product.attributes);
    Object.assign(baseRow, metafields);
    
    // Varyantları işle ve satırları oluştur
    const csvRows = processVariants(product, baseRow);
    
    // Shopify CSV başlıkları
    const header = [
      { id: 'handle', title: 'Handle' },
      { id: 'title', title: 'Title' },
      { id: 'body_html', title: 'Body (HTML)' },
      { id: 'vendor', title: 'Vendor' },
      { id: 'standard_product_type', title: 'Standard Product Type' },
      { id: 'custom_product_type', title: 'Custom Product Type' },
      { id: 'tags', title: 'Tags' },
      { id: 'published', title: 'Published' },
      { id: 'status', title: 'Status' },
      { id: 'published_at', title: 'Published At' },
      { id: 'published_scope', title: 'Published Scope' },
      { id: 'option1_name', title: 'Option1 Name' },
      { id: 'option1_value', title: 'Option1 Value' },
      { id: 'option2_name', title: 'Option2 Name' },
      { id: 'option2_value', title: 'Option2 Value' },
      { id: 'option3_name', title: 'Option3 Name' },
      { id: 'option3_value', title: 'Option3 Value' },
      { id: 'variant_sku', title: 'Variant SKU' },
      { id: 'variant_inventory_tracker', title: 'Variant Inventory Tracker' },
      { id: 'variant_inventory_qty', title: 'Variant Inventory Qty' },
      { id: 'variant_inventory_policy', title: 'Variant Inventory Policy' },
      { id: 'variant_fulfillment_service', title: 'Variant Fulfillment Service' },
      { id: 'price', title: 'Variant Price' },
      { id: 'compare_at_price', title: 'Variant Compare At Price' },
      { id: 'variant_requires_shipping', title: 'Variant Requires Shipping' },
      { id: 'variant_taxable', title: 'Variant Taxable' },
      { id: 'image_src', title: 'Image Src' },
      { id: 'image_position', title: 'Image Position' },
      { id: 'images', title: 'Additional Images' },
    ];
    
    // Özellik alanlarını başlıklara ekle
    Object.keys(metafields).forEach(metafield => {
      header.push({ id: metafield, title: metafield });
    });
    
    // CSV Yazıcı oluştur
    const csvWriter = createObjectCsvWriter({
      path: outputPath,
      header
    });
    
    // CSV dosyasını yaz
    await csvWriter.writeRecords(csvRows);
    
    console.log(`Shopify CSV başarıyla oluşturuldu: ${outputPath}`);
    console.log(`Toplam ${csvRows.length} satır ile ${Object.keys(metafields).length} ürün özelliği yazıldı`);
    
    return outputPath;
  } catch (error) {
    console.error('Shopify CSV oluşturma hatası:', error);
    throw new Error(`Shopify CSV oluşturma hatası: ${error}`);
  }
}