import TelegramBot from 'node-telegram-bot-api';
import axios from 'axios';
import { db } from '../db';
import { shopifySyncLogs } from '../shared/schema';
import { eq } from 'drizzle-orm';

const TELEGRAM_IMAGE_BOT_TOKEN = process.env.TELEGRAM_IMAGE_BOT_TOKEN;

if (!TELEGRAM_IMAGE_BOT_TOKEN) {
  console.error('❌ TELEGRAM_IMAGE_BOT_TOKEN is not set');
}

let imageBot: TelegramBot | null = null;

if (TELEGRAM_IMAGE_BOT_TOKEN) {
  imageBot = new TelegramBot(TELEGRAM_IMAGE_BOT_TOKEN, { polling: false });
}

interface ProductImage {
  url: string;
  color?: string;
  position?: number;
}

export class ImageTelegramService {
  private static async downloadImage(url: string): Promise<Buffer> {
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      return Buffer.from(response.data);
    } catch (error) {
      console.error(`❌ Error downloading image ${url}:`, error);
      throw error;
    }
  }

  static async sendProductImages(
    productTitle: string,
    productUrl: string,
    images: ProductImage[],
    userId: number,
    shopifyProductId?: string
  ): Promise<void> {
    if (!imageBot) {
      console.warn('⚠️ Image Telegram bot not initialized - skipping image send');
      return;
    }

    if (!images || images.length === 0) {
      console.log('📸 No images to send for product:', productTitle);
      return;
    }

    try {
      console.log(`📸 Sending ${images.length} images for product: ${productTitle}`);

      // Header message
      const headerMessage = `🖼️ **Ürün Görselleri**\n\n` +
        `📦 **Ürün:** ${productTitle}\n` +
        `🔗 **Trendyol:** ${productUrl}\n` +
        (shopifyProductId ? `🛍️ **Shopify ID:** ${shopifyProductId}\n` : '') +
        `📸 **Toplam Görsel:** ${images.length}\n` +
        `\n────────────────────`;

      await imageBot.sendMessage(userId, headerMessage, { parse_mode: 'Markdown' });

      // Send images in batches to avoid rate limiting
      const batchSize = 10;
      for (let i = 0; i < images.length; i += batchSize) {
        const batch = images.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async (image, index) => {
          const globalIndex = i + index + 1;
          try {
            const imageBuffer = await this.downloadImage(image.url);
            
            const caption = `📸 Görsel ${globalIndex}/${images.length}` +
              (image.color ? `\n🎨 Renk: ${image.color}` : '') +
              (image.position ? `\n📍 Pozisyon: ${image.position}` : '');

            await imageBot!.sendPhoto(userId, imageBuffer, {
              caption,
              parse_mode: 'Markdown'
            });

            console.log(`✅ Sent image ${globalIndex}/${images.length} for ${productTitle}`);
          } catch (error) {
            console.error(`❌ Failed to send image ${globalIndex}:`, error);
          }
        }));

        // Small delay between batches
        if (i + batchSize < images.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      console.log(`✅ All images sent for product: ${productTitle}`);
    } catch (error) {
      console.error('❌ Error sending product images:', error);
      throw error;
    }
  }

  static async sendShopifySyncImages(
    syncLogId: number,
    userId: number
  ): Promise<void> {
    try {
      // Get sync log details
      const syncLog = await db.query.shopifySyncLogs.findFirst({
        where: eq(shopifySyncLogs.id, syncLogId)
      });

      if (!syncLog) {
        console.error('❌ Sync log not found:', syncLogId);
        return;
      }

      if (syncLog.status !== 'success') {
        console.log('⚠️ Sync not successful, skipping image send');
        return;
      }

      // Parse product data from sync log
      const productData = syncLog.productData as any;
      if (!productData) {
        console.log('⚠️ No product data in sync log');
        return;
      }

      // Extract images from product data
      const images: ProductImage[] = [];
      
      if (productData.images && Array.isArray(productData.images)) {
        productData.images.forEach((img: any, index: number) => {
          images.push({
            url: img.src || img.url || img,
            position: index + 1
          });
        });
      }

      // Also check variants for images
      if (productData.variants && Array.isArray(productData.variants)) {
        productData.variants.forEach((variant: any) => {
          if (variant.image_src || variant.image) {
            const imageUrl = variant.image_src || variant.image?.src || variant.image;
            if (imageUrl && !images.find(img => img.url === imageUrl)) {
              images.push({
                url: imageUrl,
                color: variant.option1 || variant.color
              });
            }
          }
        });
      }

      await this.sendProductImages(
        productData.title || 'Unknown Product',
        productData.originalUrl || '',
        images,
        userId,
        syncLog.shopifyProductId?.toString()
      );

    } catch (error) {
      console.error('❌ Error in sendShopifySyncImages:', error);
      throw error;
    }
  }
}
