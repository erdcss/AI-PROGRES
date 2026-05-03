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

interface CanvaUploadResult {
  assetId: string;
  name: string;
}

async function downloadImageBuffer(imageUrl: string): Promise<Buffer> {
  const response = await axios.get(imageUrl, {
    responseType: 'arraybuffer',
    timeout: 15000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://www.trendyol.com/'
    }
  });
  return Buffer.from(response.data);
}

async function uploadAssetToCanva(
  imageBuffer: Buffer,
  assetName: string,
  contentType: string = 'image/jpeg'
): Promise<CanvaUploadResult | null> {
  if (!CANVA_API_TOKEN) return null;

  const nameBase64 = Buffer.from(assetName, 'utf-8').toString('base64');

  const response = await axios.post(
    `${CANVA_BASE_URL}/assets/upload`,
    imageBuffer,
    {
      headers: {
        'Authorization': `Bearer ${CANVA_API_TOKEN}`,
        'Asset-Upload-Metadata': JSON.stringify({ name_base64: nameBase64 }),
        'Content-Type': contentType
      },
      timeout: 30000,
      maxBodyLength: Infinity
    }
  );

  const asset = response.data?.asset;
  if (asset?.id) {
    return { assetId: asset.id, name: assetName };
  }
  return null;
}

function detectContentType(imageUrl: string): string {
  const lower = imageUrl.toLowerCase();
  if (lower.includes('.png')) return 'image/png';
  if (lower.includes('.webp')) return 'image/webp';
  if (lower.includes('.gif')) return 'image/gif';
  return 'image/jpeg';
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
      (img, idx, arr) => arr.findIndex(i => i.url === img.url) === idx
    );

    console.log(`🎨 [Canva] Starting upload of ${uniqueImages.length} images for: "${productTitle}"`);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < uniqueImages.length; i++) {
      const img = uniqueImages[i];
      const position = img.position || (i + 1);
      const colorSuffix = img.color && img.color !== 'none' ? ` - ${img.color}` : '';
      const assetName = `${productTitle}${colorSuffix} #${position}`;

      try {
        const buffer = await downloadImageBuffer(img.url);
        const contentType = detectContentType(img.url);
        const result = await uploadAssetToCanva(buffer, assetName, contentType);

        if (result) {
          successCount++;
          console.log(`✅ [Canva] Uploaded ${i + 1}/${uniqueImages.length}: "${assetName}" (ID: ${result.assetId})`);
        } else {
          failCount++;
          console.warn(`⚠️ [Canva] Upload returned no asset ID for image ${i + 1}`);
        }
      } catch (err: any) {
        failCount++;
        console.error(`❌ [Canva] Failed to upload image ${i + 1}: ${err.message}`);
      }

      // Rate limiting: 500ms between uploads
      if (i < uniqueImages.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    console.log(`🎨 [Canva] Upload complete for "${productTitle}": ${successCount} success, ${failCount} failed`);
  }
}
