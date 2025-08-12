import { pgTable, serial, text, boolean, decimal, timestamp, integer, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

// Products table - Ana ürün bilgileri
export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  trendyolUrl: text('trendyol_url').notNull().unique(),
  trendyolProductId: text('trendyol_product_id').notNull(),
  shopifyProductId: text('shopify_product_id'),
  title: text('title').notNull(),
  brand: text('brand').notNull(),
  description: text('description'),
  category: text('category'),
  images: text('images').array().notNull().default([]),
  features: jsonb('features').notNull().default({}),
  colorOptions: text('color_options').array().notNull().default([]),
  sizeOptions: text('size_options').array().notNull().default([]),
  originalPrice: decimal('original_price', { precision: 10, scale: 2 }),
  currentPrice: decimal('current_price', { precision: 10, scale: 2 }),
  stockStatus: text('stock_status').notNull().default('in_stock'), // in_stock, out_of_stock, low_stock
  lastChecked: timestamp('last_checked'),
  sourceUrl: text('source_url'), // Platform kaynak URL'si
  sourcePlatform: text('source_platform').notNull().default('trendyol'), // trendyol, hepsiburada, n11
  shopifyUrl: text('shopify_url'), // Shopify admin URL'si  
  shopifyStoreUrl: text('shopify_store_url'), // Shopify mağaza URL'si
  isActive: boolean('is_active').notNull().default(true),
  profitMargin: decimal('profit_margin', { precision: 5, scale: 2 }).notNull().default('15.00'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  lastSyncAt: timestamp('last_sync_at'),
  syncStatus: text('sync_status').notNull().default('pending') // pending, syncing, synced, error
});

