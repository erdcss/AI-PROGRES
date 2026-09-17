import { getMarktGoClientForConnection } from "./connection.service";
import { prepareMarktGoImages } from "./images";
import { normalizeMarktGoProduct } from "./normalize";
import { MarktGoApiError } from "./errors";

export type MarktGoImageRepairResult = {
  attempted: boolean;
  repaired: boolean;
  verified: boolean;
  imageCount: number;
  remoteImageCount: number;
  missingImageCount: number;
  attempts: number;
};

const VERIFY_DELAYS_MS = [0, 250, 700, 1_400];

function imageIdentityKey(url: string): string {
  return String(url || "")
    .trim()
    .replace(/\/mnresize\/\d+\/\d+\//i, "/")
    .replace(/\/ty\d+\//i, "/")
    .split("?")[0]
    .replace(/_org(?:_zoom)?(?=\.[a-z]+$)/i, "")
    .toLowerCase();
}

function imageIntegrity(expected: string[], remote: string[]) {
  const expectedKeys = new Set(expected.map(imageIdentityKey).filter(Boolean));
  const remoteKeys = new Set(remote.map(imageIdentityKey).filter(Boolean));
  let matched = 0;
  for (const key of expectedKeys) {
    if (remoteKeys.has(key)) matched += 1;
  }

  // MARKT-GO may proxy/re-host the image URLs. In that case path identity no longer
  // matches, so equal-or-higher remote count is an acceptable second verification.
  const verified =
    expectedKeys.size === 0 ||
    matched === expectedKeys.size ||
    remote.length >= expected.length;

  return {
    verified,
    missingImageCount: verified ? 0 : Math.max(0, expected.length - remote.length),
  };
}

async function readRemoteImages(
  client: Awaited<ReturnType<typeof getMarktGoClientForConnection>>["client"],
  externalProductId: string,
): Promise<string[]> {
  const raw = await client.get<unknown>(`/products/${encodeURIComponent(externalProductId)}`);
  return normalizeMarktGoProduct(raw).images;
}

async function wait(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Re-apply the full verified gallery and confirm that MARKT-GO actually persisted
 * it. This runs for both newly created and already existing products from the
 * route layer. A product is never reported as a successful automatic transfer
 * when MARKT-GO persisted fewer images than the prepared source gallery.
 */
export async function repairExistingMarktGoProductImages(
  externalProductId: string | number | null | undefined,
  rawImages: unknown,
  connectionId?: number,
): Promise<MarktGoImageRepairResult> {
  const id = String(externalProductId || "").trim();
  const images = await prepareMarktGoImages(Array.isArray(rawImages) ? rawImages : [], 12);

  if (!id || images.length === 0) {
    return {
      attempted: false,
      repaired: false,
      verified: images.length === 0,
      imageCount: images.length,
      remoteImageCount: 0,
      missingImageCount: 0,
      attempts: 0,
    };
  }

  const { client } = await getMarktGoClientForConnection(connectionId);

  let remoteImages = await readRemoteImages(client, id).catch(() => [] as string[]);
  let integrity = imageIntegrity(images, remoteImages);
  if (integrity.verified) {
    return {
      attempted: true,
      repaired: false,
      verified: true,
      imageCount: images.length,
      remoteImageCount: remoteImages.length,
      missingImageCount: 0,
      attempts: 0,
    };
  }

  let attempts = 0;
  for (const delay of VERIFY_DELAYS_MS) {
    attempts += 1;
    if (delay > 0) await wait(delay);

    await client.patch(`/products/${encodeURIComponent(id)}`, { images });
    remoteImages = await readRemoteImages(client, id).catch(() => [] as string[]);
    integrity = imageIntegrity(images, remoteImages);
    if (integrity.verified) {
      return {
        attempted: true,
        repaired: true,
        verified: true,
        imageCount: images.length,
        remoteImageCount: remoteImages.length,
        missingImageCount: 0,
        attempts,
      };
    }
  }

  throw new MarktGoApiError(
    `MARKT-GO görsel doğrulaması başarısız: ${images.length} görsel gönderildi, ${remoteImages.length} görsel kayıtlı. İşlem otomatik olarak yeniden denenecek.`,
    502,
    "image_sync_incomplete",
    true,
  );
}
