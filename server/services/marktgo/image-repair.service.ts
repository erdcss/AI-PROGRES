import { getMarktGoClientForConnection } from "./connection.service";
import { prepareMarktGoImages } from "./images";

export type MarktGoImageRepairResult = {
  attempted: boolean;
  repaired: boolean;
  imageCount: number;
};

/**
 * syncProductToMarktGo intentionally short-circuits when a mapped product already
 * exists. That is normally fast, but it used to leave products that were created
 * without images permanently image-less. Re-apply the current verified gallery
 * to an existing product after a successful lookup.
 */
export async function repairExistingMarktGoProductImages(
  externalProductId: string | number | null | undefined,
  rawImages: unknown,
  connectionId?: number,
): Promise<MarktGoImageRepairResult> {
  const id = String(externalProductId || "").trim();
  const images = await prepareMarktGoImages(Array.isArray(rawImages) ? rawImages : [], 12);

  if (!id || images.length === 0) {
    return { attempted: false, repaired: false, imageCount: images.length };
  }

  const { client } = await getMarktGoClientForConnection(connectionId);
  await client.patch(`/products/${encodeURIComponent(id)}`, { images });

  return {
    attempted: true,
    repaired: true,
    imageCount: images.length,
  };
}
