import TelegramBot from 'node-telegram-bot-api';
import axios from 'axios';
import { db } from './db';
import { shopifySyncLogs } from '@shared/schema';
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

}
