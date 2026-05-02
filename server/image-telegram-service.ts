import axios from 'axios';
import { parse } from 'csv-parse/sync';

const TELEGRAM_IMAGE_BOT_TOKEN = process.env.TELEGRAM_IMAGE_BOT_TOKEN;
const DEFAULT_CHAT_ID = '1219880063';

if (!TELEGRAM_IMAGE_BOT_TOKEN) {
  console.error('❌ TELEGRAM_IMAGE_BOT_TOKEN is not set');
} else {
  console.log('✅ ImageTelegramService: TELEGRAM_IMAGE_BOT_TOKEN loaded');
}

interface ProductImage {
  url: string;
  color?: string;
  position?: number;
}

async function sendTelegramMessage(chatId: string, text: string): Promise<void> {
  if (!TELEGRAM_IMAGE_BOT_TOKEN) return;
  await axios.post(
    `https://api.telegram.org/bot${TELEGRAM_IMAGE_BOT_TOKEN}/sendMessage`,
    { chat_id: chatId, text, parse_mode: 'HTML' },
    { timeout: 10000 }
  );
}

async function sendTelegramMediaGroup(chatId: string, mediaGroup: any[]): Promise<void> {
  if (!TELEGRAM_IMAGE_BOT_TOKEN) return;
  await axios.post(
    `https://api.telegram.org/bot${TELEGRAM_IMAGE_BOT_TOKEN}/sendMediaGroup`,
    { chat_id: chatId, media: mediaGroup },
    { timeout: 30000 }
  );
}

async function sendTelegramPhoto(chatId: string, imageUrl: string, caption: string): Promise<void> {
  if (!TELEGRAM_IMAGE_BOT_TOKEN) return;
  await axios.post(
    `https://api.telegram.org/bot${TELEGRAM_IMAGE_BOT_TOKEN}/sendPhoto`,
    { chat_id: chatId, photo: imageUrl, caption, parse_mode: 'HTML' },
    { timeout: 15000 }
  );
}

export class ImageTelegramService {

  static async sendProductImages(
    productTitle: string,
    productUrl: string,
    images: ProductImage[],
    userIdOrChatId: number | string,
    shopifyProductId?: string
  ): Promise<void> {
    if (!TELEGRAM_IMAGE_BOT_TOKEN) {
      console.warn('⚠️ TELEGRAM_IMAGE_BOT_TOKEN not set - skipping image send');
      return;
    }

    if (!images || images.length === 0) {
      console.log('📸 No images to send for:', productTitle);
      return;
    }

    const chatId = String(userIdOrChatId || DEFAULT_CHAT_ID);

    try {
      console.log(`📸 [ImageBot] Sending ${images.length} images for: ${productTitle}`);

      // Header message
      const headerText =
        `🖼️ <b>Ürün Görselleri</b>\n\n` +
        `📦 <b>Ürün:</b> ${productTitle}\n` +
        (productUrl ? `🔗 <b>Trendyol:</b> ${productUrl}\n` : '') +
        (shopifyProductId ? `🛍️ <b>Shopify ID:</b> ${shopifyProductId}\n` : '') +
        `📸 <b>Toplam Görsel:</b> ${images.length}\n` +
        `────────────────────`;

      await sendTelegramMessage(chatId, headerText);

      // Deduplicate images by URL
      const uniqueImages = images.filter(
        (img, idx, arr) => arr.findIndex(i => i.url === img.url) === idx
      );

      // Send in media groups of up to 10
      const batchSize = 10;
      for (let i = 0; i < uniqueImages.length; i += batchSize) {
        const batch = uniqueImages.slice(i, i + batchSize);

        // Try sendMediaGroup first (faster - single API call for up to 10 images)
        try {
          const mediaGroup = batch.map((img, batchIdx) => {
            const globalIdx = i + batchIdx + 1;
            const caption =
              `📸 ${globalIdx}/${uniqueImages.length}` +
              (img.color ? ` 🎨 ${img.color}` : '') +
              (img.position ? ` 📍 #${img.position}` : '');
            return {
              type: 'photo',
              media: img.url,
              ...(batchIdx === 0 ? { caption, parse_mode: 'HTML' } : {})
            };
          });

          await sendTelegramMediaGroup(chatId, mediaGroup);
          console.log(`✅ [ImageBot] Sent media group ${Math.floor(i / batchSize) + 1}: ${batch.length} images`);
        } catch (groupError: any) {
          // Fallback: send individually if media group fails (e.g. one bad URL)
          console.warn(`⚠️ [ImageBot] Media group failed, sending individually: ${groupError.message}`);
          for (let j = 0; j < batch.length; j++) {
            const img = batch[j];
            const globalIdx = i + j + 1;
            const caption =
              `📸 ${globalIdx}/${uniqueImages.length}` +
              (img.color ? `\n🎨 Renk: ${img.color}` : '') +
              (img.position ? `\n📍 Pozisyon: ${img.position}` : '');
            try {
              await sendTelegramPhoto(chatId, img.url, caption);
              console.log(`✅ [ImageBot] Sent image ${globalIdx}/${uniqueImages.length}`);
            } catch (photoError: any) {
              console.error(`❌ [ImageBot] Failed to send image ${globalIdx}: ${photoError.message}`);
            }
            // Small delay between individual sends
            if (j < batch.length - 1) {
              await new Promise(r => setTimeout(r, 300));
            }
          }
        }

        // Delay between batches to respect rate limits
        if (i + batchSize < uniqueImages.length) {
          await new Promise(r => setTimeout(r, 1000));
        }
      }

      console.log(`✅ [ImageBot] All images sent for: ${productTitle}`);
    } catch (error: any) {
      console.error(`❌ [ImageBot] Error sending images for ${productTitle}: ${error.message}`);
      // Don't throw — non-critical
    }
  }

  /**
   * Extract images from CSV content using proper CSV parser (not naive split)
   */
  static extractImagesFromCSV(csvContent: string): ProductImage[] {
    try {
      const records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true
      });

      const uniqueUrls = new Set<string>();
      const images: ProductImage[] = [];

      records.forEach((record: any) => {
        // Support both old and new Shopify CSV column names
        const imageUrl =
          record['Product image URL'] ||
          record['Image Src'] ||
          record['Image URL'] ||
          '';

        const option1 = record['Option1 value'] || record['Option1 Value'] || '';

        if (imageUrl && imageUrl.trim().startsWith('http') && !uniqueUrls.has(imageUrl)) {
          uniqueUrls.add(imageUrl);
          images.push({
            url: imageUrl.trim(),
            color: option1 || undefined,
            position: images.length + 1
          });
        }
      });

      return images;
    } catch (err) {
      console.warn('⚠️ [ImageBot] CSV parse failed, returning empty images:', err);
      return [];
    }
  }
}
