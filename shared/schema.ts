import { pgTable, serial, text, boolean, decimal, timestamp, integer, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

// Products table - Ana ürün bilgileri
export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  uniqueTrackingId: text('unique_tracking_id').unique(), // Benzersiz takip ID'si
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

// Variant changes table - Varyant değişiklik takibi (yeni varyant ekleme/çıkarma)
export const variantChanges = pgTable('variant_changes', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  variantId: integer('variant_id').references(() => productVariants.id, { onDelete: 'set null' }),
  changeType: text('change_type').notNull(), // variant_added, variant_removed, variant_stock_changed, variant_oos, variant_back_in_stock
  color: text('color'),
  size: text('size'),
  oldStockCount: integer('old_stock_count'),
  newStockCount: integer('new_stock_count'),
  oldInStock: boolean('old_in_stock'),
  newInStock: boolean('new_in_stock'),
  shopifySynced: boolean('shopify_synced').notNull().default(false),
  shopifySyncAt: timestamp('shopify_sync_at'),
  telegramNotified: boolean('telegram_notified').notNull().default(false),
  telegramNotifiedAt: timestamp('telegram_notified_at'),
  metadata: jsonb('metadata').default({}), // Ek bilgiler
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
  scheduleType: text('schedule_type').notNull().default('interval'), // 'interval' | 'fixed_hours'
  hoursOfDay: jsonb('hours_of_day').default([]), // [9, 12, 18] gibi saatler
  lastCheckAt: timestamp('last_check_at'),
  nextCheckAt: timestamp('next_check_at'),
  consecutiveFailures: integer('consecutive_failures').notNull().default(0),
  realTimeTracking: boolean('real_time_tracking').notNull().default(false), // Anlık takip aktif mi
  trackingEnabled: boolean('tracking_enabled').notNull().default(true), // URL tracking açık mı
  notificationSettings: jsonb('notification_settings').default({}), // Bildirim ayarları
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

// Shopify Memory Products table - Hafızadaki Shopify ürünleri
export const shopifyMemoryProducts = pgTable('shopify_memory_products', {
  id: serial('id').primaryKey(),
  uniqueTrackingId: text('unique_tracking_id').notNull().unique(), // Benzersiz takip ID'si
  shopifyProductId: text('shopify_product_id').notNull().unique(),
  shopifyVariantId: text('shopify_variant_id'),
  title: text('title').notNull(),
  handle: text('handle').notNull(),
  vendor: text('vendor'),
  productType: text('product_type'),
  tags: text('tags').array().default([]),
  status: text('status').notNull(), // active, archived, draft
  price: decimal('price', { precision: 10, scale: 2 }),
  compareAtPrice: decimal('compare_at_price', { precision: 10, scale: 2 }),
  inventoryQuantity: integer('inventory_quantity').default(0),
  inventoryPolicy: text('inventory_policy').default('deny'),
  sku: text('sku'),
  barcode: text('barcode'),
  weight: decimal('weight', { precision: 8, scale: 3 }),
  weightUnit: text('weight_unit').default('kg'),
  images: jsonb('images').default([]),
  options: jsonb('options').default([]), // Color, Size vs
  variants: jsonb('variants').default([]), // Tüm varyantlar
  metafields: jsonb('metafields').default({}),
  sourceUrl: text('source_url'), // Trendyol/Arçelik kaynak URL
  shopifyCreatedAt: timestamp('shopify_created_at'),
  shopifyUpdatedAt: timestamp('shopify_updated_at'),
  lastSyncAt: timestamp('last_sync_at').defaultNow(),
  isTracking: boolean('is_tracking').default(false),
  trackingInterval: integer('tracking_interval').default(300),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

// Real-time URL tracking table - Anlık URL takip sistemi
export const urlTracking = pgTable('url_tracking', {
  id: serial('id').primaryKey(),
  url: text('url').notNull().unique(),
  productId: integer('product_id').references(() => products.id, { onDelete: 'set null' }), // FK to products table
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
  // Shopify tracking fields
  shopifyProductId: text('shopify_product_id'),
  shopifyVariantIds: text('shopify_variant_ids'), // Comma-separated IDs
  shopifyAdminUrl: text('shopify_admin_url'), // Shopify admin URL
  shopifyStoreUrl: text('shopify_store_url'), // Shopify store URL
  lastShopifySyncAt: timestamp('last_shopify_sync_at'),
  syncStatus: text('sync_status').default('pending'), // pending, synced, failed, retry
  transferredAt: timestamp('transferred_at'),
  syncErrors: text('sync_errors'),
  // Failover system fields
  failoverEnabled: boolean('failover_enabled').default(true), // Yedek sistem aktif mi
  failoverMode: text('failover_mode').default('primary'), // primary, failover - Hangi modda çalışıyor
  consecutiveFailures: integer('consecutive_failures').default(0), // Ardışık hata sayısı
  lastFailureAt: timestamp('last_failure_at'), // Son hata zamanı
  failoverActivatedAt: timestamp('failover_activated_at'), // Failover devreye girme zamanı
  failoverCount: integer('failover_count').default(0), // Toplam failover sayısı
  extractionStrategy: text('extraction_strategy').default('puppeteer'), // puppeteer, mobile-api, cheerio, cached
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

// URL Price History table - URL takip sistemi için detaylı fiyat geçmişi
export const urlPriceHistory = pgTable('url_price_history', {
  id: serial('id').primaryKey(),
  url: text('url').notNull().references(() => urlTracking.url, { onDelete: 'cascade' }),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  previousPrice: decimal('previous_price', { precision: 10, scale: 2 }),
  changeAmount: decimal('change_amount', { precision: 10, scale: 2 }),
  changePercentage: decimal('change_percentage', { precision: 5, scale: 2 }),
  recordedAt: timestamp('recorded_at').notNull().defaultNow(),
  productTitle: text('product_title'),
  currency: text('currency').default('TL')
});

// Monitoring Health table - İzleme sistemi sağlık durumu ve failover yönetimi
export const monitoringHealth = pgTable('monitoring_health', {
  id: serial('id').primaryKey(),
  url: text('url').notNull().unique().references(() => urlTracking.url, { onDelete: 'cascade' }),
  healthStatus: text('health_status').notNull().default('healthy'), // healthy, degraded, unhealthy, failover
  lastSuccessfulCheck: timestamp('last_successful_check'),
  lastFailedCheck: timestamp('last_failed_check'),
  consecutiveSuccesses: integer('consecutive_successes').default(0),
  consecutiveFailures: integer('consecutive_failures').default(0),
  totalChecks: integer('total_checks').default(0),
  totalSuccesses: integer('total_successes').default(0),
  totalFailures: integer('total_failures').default(0),
  successRate: decimal('success_rate', { precision: 5, scale: 2 }).default('100.00'), // Başarı oranı %
  currentStrategy: text('current_strategy').default('puppeteer'), // puppeteer, mobile-api, cheerio, cached
  availableStrategies: text('available_strategies').array().default(['puppeteer', 'mobile-api', 'cheerio']),
  lastError: text('last_error'),
  lastErrorDetails: jsonb('last_error_details'),
  isFailoverActive: boolean('is_failover_active').default(false),
  failoverReason: text('failover_reason'),
  autoRecoveryEnabled: boolean('auto_recovery_enabled').default(true),
  recoveryAttempts: integer('recovery_attempts').default(0),
  lastRecoveryAttempt: timestamp('last_recovery_attempt'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

// Pending Changes table - Onay bekleyen değişiklikler
export const pendingChanges = pgTable('pending_changes', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').references(() => products.id, { onDelete: 'cascade' }),
  variantId: integer('variant_id').references(() => productVariants.id, { onDelete: 'set null' }),
  url: text('url').references(() => urlTracking.url, { onDelete: 'cascade' }),
  changeType: text('change_type').notNull(), // price_increase, price_decrease, stock_out, stock_in, variant_added, variant_removed, variant_price_change
  status: text('status').notNull().default('pending'), // pending, approved, rejected, cancelled, processing
  productTitle: text('product_title').notNull(),
  variantKey: text('variant_key'), // "color-size" for unique variant identification
  color: text('color'),
  size: text('size'),
  oldData: jsonb('old_data'), // Tam eski veri (JSONB snapshot)
  newData: jsonb('new_data'), // Tam yeni veri (JSONB snapshot)
  oldPrice: decimal('old_price', { precision: 10, scale: 2 }),
  newPrice: decimal('new_price', { precision: 10, scale: 2 }),
  priceChange: decimal('price_change', { precision: 10, scale: 2 }),
  priceChangePercent: decimal('price_change_percent', { precision: 5, scale: 2 }),
  oldStock: integer('old_stock'),
  newStock: integer('new_stock'),
  stockChange: integer('stock_change'),
  approvedAt: timestamp('approved_at'),
  approvedBy: text('approved_by'),
  rejectedAt: timestamp('rejected_at'),
  rejectedBy: text('rejected_by'),
  rejectionReason: text('rejection_reason'),
  cancelledAt: timestamp('cancelled_at'),
  cancelReason: text('cancel_reason'),
  priceHistoryId: integer('price_history_id').references(() => priceHistory.id, { onDelete: 'set null' }),
  stockHistoryId: integer('stock_history_id').references(() => stockHistory.id, { onDelete: 'set null' }),
  variantChangeId: integer('variant_change_id').references(() => variantChanges.id, { onDelete: 'set null' }),
  shopifySynced: boolean('shopify_synced').notNull().default(false),
  shopifySyncedAt: timestamp('shopify_synced_at'),
  shopifySyncError: text('shopify_sync_error'),
  shopifySyncLogId: integer('shopify_sync_log_id').references(() => shopifySyncLogs.id, { onDelete: 'set null' }),
  telegramNotified: boolean('telegram_notified').notNull().default(false),
  telegramNotifiedAt: timestamp('telegram_notified_at'),
  telegramMessageId: text('telegram_message_id'),
  autoApprovalRule: text('auto_approval_rule'), // Otomatik onay kuralı (varsa)
  priority: integer('priority').default(5), // 1-10 (1=yüksek, 10=düşük)
  archivedAt: timestamp('archived_at'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
}, (table) => ({
  productStatusIdx: { columns: [table.productId, table.status] },
  urlStatusIdx: { columns: [table.url, table.status] },
  statusCreatedIdx: { columns: [table.status, table.createdAt] },
  variantKeyIdx: { columns: [table.variantKey] }
}));

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

export const variantChangesRelations = relations(variantChanges, ({ one }) => ({
  product: one(products, {
    fields: [variantChanges.productId],
    references: [products.id]
  }),
  variant: one(productVariants, {
    fields: [variantChanges.variantId],
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
export const insertProductSchema = createInsertSchema(products);

export const insertProductVariantSchema = createInsertSchema(productVariants);

export const insertPriceHistorySchema = createInsertSchema(priceHistory);

export const insertStockHistorySchema = createInsertSchema(stockHistory);

export const insertVariantChangeSchema = createInsertSchema(variantChanges);

export const insertShopifySyncLogSchema = createInsertSchema(shopifySyncLogs);

export const insertMonitoringScheduleSchema = createInsertSchema(monitoringSchedules);

export const insertUrlTrackingSchema = createInsertSchema(urlTracking);

export const insertPendingChangeSchema = createInsertSchema(pendingChanges);

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
export type VariantChange = typeof variantChanges.$inferSelect;
export type InsertVariantChange = z.infer<typeof insertVariantChangeSchema>;
export type ShopifySyncLog = typeof shopifySyncLogs.$inferSelect;
export type InsertShopifySyncLog = z.infer<typeof insertShopifySyncLogSchema>;
export type MonitoringSchedule = typeof monitoringSchedules.$inferSelect;
export type InsertMonitoringSchedule = z.infer<typeof insertMonitoringScheduleSchema>;
export type UrlTracking = typeof urlTracking.$inferSelect;
export type InsertUrlTracking = z.infer<typeof insertUrlTrackingSchema>;
export type PendingChange = typeof pendingChanges.$inferSelect;
export type InsertPendingChange = z.infer<typeof insertPendingChangeSchema>;

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

// Telegram notification metadata schema
export const telegramNotificationMetadataSchema = z.object({
  color: z.string().optional(),
  size: z.string().optional(),
  oldPrice: z.number().optional(),
  newPrice: z.number().optional(),
  priceChange: z.number().optional(),
  changePercent: z.number().optional(),
  oldStock: z.number().optional(),
  newStock: z.number().optional(),
  stockDiff: z.number().optional(),
  shopifyUpdated: z.boolean().optional(),
  operation: z.string().optional(),
  error: z.string().optional(),
  urgency: z.enum(['low', 'medium', 'high']).optional(),
  trendyolUrl: z.string().optional(),
}).passthrough();

export type TelegramNotificationMetadata = z.infer<typeof telegramNotificationMetadataSchema>;

// Telegram notification settings - Bildirim ayarları
export const telegramNotificationSettings = pgTable('telegram_notification_settings', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull().default('default'), // Çok kullanıcılı sistemler için
  notificationType: text('notification_type').notNull().unique(), // 'new_product', 'variant_change', 'price_change', 'stock_update', 'shopify_upload'
  enabled: boolean('enabled').notNull().default(true),
  description: text('description'), // Bildirim açıklaması
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

// Telegram notification history - Gönderilen bildirim geçmişi
export const telegramNotificationHistory = pgTable('telegram_notification_history', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull().default('default'),
  notificationType: text('notification_type').notNull(), // 'new_product', 'variant_change', 'price_change', 'stock_update', 'shopify_upload', 'test', 'variant_added', 'variant_removed', 'variant_oos', 'variant_back_in_stock'
  message: text('message').notNull(),
  productId: integer('product_id').references(() => products.id, { onDelete: 'set null' }),
  variantId: integer('variant_id').references(() => productVariants.id, { onDelete: 'set null' }), // Variant-specific notifications
  productTitle: text('product_title'), // Ürün silinirse bile görünsün
  status: text('status').notNull().default('pending'), // 'pending', 'sent', 'failed'
  errorMessage: text('error_message'),
  telegramMessageId: text('telegram_message_id'),
  retryCount: integer('retry_count').notNull().default(0), // Kaç kez yeniden denendiği
  sentAt: timestamp('sent_at'),
  failedAt: timestamp('failed_at'), // Başarısız olduğu zaman
  lastRetryAt: timestamp('last_retry_at'), // Son deneme zamanı
  createdAt: timestamp('created_at').notNull().defaultNow(), // İlk oluşturulma zamanı
  metadata: jsonb('metadata').default({}) // Ek bilgiler (variant detayları, fiyat değişimi vb.)
});

// Shopify OAuth Credentials - API Key + Secret ile bağlantı
export const shopifyCredentials = pgTable('shopify_credentials', {
  id: serial('id').primaryKey(),
  shopDomain: text('shop_domain').notNull(), // örn: mağaza.myshopify.com
  apiKey: text('api_key').notNull(),         // İstemci Kimliği
  apiSecret: text('api_secret').notNull(),   // Gizli Anahtar
  accessToken: text('access_token'),         // OAuth sonrası alınan token
  scopes: text('scopes').default('read_products,write_products,read_inventory,write_inventory'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

export type ShopifyCredential = typeof shopifyCredentials.$inferSelect;
export type InsertShopifyCredential = typeof shopifyCredentials.$inferInsert;
export const insertShopifyCredentialSchema = createInsertSchema(shopifyCredentials).omit({ id: true, createdAt: true, updatedAt: true });

// ─── Ürün Takip Sistemi (v2) ───────────────────────────────────────────────

export const trackedProducts = pgTable('tracked_products', {
  id: serial('id').primaryKey(),
  sourceUrl: text('source_url').notNull().unique(),
  sourceSite: text('source_site').notNull().default('trendyol'),
  sourceProductId: text('source_product_id'),
  sourceTitle: text('source_title').notNull(),
  shopifyProductId: text('shopify_product_id'),
  shopifyHandle: text('shopify_handle'),
  shopifyProductGid: text('shopify_product_gid'),
  currentSourcePrice: decimal('current_source_price', { precision: 10, scale: 2 }),
  currentSourceStock: integer('current_source_stock'),
  currentStatus: text('current_status').notNull().default('pending'), // active|disabled|error|pending
  trackingEnabled: boolean('tracking_enabled').notNull().default(true),
  lastCheckedAt: timestamp('last_checked_at'),
  lastSuccessAt: timestamp('last_success_at'),
  lastErrorAt: timestamp('last_error_at'),
  lastErrorMessage: text('last_error_message'),
  checkIntervalMinutes: integer('check_interval_minutes').notNull().default(1440),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const trackedVariants = pgTable('tracked_variants', {
  id: serial('id').primaryKey(),
  trackedProductId: integer('tracked_product_id').notNull().references(() => trackedProducts.id, { onDelete: 'cascade' }),
  sourceVariantId: text('source_variant_id'),
  sourceVariantTitle: text('source_variant_title'),
  sourceSku: text('source_sku'),
  option1: text('option1'),
  option2: text('option2'),
  option3: text('option3'),
  shopifyVariantId: text('shopify_variant_id'),
  shopifyVariantGid: text('shopify_variant_gid'),
  shopifySku: text('shopify_sku'),
  currentSourcePrice: decimal('current_source_price', { precision: 10, scale: 2 }),
  currentSourceStock: integer('current_source_stock'),
  currentAvailable: boolean('current_available'),
  matchConfidence: decimal('match_confidence', { precision: 5, scale: 2 }).notNull().default('0'),
  matchStatus: text('match_status').notNull().default('uncertain'), // matched|uncertain|unmatched
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const productSnapshots = pgTable('product_snapshots', {
  id: serial('id').primaryKey(),
  trackedProductId: integer('tracked_product_id').notNull().references(() => trackedProducts.id, { onDelete: 'cascade' }),
  snapshotType: text('snapshot_type').notNull().default('check'), // initial|check|manual
  sourceUrl: text('source_url').notNull(),
  title: text('title').notNull(),
  price: decimal('price', { precision: 10, scale: 2 }),
  currency: text('currency').notNull().default('TRY'),
  stock: integer('stock'),
  available: boolean('available'),
  images: jsonb('images').notNull().default([]),
  variants: jsonb('variants').notNull().default([]),
  rawData: jsonb('raw_data').notNull().default({}),
  quality: jsonb('quality').notNull().default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const detectedChanges = pgTable('detected_changes', {
  id: serial('id').primaryKey(),
  trackedProductId: integer('tracked_product_id').notNull().references(() => trackedProducts.id, { onDelete: 'cascade' }),
  trackedVariantId: integer('tracked_variant_id').references(() => trackedVariants.id, { onDelete: 'set null' }),
  changeType: text('change_type').notNull(), // price|stock|variant_added|variant_removed|variant_changed|title|image|error
  fieldName: text('field_name').notNull(),
  oldValue: jsonb('old_value'),
  newValue: jsonb('new_value'),
  confidence: decimal('confidence', { precision: 5, scale: 2 }).notNull().default('0'),
  status: text('status').notNull().default('pending'), // pending|manual_review|approved|rejected|applied|ignored
  reason: text('reason'),
  sourceSnapshotId: integer('source_snapshot_id').references(() => productSnapshots.id, { onDelete: 'set null' }),
  targetSnapshotId: integer('target_snapshot_id').references(() => productSnapshots.id, { onDelete: 'set null' }),
  seenAt: timestamp('seen_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const trackingSettings = pgTable('tracking_settings', {
  id: serial('id').primaryKey(),
  trackingEnabled: boolean('tracking_enabled').notNull().default(true),
  schedulerEnabled: boolean('scheduler_enabled').notNull().default(true),
  autoShopifySyncEnabled: boolean('auto_shopify_sync_enabled').notNull().default(false),
  checkIntervalMinutes: integer('check_interval_minutes').notNull().default(60),
  batchSize: integer('batch_size').notNull().default(5),
  requestDelayMs: integer('request_delay_ms').notNull().default(1500),
  maxErrorsBeforePause: integer('max_errors_before_pause').notNull().default(5),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const scrapeGatewaySettings = pgTable('scrape_gateway_settings', {
  id: serial('id').primaryKey(),
  gatewayEnabled: boolean('gateway_enabled').notNull().default(true),
  proxyFallbackEnabled: boolean('proxy_fallback_enabled').notNull().default(false),
  providerType: text('provider_type').notNull().default('none'), // none|generic_proxy|scraping_api
  providerEndpoint: text('provider_endpoint'),
  providerApiKeyEncrypted: text('provider_api_key_encrypted'),
  proxyUrlEncrypted: text('proxy_url_encrypted'),
  timeoutMs: integer('timeout_ms').notNull().default(20000),
  retryCount: integer('retry_count').notNull().default(2),
  retryDelayMs: integer('retry_delay_ms').notNull().default(1500),
  useProxyForHtml: boolean('use_proxy_for_html').notNull().default(true),
  useProxyForImages: boolean('use_proxy_for_images').notNull().default(true),
  useProxyForApi: boolean('use_proxy_for_api').notNull().default(false),
  lastTestAt: timestamp('last_test_at'),
  lastTestSuccess: boolean('last_test_success'),
  lastTestMessage: text('last_test_message'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const syncLogs = pgTable('sync_logs', {
  id: serial('id').primaryKey(),
  trackedProductId: integer('tracked_product_id').references(() => trackedProducts.id, { onDelete: 'set null' }),
  action: text('action').notNull(), // tracking_check|source_fetch|diff_detected|manual_approval|shopify_sync_skipped|error
  status: text('status').notNull(), // success|warning|error|skipped
  message: text('message').notNull(),
  meta: jsonb('meta').notNull().default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const priceRules = pgTable('price_rules', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(), // percentage|fixed
  value: decimal('value', { precision: 10, scale: 2 }).notNull(),
  minPrice: decimal('min_price', { precision: 10, scale: 2 }),
  maxPrice: decimal('max_price', { precision: 10, scale: 2 }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type TrackedProduct = typeof trackedProducts.$inferSelect;
export type InsertTrackedProduct = typeof trackedProducts.$inferInsert;
export type TrackedVariant = typeof trackedVariants.$inferSelect;
export type InsertTrackedVariant = typeof trackedVariants.$inferInsert;
export type ProductSnapshot = typeof productSnapshots.$inferSelect;
export type DetectedChange = typeof detectedChanges.$inferSelect;
export type SyncLog = typeof syncLogs.$inferSelect;
export type PriceRule = typeof priceRules.$inferSelect;
export type TrackingSettings = typeof trackingSettings.$inferSelect;
export type ScrapeGatewaySettings = typeof scrapeGatewaySettings.$inferSelect;

// Type exports for new tables
export type ShopifyMemoryProduct = typeof shopifyMemoryProducts.$inferSelect;
export type InsertShopifyMemoryProduct = typeof shopifyMemoryProducts.$inferInsert;
export type ShopifyTransferredProduct = typeof shopifyTransferredProducts.$inferSelect;
export type InsertShopifyTransferredProduct = typeof shopifyTransferredProducts.$inferInsert;
export type ShopifyProductChange = typeof shopifyProductChanges.$inferSelect;
export type InsertShopifyProductChange = typeof shopifyProductChanges.$inferInsert;
export type TelegramNotificationHistory = typeof telegramNotificationHistory.$inferSelect;
export type InsertTelegramNotificationHistory = typeof telegramNotificationHistory.$inferInsert;
export type TelegramNotificationSetting = typeof telegramNotificationSettings.$inferSelect;
export type InsertTelegramNotificationSetting = typeof telegramNotificationSettings.$inferInsert;

// Insert schemas for Telegram tables
export const insertTelegramNotificationSettingSchema = createInsertSchema(telegramNotificationSettings);
export const insertTelegramNotificationHistorySchema = createInsertSchema(telegramNotificationHistory);