// Product variants table - Renk/beden kombinasyonları
export const productVariants = pgTable('product_variants', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  shopifyVariantId: text('shopify_variant_id'),
  color: text('color').notNull().default('Varsayılan'),
  size: text('size').notNull().default('Tek Beden'),
  sku: text('sku'),
  trendyolPrice: decimal('trendyol_price', { precision: 10, scale: 2 }).notNull(),
  shopifyPrice: decimal('shopify_price', { precision: 10, scale: 2 }).notNull(),
  stockCount: integer('stock_count').notNull().default(0),
  inStock: boolean('in_stock').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

// Price history table - Fiyat değişiklik geçmişi
export const priceHistory = pgTable('price_history', {
  id: serial('id').primaryKey(),
  variantId: integer('variant_id').notNull().references(() => productVariants.id, { onDelete: 'cascade' }),
  oldPrice: decimal('old_price', { precision: 10, scale: 2 }),
  newPrice: decimal('new_price', { precision: 10, scale: 2 }).notNull(),
  changeType: text('change_type').notNull(), // increase, decrease, initial
  changeAmount: decimal('change_amount', { precision: 10, scale: 2 }),
  changePercentage: decimal('change_percentage', { precision: 5, scale: 2 }),
  createdAt: timestamp('created_at').notNull().defaultNow()
});

// Stock history table - Stok değişiklik geçmişi
export const stockHistory = pgTable('stock_history', {
  id: serial('id').primaryKey(),
  variantId: integer('variant_id').notNull().references(() => productVariants.id, { onDelete: 'cascade' }),
  oldStock: integer('old_stock'),
  newStock: integer('new_stock').notNull(),
  changeType: text('change_type').notNull(), // increase, decrease, out_of_stock, back_in_stock, initial
  changeAmount: integer('change_amount'),
  createdAt: timestamp('created_at').notNull().defaultNow()
});

// Shopify sync logs table - Shopify senkronizasyon kayıtları
export const shopifySyncLogs = pgTable('shopify_sync_logs', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').references(() => products.id, { onDelete: 'cascade' }),
  variantId: integer('variant_id').references(() => productVariants.id, { onDelete: 'cascade' }),
  syncType: text('sync_type').notNull(), // create, update_price, update_stock, update_variant
  status: text('status').notNull(), // success, failed, pending
  requestData: jsonb('request_data'),
  responseData: jsonb('response_data'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').notNull().defaultNow()
});

// Monitoring schedules table - İzleme programları
export const monitoringSchedules = pgTable('monitoring_schedules', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  isActive: boolean('is_active').notNull().default(true),
  checkInterval: integer('check_interval').notNull().default(300), // saniye cinsinden (5 dakika)
  lastCheckAt: timestamp('last_check_at'),
  nextCheckAt: timestamp('next_check_at'),
  consecutiveFailures: integer('consecutive_failures').notNull().default(0),
  realTimeTracking: boolean('real_time_tracking').notNull().default(false), // Anlık takip aktif mi
  trackingEnabled: boolean('tracking_enabled').notNull().default(true), // URL tracking açık mı
  notificationSettings: jsonb('notification_settings').default({}), // Bildirim ayarları
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

// Real-time URL tracking table - Anlık URL takip sistemi
export const urlTracking = pgTable('url_tracking', {
  id: serial('id').primaryKey(),
  url: text('url').notNull().unique(),
  productTitle: text('product_title'),
  currentPrice: decimal('current_price', { precision: 10, scale: 2 }),
  previousPrice: decimal('previous_price', { precision: 10, scale: 2 }),
  originalPrice: decimal('original_price', { precision: 10, scale: 2 }),
  currency: text('currency').default('TL'),
  status: text('status').default('active'), // active, error, out_of_stock, monitoring
  lastChecked: timestamp('last_checked').defaultNow(),
  lastSuccessfulCheck: timestamp('last_successful_check'),
  checkCount: integer('check_count').default(0),
  isTracking: boolean('is_tracking').default(true),
  trackingInterval: integer('tracking_interval').default(300), // saniye (5 dakika)
  priceChangeAlert: boolean('price_change_alert').default(true),
  stockAlert: boolean('stock_alert').default(true),
  errorMessage: text('error_message'),
  extractedData: jsonb('extracted_data'), // Son çekilen tam veri
  lastPriceChange: timestamp('last_price_change'),
  priceChangePercent: decimal('price_change_percent', { precision: 5, scale: 2 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

// Relations
export const productsRelations = relations(products, ({ many }) => ({
  variants: many(productVariants),
  syncLogs: many(shopifySyncLogs),
  monitoringSchedule: many(monitoringSchedules)
}));

export const productVariantsRelations = relations(productVariants, ({ one, many }) => ({
  product: one(products, {
    fields: [productVariants.productId],
    references: [products.id]
  }),
  priceHistory: many(priceHistory),
  stockHistory: many(stockHistory),
  syncLogs: many(shopifySyncLogs)
}));

export const priceHistoryRelations = relations(priceHistory, ({ one }) => ({
  variant: one(productVariants, {
    fields: [priceHistory.variantId],
    references: [productVariants.id]
  })
}));

export const stockHistoryRelations = relations(stockHistory, ({ one }) => ({
  variant: one(productVariants, {
    fields: [stockHistory.variantId],
    references: [productVariants.id]
  })
}));

export const shopifySyncLogsRelations = relations(shopifySyncLogs, ({ one }) => ({
  product: one(products, {
    fields: [shopifySyncLogs.productId],
    references: [products.id]
  }),
  variant: one(productVariants, {
    fields: [shopifySyncLogs.variantId],
    references: [productVariants.id]
  })
}));

export const monitoringSchedulesRelations = relations(monitoringSchedules, ({ one }) => ({
  product: one(products, {
    fields: [monitoringSchedules.productId],
    references: [products.id]
  })
}));

// Zod schemas for validation
export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastSyncAt: true
});

export const insertProductVariantSchema = createInsertSchema(productVariants).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertPriceHistorySchema = createInsertSchema(priceHistory).omit({
  id: true,
  createdAt: true
});

export const insertStockHistorySchema = createInsertSchema(stockHistory).omit({
  id: true,
  createdAt: true
});

export const insertShopifySyncLogSchema = createInsertSchema(shopifySyncLogs).omit({
  id: true,
  createdAt: true
});

export const insertMonitoringScheduleSchema = createInsertSchema(monitoringSchedules).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertUrlTrackingSchema = createInsertSchema(urlTracking).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

// Export the table schemas for use in other files
export const variants = productVariants;

// Types
export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type ProductVariant = typeof productVariants.$inferSelect;
export type InsertProductVariant = z.infer<typeof insertProductVariantSchema>;
export type PriceHistory = typeof priceHistory.$inferSelect;
export type InsertPriceHistory = z.infer<typeof insertPriceHistorySchema>;
export type StockHistory = typeof stockHistory.$inferSelect;
export type InsertStockHistory = z.infer<typeof insertStockHistorySchema>;
export type ShopifySyncLog = typeof shopifySyncLogs.$inferSelect;
export type InsertShopifySyncLog = z.infer<typeof insertShopifySyncLogSchema>;
export type MonitoringSchedule = typeof monitoringSchedules.$inferSelect;
export type InsertMonitoringSchedule = z.infer<typeof insertMonitoringScheduleSchema>;
export type UrlTracking = typeof urlTracking.$inferSelect;
export type InsertUrlTracking = z.infer<typeof insertUrlTrackingSchema>;

// Legacy schemas for backward compatibility
export const urlSchema = z.object({
  url: z.string().refine((url) => {
    try {
      const urlStr = url.trim();
      let fullUrl = urlStr;
      if (!urlStr.startsWith('http://') && !urlStr.startsWith('https://')) {
        fullUrl = 'https://' + urlStr;
      }
      const parsedUrl = new URL(fullUrl);
      const isValidHost = parsedUrl.hostname === "www.trendyol.com" || 
                          parsedUrl.hostname === "trendyol.com";
      const isProductUrl = parsedUrl.pathname.includes("/p-") || 
                          parsedUrl.pathname.includes("-p-") ||
                          parsedUrl.pathname.match(/\/[^\/]+\/[^\/]+-p-\d+/);
      return isValidHost && isProductUrl;
    } catch (e) {
      return false;
    }
  }, "Geçerli bir Trendyol ürün URL'si giriniz")
});

export const csvPreviewSchema = z.object({
  url: z.string().url()
});

// Shopify transferred products tracking - Shopify'a aktarılan ürün takibi
export const shopifyTransferredProducts = pgTable('shopify_transferred_products', {
  id: serial('id').primaryKey(),
  sourceUrl: text('source_url').notNull().unique(),
  shopifyProductId: text('shopify_product_id'),
  shopifyHandle: text('shopify_handle'),
  title: text('title').notNull(),
  brand: text('brand'),
  originalPrice: decimal('original_price', { precision: 10, scale: 2 }),
  shopifyPrice: decimal('shopify_price', { precision: 10, scale: 2 }),
  profitMargin: decimal('profit_margin', { precision: 5, scale: 2 }).default('10.00'),
  variantCount: integer('variant_count').default(1),
  imageCount: integer('image_count').default(0),
  transferredAt: timestamp('transferred_at').defaultNow(),
  lastChecked: timestamp('last_checked'),
  currentStatus: text('current_status').default('active'), // active, inactive, error, deleted
  trackingEnabled: boolean('tracking_enabled').default(true),
  notificationSettings: jsonb('notification_settings').default({
    priceChanges: true,
    stockChanges: true,
    statusChanges: true,
    detailedReports: true
  }),
  sourceData: jsonb('source_data'), // Original extracted data
  shopifyData: jsonb('shopify_data'), // Shopify product data
  lastNotificationAt: timestamp('last_notification_at'),
  changeCount: integer('change_count').default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

// Shopify product change tracking - Ürün değişiklik takibi
export const shopifyProductChanges = pgTable('shopify_product_changes', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').references(() => shopifyTransferredProducts.id),
  changeType: text('change_type').notNull(), // 'price', 'stock', 'status', 'content', 'variant'
  fieldName: text('field_name'), // Hangi alan değişti
  oldValue: text('old_value'),
  newValue: text('new_value'),
  changeDetails: jsonb('change_details'),
  severity: text('severity').default('medium'), // 'low', 'medium', 'high', 'critical'
  sourceUrl: text('source_url'),
  detectedAt: timestamp('detected_at').defaultNow(),
  notificationSent: boolean('notification_sent').default(false),
  notificationSentAt: timestamp('notification_sent_at'),
  telegramMessageId: text('telegram_message_id'),
  createdAt: timestamp('created_at').notNull().defaultNow()
});

// Type exports for new tables
export type ShopifyTransferredProduct = typeof shopifyTransferredProducts.$inferSelect;
export type InsertShopifyTransferredProduct = typeof shopifyTransferredProducts.$inferInsert;
export type ShopifyProductChange = typeof shopifyProductChanges.$inferSelect;
export type InsertShopifyProductChange = typeof shopifyProductChanges.$inferInsert;