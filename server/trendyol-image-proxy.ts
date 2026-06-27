import axios from "axios";
import { getTrendyolImageFallbackUrls } from "@shared/trendyol-product-images";

const IMAGE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Safari/537.36",
  Accept: "image/avif,image/webp,image/apng,image/jpeg,image/png,image/*,*/*;q=0.8",
  "Accept-Language": "tr-TR,tr;q=0.9",
  Referer: "https://www.trendyol.com/",
};

const MIN_IMAGE_BYTES = 512;

function isValidImageResponse(data: ArrayBuffer, contentType?: string): boolean {
  if (!data || data.byteLength < MIN_IMAGE_BYTES) return false;
  const type = (contentType || "").toLowerCase();
  if (type.includes("gif") && data.byteLength < MIN_IMAGE_BYTES) return false;
  if (type.includes("xml") || type.includes("json") || type.includes("text/html")) return false;
  return true;
}

async function fetchImageBuffer(url: string): Promise<{ data: Buffer; contentType: string } | null> {
  try {
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      headers: IMAGE_HEADERS,
      timeout: 10000,
      maxRedirects: 5,
      validateStatus: (status) => status >= 200 && status < 300,
    });

    const contentType = String(response.headers["content-type"] || "image/jpeg");
    const data = Buffer.from(response.data);

    if (!isValidImageResponse(data, contentType)) return null;
    return { data, contentType };
  } catch {
    return null;
  }
}

/** Trendyol CDN görselini alternatif URL'lerle dener */
export async function fetchTrendyolProxiedImage(
  imageUrl: string,
): Promise<{ data: Buffer; contentType: string } | null> {
  if (!imageUrl || !/(cdn\.dsmcdn\.com|cdn\.trendyol\.com)/.test(imageUrl)) {
    return null;
  }

  for (const candidate of getTrendyolImageFallbackUrls(imageUrl)) {
    const result = await fetchImageBuffer(candidate);
    if (result) return result;
  }

  return null;
}
