import axios from 'axios';
import { getCanvaAccessToken, isCanvaConnected } from './canva-oauth';

const CANVA_BASE_URL = 'https://api.canva.com/rest/v1';

interface CanvaImage {
  url: string;
  color?: string;
  position?: number;
}

function truncateName(name: string, maxLen = 200): string {
  if (name.length <= maxLen) return name;
  return name.substring(0, maxLen - 3) + '...';
}

/**
 * Downloads image from URL and uploads to Canva via binary upload.
 * Uses POST /rest/v1/asset-uploads with:
 *   Content-Type: application/octet-stream
 *   Asset-Upload-Metadata: base64(JSON({name}))
 */
async function uploadImageToCanva(imageUrl: string, assetName: string, token: string): Promise<string | null> {
  // 1. Download image as binary buffer
  const downloadRes = await axios.get(imageUrl, {
    responseType: 'arraybuffer',
    timeout: 20000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Turmarkt/1.0)',
      'Referer': 'https://www.trendyol.com/'
    }
  });

  const imageBuffer = Buffer.from(downloadRes.data);
  const name = truncateName(assetName);

  // 2. Build Asset-Upload-Metadata header (base64-encoded JSON with "name_base64" field)
  const metadataJson = JSON.stringify({ name_base64: Buffer.from(name).toString('base64') });
  const metadataHeader = Buffer.from(metadataJson).toString('base64');

  // 3. Detect content type from URL or response headers
  const contentType = (downloadRes.headers['content-type'] as string) || 'image/jpeg';
  const safeContentType = contentType.startsWith('image/') ? contentType : 'image/jpeg';

  // 4. Upload binary to Canva
  const uploadRes = await axios.post(
    `${CANVA_BASE_URL}/asset-uploads`,
    imageBuffer,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
        'Asset-Upload-Metadata': metadataHeader
      },
      timeout: 30000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    }
  );

  // Response: { job: { id, status } } — async job
  const jobId = uploadRes.data?.job?.id;
  return jobId || null;
}

export class CanvaService {

  static isEnabled(): boolean {
    return isCanvaConnected();
  }

  static async sendProductImages(
    productTitle: string,
    images: CanvaImage[]
  ): Promise<void> {
    const token = getCanvaAccessToken();
    if (!token) {
      console.warn('⚠️ [Canva] Bağlı değil - görsel yükleme atlanıyor (Ayarlar > Canva Bağla)');
      return;
    }

    if (!images || images.length === 0) {
      console.log('[Canva] Yüklenecek görsel yok:', productTitle);
      return;
    }

    const uniqueImages = images.filter(
      (img, idx, arr) =>
        img.url &&
        img.url.startsWith('http') &&
        !img.url.endsWith('.svg') &&
        !img.url.includes('css') &&
        arr.findIndex(i => i.url === img.url) === idx
    );

    if (uniqueImages.length === 0) {
      console.log('[Canva] Geçerli görsel URL yok:', productTitle);
      return;
    }

    console.log(`🎨 [Canva] ${uniqueImages.length} görsel yükleniyor: "${productTitle}"`);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < uniqueImages.length; i++) {
      const img = uniqueImages[i];
      const position = img.position || (i + 1);
      const colorSuffix = img.color && img.color !== 'none' ? ` - ${img.color}` : '';
      const shortTitle = productTitle.substring(0, 40);
      const assetName = `${shortTitle}${colorSuffix} #${position}`;

      try {
        const freshToken = getCanvaAccessToken();
        if (!freshToken) {
          console.error('❌ [Canva] Token artık geçersiz, yükleme durduruluyor');
          break;
        }

        const jobId = await uploadImageToCanva(img.url, assetName, freshToken);

        if (jobId) {
          successCount++;
          console.log(`✅ [Canva] Yüklendi ${i + 1}/${uniqueImages.length}: "${assetName}" (job: ${jobId})`);
        } else {
          failCount++;
          console.warn(`⚠️ [Canva] Görsel ${i + 1} için job ID dönmedi`);
        }
      } catch (err: any) {
        failCount++;
        const status = err.response?.status || 'no status';
        const responseData = err.response?.data
          ? JSON.stringify(err.response.data)
          : err.message;
        console.error(`❌ [Canva] Görsel ${i + 1} başarısız [HTTP ${status}]: ${responseData}`);

        if (status === 401) {
          console.error('❌ [Canva] Token geçersiz. Ayarlar > Canva Bağla ile yeniden bağlanın.');
          break;
        }
        if (status === 429) {
          console.warn('⏳ [Canva] Rate limit - 4 saniye bekleniyor...');
          await new Promise(r => setTimeout(r, 4000));
        }
      }

      // 600ms between uploads to respect rate limits (30 req/min)
      if (i < uniqueImages.length - 1) {
        await new Promise(r => setTimeout(r, 600));
      }
    }

    console.log(`🎨 [Canva] Tamamlandı: "${productTitle}" → ${successCount} başarılı, ${failCount} hatalı`);
  }
}
