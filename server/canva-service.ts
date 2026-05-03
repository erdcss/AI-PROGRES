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

async function uploadAssetByUrl(imageUrl: string, assetName: string, token: string): Promise<string | null> {
  const response = await axios.post(
    `${CANVA_BASE_URL}/url-asset-uploads`,
    {
      name: truncateName(assetName),
      url: imageUrl
    },
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      timeout: 20000
    }
  );

  return response.data?.job?.id || null;
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

        const jobId = await uploadAssetByUrl(img.url, assetName, freshToken);

        if (jobId) {
          successCount++;
          console.log(`✅ [Canva] Sıraya alındı ${i + 1}/${uniqueImages.length}: "${assetName}" (job: ${jobId})`);
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
