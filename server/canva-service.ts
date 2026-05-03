import axios from 'axios';

const CANVA_API_TOKEN = process.env.CANVA_API_TOKEN;
const CANVA_BASE_URL = 'https://api.canva.com/rest/v1';

if (!CANVA_API_TOKEN) {
  console.warn('⚠️ CANVA_API_TOKEN not set - Canva upload disabled');
} else {
  console.log('✅ CanvaService: CANVA_API_TOKEN loaded');
}

interface CanvaImage {
  url: string;
  color?: string;
  position?: number;
}

function truncateName(name: string, maxLen = 200): string {
  if (name.length <= maxLen) return name;
  return name.substring(0, maxLen - 3) + '...';
}

async function uploadAssetByUrl(imageUrl: string, assetName: string): Promise<string | null> {
  if (!CANVA_API_TOKEN) return null;

  const response = await axios.post(
    `${CANVA_BASE_URL}/url-asset-uploads`,
    {
      name: truncateName(assetName),
      url: imageUrl
    },
    {
      headers: {
        'Authorization': `Bearer ${CANVA_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      timeout: 20000
    }
  );

  const jobId = response.data?.job?.id;
  return jobId || null;
}

export class CanvaService {

  static isEnabled(): boolean {
    return !!CANVA_API_TOKEN;
  }

  static async sendProductImages(
    productTitle: string,
    images: CanvaImage[]
  ): Promise<void> {
    if (!CANVA_API_TOKEN) {
      console.warn('⚠️ [Canva] CANVA_API_TOKEN not set - skipping');
      return;
    }

    if (!images || images.length === 0) {
      console.log('[Canva] No images to upload for:', productTitle);
      return;
    }

    const uniqueImages = images.filter(
      (img, idx, arr) =>
        img.url &&
        img.url.startsWith('http') &&
        !img.url.endsWith('.svg') &&
        arr.findIndex(i => i.url === img.url) === idx
    );

    if (uniqueImages.length === 0) {
      console.log('[Canva] No valid image URLs for:', productTitle);
      return;
    }

    console.log(`🎨 [Canva] Uploading ${uniqueImages.length} images for: "${productTitle}"`);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < uniqueImages.length; i++) {
      const img = uniqueImages[i];
      const position = img.position || (i + 1);
      const colorSuffix = img.color && img.color !== 'none' ? ` - ${img.color}` : '';
      const shortTitle = productTitle.substring(0, 40);
      const assetName = `${shortTitle}${colorSuffix} #${position}`;

      try {
        const jobId = await uploadAssetByUrl(img.url, assetName);

        if (jobId) {
          successCount++;
          console.log(`✅ [Canva] Queued ${i + 1}/${uniqueImages.length}: "${assetName}" (job: ${jobId})`);
        } else {
          failCount++;
          console.warn(`⚠️ [Canva] No job ID returned for image ${i + 1}`);
        }
      } catch (err: any) {
        failCount++;
        const status = err.response?.status || 'no status';
        const responseData = err.response?.data
          ? JSON.stringify(err.response.data)
          : err.message;
        console.error(`❌ [Canva] Image ${i + 1} failed [HTTP ${status}]: ${responseData}`);

        if (status === 401) {
          console.error('❌ [Canva] Token geçersiz veya asset:write yetkisi yok. Canva Developer Portal\'dan token\'ı kontrol edin.');
          break;
        }
        if (status === 429) {
          console.warn('⏳ [Canva] Rate limit - 3 saniye bekleniyor...');
          await new Promise(r => setTimeout(r, 3000));
        }
      }

      if (i < uniqueImages.length - 1) {
        await new Promise(r => setTimeout(r, 600));
      }
    }

    console.log(`🎨 [Canva] Tamamlandı: "${productTitle}" → ${successCount} başarılı, ${failCount} hatalı`);
  }
}
