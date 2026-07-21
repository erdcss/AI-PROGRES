/**
 * Trendyol renk ailesi — aynı modelin farklı productId/URL renklerini tek Shopify ürününde birleştirir.
 */

import { resolveTrendyolVariants } from "./trendyol-variant-resolver";
import type { SanitizedVariant, SanitizedVariants } from "@shared/trendyol-variant-utils";
import { normalizeTrendyolColorName } from "@shared/trendyol-color-normalizer";
import { isPlaceholderColor } from "@shared/trendyol-variant-utils";
import { filterValidProductImages, normalizeTrendyolImages } from "@shared/trendyol-product-images";
import {
  buildColorFamilyIdentity,
  resolveColorFamilyGroupId,
  type TrendyolColorSiblingCandidate,
} from "./trendyol-color-sibling-extract";
import {
  extractSizesFromProductState,
  isolateMemberVariants,
  normalizeDisplayColorPair,
  resolveColorFromProductState,
  type TrendyolHydratedMemberSnapshot,
} from "./trendyol-hydrated-member";

export {
  COLOR_FAMILY_CONCURRENCY,
  COLOR_FAMILY_MAX_MEMBERS,
  COLOR_FAMILY_MEMBER_TIMEOUT_MS,
  COLOR_FAMILY_MEMBER_HYDRATION_TIMEOUT_MS,
  COLOR_FAMILY_TOTAL_DEADLINE_MS,
  buildColorFamilyIdentity,
  extractColorSiblingCandidatesFromHtml,
  extractColorSiblingCandidatesFromProduct,
  finalizeColorSiblingCandidateList,
  mapPool,
  mergeColorSiblingCandidates,
  normalizeColorSiblingUrl,
  resolveColorFamilyGroupId,
  type TrendyolColorSiblingCandidate,
} from "./trendyol-color-sibling-extract";

export type {
  TrendyolHydratedMemberSnapshot,
  TrendyolHydratedMemberSize,
  TrendyolHydratedMemberVariant,
} from "./trendyol-hydrated-member";

export type TrendyolColorFamilyMember = {
  productId: string;
  url: string;
  finalUrl?: string;
  color: string;
  images: string[];
  rawProductJson?: Record<string, unknown> | null;
  html?: string;
  variants?: SanitizedVariants;
  price?: number | string | null;
  ok: boolean;
  error?: string;
  hydratedSnapshot?: TrendyolHydratedMemberSnapshot;
};

export type TrendyolColorFamily = {
  familyId: string;
  familySourceKey: string;
  rootProductId: string;
  rootUrl: string;
  groupId?: string;
  members: TrendyolColorFamilyMember[];
  colors: string[];
  imagesByColor: Record<string, string[]>;
  sourceAliases: string[];
  diagnostics?: {
    candidateCount: number;
    failedMembers: Array<{ productId: string; url: string; error: string }>;
  };
};

export type ColorFamilyStatusState =
  | "success"
  | "partial"
  | "failed"
  | "not_applicable";

export interface ColorFamilyMemberStatus {
  productId: string;
  color: string;
  sourceUrl: string;
  fetched: boolean;
  hydrated: boolean;
  imageCount: number;
  sizeCount: number;
  variantCount: number;
  variantsWithImage: number;
  imageSource?: string;
  sizeSource?: string;
  error?: string;
  warnings?: string[];
}

export interface ColorFamilyStatus {
  attempted: boolean;
  /** Kardeş sayfa crawl'ı gerçekten denendi mi (BW members listesi) */
  crawlAttempted: boolean;
  applicable: boolean;
  state: ColorFamilyStatusState;
  candidateCount: number;
  fetchedMemberCount: number;
  failedMemberCount: number;
  colorCount: number;
  variantCount: number;
  imageCount: number;
  galleriesWithImages: number;
  expectedGalleryCount: number;
  variantsWithImage: number;
  aliasesCount: number;
  rootProductId?: string;
  familySourceKey?: string;
  colors: string[];
  sourceAliases: string[];
  failedMembers: Array<{
    productId?: string;
    url?: string;
    error?: string;
  }>;
  memberStatuses: ColorFamilyMemberStatus[];
  membersMissingImages: string[];
  membersMissingSizes: string[];
  membersMissingVariants: string[];
  shopifyUploadBlocked?: boolean;
  blockReason?: string;
  message: string;
}

function uniqueNonEmpty(values: Array<string | undefined | null>): string[] {
  return [...new Set(values.map((v) => String(v || "").trim()).filter(Boolean))];
}

function isStrongColorSiblingCandidate(c: TrendyolColorSiblingCandidate): boolean {
  const src = (c.source || "").toLowerCase();
  return (
    src.includes("sliced") ||
    src.includes("coloroption") ||
    src.includes("color-slicer") ||
    src.includes("merchant") ||
    Boolean(c.color && c.color.trim())
  );
}

/**
 * Renk ailesi doğrulama durumu — UI ve Shopify koruması için tek kaynak.
 */
export function buildMemberStatuses(
  members: TrendyolColorFamilyMember[],
): ColorFamilyMemberStatus[] {
  return members.map((m) => {
    const snap = m.hydratedSnapshot;
    const variants = m.variants?.allVariants ?? snap?.variants ?? [];
    const sizes =
      snap?.sizes?.map((s) => s.name) ??
      m.variants?.sizes ??
      variants.map((v) => ("size" in v ? String(v.size || "") : "")).filter(Boolean);
    const images = m.images?.length ? m.images : snap?.images ?? [];
    const variantsWithImage = variants.filter((v) => {
      const img = "image" in v ? v.image : undefined;
      return typeof img === "string" && /^https?:\/\//i.test(img);
    }).length;
    return {
      productId: m.productId,
      color: m.color || snap?.color || "",
      sourceUrl: m.finalUrl || m.url,
      fetched: m.ok,
      hydrated: Boolean(snap?.diagnostics?.hydrationCompleted),
      imageCount: images.length,
      sizeCount: [...new Set(sizes.map((s) => String(s).trim()).filter(Boolean))].length,
      variantCount: variants.length,
      variantsWithImage,
      imageSource: snap?.diagnostics?.imageSourceWinner,
      sizeSource: snap?.sizes?.[0]?.source,
      error: m.ok ? undefined : m.error || "fetch-failed",
      warnings: snap?.diagnostics?.warnings,
    };
  });
}

export function buildColorFamilyStatus(input: {
  attempted: boolean;
  rootProductId?: string;
  candidates?: TrendyolColorSiblingCandidate[];
  members?: TrendyolColorFamilyMember[];
  family?: TrendyolColorFamily | null;
  imagesByColor?: Record<string, string[]>;
  sourceAliases?: string[];
  familySourceKey?: string;
  colors?: string[];
  variants?: Array<{ color?: string; image?: string; size?: string }>;
  mergeError?: string;
  isApparel?: boolean;
}): ColorFamilyStatus {
  const candidates = input.candidates ?? [];
  const members = input.members ?? input.family?.members ?? [];
  const okMembers = members.filter((m) => m.ok);
  const failedMembers = members
    .filter((m) => !m.ok)
    .map((m) => ({
      productId: m.productId,
      url: m.url,
      error: m.error || "fetch-failed",
    }));

  const memberStatuses = buildMemberStatuses(members);
  const membersMissingImages = memberStatuses
    .filter((m) => m.fetched && m.imageCount === 0)
    .map((m) => m.color || m.productId);
  const membersMissingSizes = memberStatuses
    .filter((m) => m.fetched && m.sizeCount === 0)
    .map((m) => m.color || m.productId);
  const membersMissingVariants = memberStatuses
    .filter((m) => m.fetched && m.variantCount === 0)
    .map((m) => m.color || m.productId);

  // Crawl yalnızca BW/members listesi geldiyse denendi sayılır
  const crawlAttempted = members.length > 0;

  const strongCandidates = candidates.filter(isStrongColorSiblingCandidate);
  const candidatePool = strongCandidates.length >= 2 ? strongCandidates : candidates;

  const candidateIds = uniqueNonEmpty(candidatePool.map((c) => c.productId));
  const fetchedIds = uniqueNonEmpty(okMembers.map((m) => m.productId));
  const sourceAliases = uniqueNonEmpty(
    input.sourceAliases ?? input.family?.sourceAliases ?? [],
  );
  const familySourceKey =
    input.familySourceKey || input.family?.familySourceKey || undefined;
  const imagesByColor = input.imagesByColor ?? input.family?.imagesByColor ?? {};
  const colors = uniqueNonEmpty(
    input.colors ??
      input.family?.colors ??
      (okMembers.length ? okMembers.map((m) => m.color) : []) ??
      Object.keys(imagesByColor),
  );
  const variants =
    input.variants ??
    input.family?.members
      ?.filter((m) => m.ok)
      .flatMap((m) => m.variants?.allVariants ?? []) ??
    [];

  const variantColors = uniqueNonEmpty(variants.map((v) => v.color));
  const variantsWithImage = variants.filter(
    (v) => typeof v.image === "string" && /^https?:\/\//i.test(v.image),
  ).length;
  const galleriesWithImages = colors.filter(
    (c) => Array.isArray(imagesByColor[c]) && imagesByColor[c]!.length > 0,
  ).length;
  const expectedGalleryCount = Math.max(colors.length, fetchedIds.length);
  const imageCount = [
    ...new Set(
      Object.values(imagesByColor)
        .flat()
        .filter((u): u is string => typeof u === "string" && /^https?:\/\//i.test(u)),
    ),
  ].length;

  const candidateCount = Math.max(candidateIds.length, candidatePool.length);
  const fetchedMemberCount = fetchedIds.length;
  const failedMemberCount = failedMembers.length;

  const allGalleriesOk =
    expectedGalleryCount >= 2 &&
    galleriesWithImages >= expectedGalleryCount &&
    membersMissingImages.length === 0;
  const allSizesOk = membersMissingSizes.length === 0;
  const allVariantsOk = membersMissingVariants.length === 0;
  const variantsCoverColors =
    variantColors.length >= 2 &&
    colors.every((c) => variantColors.some((vc) => vc.toLowerCase() === c.toLowerCase()));
  const variantsImagesOk =
    variants.length === 0 ? false : variantsWithImage >= Math.min(variants.length, 2);

  const isApparel = input.isApparel !== false;
  const shopifyUploadBlocked =
    crawlAttempted &&
    fetchedMemberCount >= 2 &&
    isApparel &&
    (membersMissingSizes.length > 0 || membersMissingVariants.length > 0);
  const blockReason = shopifyUploadBlocked
    ? "Renk ailesindeki en az bir renk için beden veya varyant bilgisi alınamadı. Eksik ürün aktarımını önlemek için Shopify yüklemesi durduruldu."
    : undefined;

  const base = {
    attempted: input.attempted,
    crawlAttempted,
    candidateCount,
    fetchedMemberCount,
    failedMemberCount,
    colorCount: colors.length,
    variantCount: variants.length,
    imageCount,
    galleriesWithImages,
    expectedGalleryCount,
    variantsWithImage,
    aliasesCount: sourceAliases.length,
    rootProductId: input.rootProductId || input.family?.rootProductId,
    familySourceKey,
    colors,
    sourceAliases,
    failedMembers,
    memberStatuses,
    membersMissingImages,
    membersMissingSizes,
    membersMissingVariants,
    shopifyUploadBlocked,
    blockReason,
  };

  // Crawl hiç denenmedi → failed toast gösterme
  if (!crawlAttempted && !input.mergeError) {
    if (colors.length >= 2) {
      return {
        ...base,
        applicable: false,
        state: "not_applicable",
        message:
          "Aynı ürün sayfasında birden fazla renk var; ayrı productId crawl edilmedi.",
      };
    }
    if (candidateCount >= 2) {
      return {
        ...base,
        applicable: false,
        state: "not_applicable",
        message:
          "Sayfada renk URL adayları görüldü ancak kardeş sayfalar bu istekte çekilmedi.",
      };
    }
    return {
      ...base,
      applicable: false,
      state: "not_applicable",
      message: "Tek renkli ürün — bağlantılı başka productId bulunmadı.",
    };
  }

  const success =
    fetchedMemberCount >= 2 &&
    failedMemberCount === 0 &&
    sourceAliases.length >= 2 &&
    colors.length >= 2 &&
    Boolean(familySourceKey) &&
    allGalleriesOk &&
    allSizesOk &&
    allVariantsOk &&
    variantsCoverColors &&
    variantsImagesOk &&
    !input.mergeError;

  if (success) {
    return {
      ...base,
      applicable: true,
      state: "success",
      message: `${colors.length} renk, ${variants.length} varyant ve ${imageCount} görsel birleştirildi.`,
    };
  }

  // PARTIAL: crawl denendi, en az 2 üye/renk var ama eksikler var
  if (
    !input.mergeError &&
    (fetchedMemberCount >= 2 || (colors.length >= 2 && familySourceKey)) &&
    (failedMemberCount > 0 ||
      !allGalleriesOk ||
      !allSizesOk ||
      !allVariantsOk ||
      !variantsImagesOk ||
      !variantsCoverColors)
  ) {
    return {
      ...base,
      applicable: true,
      state: "partial",
      message:
        failedMemberCount > 0
          ? `${fetchedMemberCount} ürün birleştirildi, ${failedMemberCount} kardeş alınamadı.`
          : membersMissingSizes.length > 0
            ? `Renk ailesi kısmi — beden alınamayan renkler: ${membersMissingSizes.join(", ")}.`
            : membersMissingImages.length > 0
              ? `Renk ailesi kısmi — galeri alınamayan renkler: ${membersMissingImages.join(", ")}.`
              : "Renk ailesi kısmen birleştirildi — bazı galeri veya varyant görselleri eksik.",
    };
  }

  // FAILED: crawl denendi ama aile kurulamadı
  return {
    ...base,
    applicable: true,
    state: "failed",
    message:
      input.mergeError ||
      "Bağlantılı renk ürünleri bulundu ancak aile birleştirilemedi.",
  };
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function pickString(...vals: unknown[]): string {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return "";
}

function collectImageUrls(raw: unknown): string[] {
  const out: string[] = [];
  const push = (u: unknown) => {
    if (typeof u === "string" && /^https?:\/\//i.test(u.trim())) {
      out.push(u.trim().split("?")[0]);
      return;
    }
    const rec = asRecord(u);
    if (!rec) return;
    const url = pickString(rec.url, rec.src, rec.contentUrl, rec.imageUrl, rec.thumbnail);
    if (url && /^https?:\/\//i.test(url)) out.push(url.split("?")[0]);
  };
  if (Array.isArray(raw)) {
    for (const item of raw) push(item);
  } else {
    push(raw);
  }
  return [...new Set(out)];
}

function resolveMemberColor(
  member: {
    color?: string;
    rawProductJson?: Record<string, unknown> | null;
    url: string;
    hydratedSnapshot?: TrendyolHydratedMemberSnapshot;
  },
  _variants: SanitizedVariants,
): string {
  // Öncelik: hydrated snapshot (üye rengi) — root rengine fallback YOK
  if (member.hydratedSnapshot?.color && !isPlaceholderColor(member.hydratedSnapshot.color)) {
    const pair = normalizeDisplayColorPair(member.hydratedSnapshot.color);
    return pair.normalizedColor || pair.displayColor;
  }

  if (member.color && !isPlaceholderColor(member.color)) {
    const pair = normalizeDisplayColorPair(member.color);
    return pair.normalizedColor || pair.displayColor;
  }

  const fromState = resolveColorFromProductState(member.rawProductJson);
  if (fromState.color && !isPlaceholderColor(fromState.color)) return fromState.color;

  const raw = member.rawProductJson;
  const fromRaw = pickString(
    raw?.color,
    raw?.renk,
    asRecord(raw?.product)?.color,
    asRecord(raw?.product)?.renk,
  );
  const normalized = normalizeTrendyolColorName(fromRaw || "");
  if (normalized && !isPlaceholderColor(normalized)) return normalized;

  try {
    const path = new URL(member.url).pathname;
    const slug = path.split("/").filter(Boolean).pop() || "";
    const withoutId = slug.replace(/-p-\d+$/i, "").replace(/-/g, " ");
    return withoutId || "Renk";
  } catch {
    return "Renk";
  }
}

function looksLikeApparel(title: unknown, members: TrendyolColorFamilyMember[]): boolean {
  const t = String(title || "").toLocaleLowerCase("tr-TR");
  if (
    /elbise|tişört|tisort|pantolon|gömlek|etek|sweatshirt|kazak|mont|ceket|şort|tayt|bluz|hırka|yelek|eşofman|mayo|bikini|tunik/.test(
      t,
    )
  ) {
    return true;
  }
  for (const m of members) {
    const sizes = m.hydratedSnapshot?.sizes ?? m.variants?.sizes ?? [];
    if (
      sizes.some((s) =>
        /^(XS|S|M|L|XL|XXL|\d{2})$/i.test(String(typeof s === "string" ? s : (s as { name?: string }).name)),
      )
    ) {
      return true;
    }
  }
  return true;
}

function extractPriceFromProduct(product: Record<string, unknown> | null | undefined): number | string | null {
  if (!product) return null;
  const priceObj = asRecord(product.price);
  const candidates = [
    product.salePrice,
    product.sellingPrice,
    priceObj?.sellingPrice,
    priceObj?.discountedPrice,
    priceObj?.originalPrice,
    priceObj?.value,
    product.price,
  ];
  for (const c of candidates) {
    if (typeof c === "number" && c > 0) return c;
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

function extractImagesFromProduct(product: Record<string, unknown> | null | undefined): string[] {
  if (!product) return [];
  const nested = asRecord(product.product) ?? product;
  return collectImageUrls(
    nested.images ??
      nested.imageUrls ??
      nested.imagesList ??
      nested.image ??
      asRecord(nested.merchantListing)?.images,
  );
}

/**
 * product.colorImages / colorOptions → renk adı ile görsel galerisi.
 * Tek renk adı + tüm renk görselleri karışmasını önlemek için per-color map üretir.
 */
export function extractImagesByColorFromProduct(
  product: unknown,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const root = asRecord(product);
  if (!root) return out;
  const nested = asRecord(root.product) ?? root;

  const push = (colorRaw: string, urls: string[]) => {
    const color =
      normalizeDisplayColorPair(colorRaw).normalizedColor ||
      normalizeTrendyolColorName(colorRaw) ||
      colorRaw.trim();
    if (!color || isPlaceholderColor(color) || !urls.length) return;
    if (!out[color]) out[color] = [];
    for (const u of urls) {
      if (!out[color].includes(u)) out[color].push(u);
    }
  };

  const colorImages = asRecord(nested.colorImages);
  if (colorImages) {
    for (const [key, val] of Object.entries(colorImages)) {
      push(key, collectImageUrls(val));
    }
  }

  for (const key of ["colorOptions", "otherColors", "colorVariants", "otherColorVariants"]) {
    const arr = nested[key];
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      const rec = asRecord(item);
      if (!rec) continue;
      const name = pickString(
        rec.color,
        rec.renk,
        rec.name,
        rec.attributeValue,
        rec.value,
        rec.label,
      );
      const imgs = collectImageUrls(
        rec.images ?? rec.imageUrls ?? rec.image ?? rec.thumbnail ?? rec.thumb,
      );
      if (name) push(name, imgs);
    }
  }

  return out;
}

export function mergeImagesByColorMaps(
  ...maps: Array<Record<string, string[]> | null | undefined>
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const map of maps) {
    if (!map) continue;
    for (const [color, urls] of Object.entries(map)) {
      if (!out[color]) out[color] = [];
      for (const u of urls || []) {
        if (u && !out[color].includes(u)) out[color].push(u);
      }
    }
  }
  return out;
}

function findColorGallery(
  imagesByColor: Record<string, string[]>,
  color: string,
): string[] {
  if (!color) return [];
  if (imagesByColor[color]?.length) return imagesByColor[color]!;
  const key = Object.keys(imagesByColor).find(
    (k) => k.toLocaleLowerCase("tr-TR") === color.toLocaleLowerCase("tr-TR"),
  );
  return key ? imagesByColor[key]! : [];
}

/**
 * Varyantlara renk galerisinden görsel bağlar.
 * Tek renk + çok renk görseli varsa: yalnızca mevcut renk(ler)in galerisini result.images yapar.
 */
export function attachVariantImagesFromColorMap(
  result: Record<string, unknown>,
  imagesByColor: Record<string, string[]>,
): void {
  const variants = asRecord(result.variants);
  if (!variants) return;
  const allVariants = Array.isArray(variants.allVariants)
    ? (variants.allVariants as Array<Record<string, unknown>>)
    : [];
  const colors = Array.isArray(variants.colors)
    ? (variants.colors as string[]).filter(Boolean)
    : [
        ...new Set(
          allVariants
            .map((v) => String(v.color || "").trim())
            .filter((c) => c && !isPlaceholderColor(c)),
        ),
      ];

  for (const v of allVariants) {
    const color = String(v.color || "").trim();
    const gallery = findColorGallery(imagesByColor, color);
    if (!gallery.length) continue;
    if (!v.image) v.image = gallery[0];
    if (!Array.isArray(v.images) || !(v.images as string[]).length) {
      v.images = gallery;
    }
  }

  // Flat gallery: yalnızca varyant renklerinin görselleri (yabancı renk karışmasın)
  if (colors.length >= 1) {
    const scoped: string[] = [];
    const seen = new Set<string>();
    for (const color of colors) {
      for (const img of findColorGallery(imagesByColor, color)) {
        if (seen.has(img)) continue;
        seen.add(img);
        scoped.push(img);
      }
    }
    if (scoped.length) {
      result.images = scoped;
    }
  }

  result.imagesByColor = imagesByColor;
}

/**
 * API/hydration başarısızken adaylardaki renk adı + thumbnail ile soft üye oluşturur.
 * Kardeş bedenleri root’tan miras alır (stok: aday inStock; yoksa true).
 */
export function buildSoftColorFamilyMembersFromCandidates(input: {
  candidates: TrendyolColorSiblingCandidate[];
  rootProductId: string;
  rootColor?: string;
  rootImages?: string[];
  rootVariants?: SanitizedVariants | null;
}): TrendyolColorFamilyMember[] {
  const rootSizes = [
    ...new Set(
      (input.rootVariants?.sizes?.length
        ? input.rootVariants.sizes
        : (input.rootVariants?.allVariants || []).map((v) => v.size)
      ).filter((s): s is string => Boolean(s && String(s).trim())),
    ),
  ];
  const rootStock = new Map<string, boolean>();
  for (const v of input.rootVariants?.allVariants || []) {
    if (!v.size) continue;
    rootStock.set(v.size.toLowerCase(), v.inStock !== false);
  }

  const members: TrendyolColorFamilyMember[] = [];
  for (const c of input.candidates) {
    const isRoot = c.productId === input.rootProductId;
    const colorRaw =
      c.color ||
      (isRoot ? input.rootColor : "") ||
      "";
    const color =
      normalizeDisplayColorPair(colorRaw).normalizedColor ||
      normalizeTrendyolColorName(colorRaw) ||
      colorRaw.trim();
    const rawImages = c.images?.length
      ? c.images
      : c.image
        ? [c.image]
        : isRoot
          ? input.rootImages || []
          : [];
    let images = filterValidProductImages(normalizeTrendyolImages(rawImages));
    // Soft aday thumbnailleri bazen kısa/test CDN yolu olur — https ise koru
    if (!images.length) {
      images = [...new Set(rawImages.filter((u) => /^https?:\/\//i.test(String(u || "").trim())))];
    }

    if (!color) {
      members.push({
        productId: c.productId,
        url: c.url,
        color: "",
        images,
        ok: false,
        error: "soft-no-color",
      });
      continue;
    }
    if (!images.length && !isRoot) {
      members.push({
        productId: c.productId,
        url: c.url,
        color,
        images: [],
        ok: false,
        error: "soft-no-image",
      });
      continue;
    }

    let allVariants: SanitizedVariant[];
    if (isRoot && input.rootVariants?.allVariants?.length) {
      allVariants = input.rootVariants.allVariants.map((v) => ({
        ...v,
        color,
        image: v.image || images[0],
        images: v.images?.length ? v.images : images,
        sourceProductId: v.sourceProductId || c.productId,
        sourceUrl: v.sourceUrl || c.url,
      }));
    } else if (rootSizes.length) {
      allVariants = rootSizes.map((size) => ({
        color,
        size,
        inStock: isRoot
          ? rootStock.get(size.toLowerCase()) !== false
          : c.inStock !== false,
        image: images[0],
        images,
        sourceProductId: c.productId,
        sourceUrl: c.url,
      }));
    } else {
      allVariants = [
        {
          color,
          size: "",
          inStock: c.inStock !== false,
          image: images[0],
          images,
          sourceProductId: c.productId,
          sourceUrl: c.url,
        },
      ];
    }

    const sizes = [...new Set(allVariants.map((v) => v.size).filter(Boolean))];
    members.push({
      productId: c.productId,
      url: c.url,
      color,
      images,
      ok: true,
      variants: { colors: [color], sizes, allVariants },
      error: isRoot ? undefined : "soft-candidate",
    });
  }
  return members;
}

/**
 * Her rengin kendi bedenlerini korur — global colors × sizes çaprazı YOK.
 */
export function buildColorFamilyVariantMatrix(
  members: TrendyolColorFamilyMember[],
): SanitizedVariants {
  const allVariants: SanitizedVariant[] = [];
  const colors: string[] = [];
  const sizes: string[] = [];

  for (const member of members) {
    if (!member.ok) continue;
    const color = member.color || "Renk";
    if (color && !colors.includes(color)) colors.push(color);

    const memberVariants = member.variants?.allVariants?.length
      ? member.variants.allVariants
      : member.variants?.sizes?.length
        ? member.variants.sizes.map((size) => ({
            color,
            size,
            inStock: true,
          }))
        : [];

    if (!memberVariants.length) continue;

    const firstImage = member.images[0];
    for (const v of memberVariants) {
      const size = (v.size || "").trim();
      const vColor = v.color && !isPlaceholderColor(v.color) ? v.color : color;
      if (vColor.toLocaleLowerCase("tr-TR") !== color.toLocaleLowerCase("tr-TR")) continue;
      if (size && !sizes.includes(size)) sizes.push(size);
      allVariants.push({
        color,
        size,
        inStock: v.inStock !== false,
        colorCode: v.colorCode,
        image: v.image || firstImage,
        images: v.images?.length ? v.images : member.images,
        sourceProductId: v.sourceProductId || member.productId,
        sourceUrl: v.sourceUrl || member.finalUrl || member.url,
        listingId: v.listingId,
        price: v.price ?? member.price ?? undefined,
        stockCount: v.stockCount,
      });
    }
  }

  return { colors, sizes, allVariants };
}

export type ColorFamilyMergeInput = {
  result: Record<string, unknown>;
  rootUrl: string;
  rootProductId: string;
  rootHtml?: string;
  rootRawProduct?: Record<string, unknown> | null;
  members: TrendyolColorFamilyMember[];
  candidates?: TrendyolColorSiblingCandidate[];
};

/**
 * Browser Worker yokken kardeş renkleri Trendyol API ile çeker.
 * Her üyeden kendi beden/stok/görselleri alınır — çapraz üretimsiz.
 */
export async function fetchColorFamilyMembersViaApi(
  candidates: TrendyolColorSiblingCandidate[],
  rootProductId: string,
): Promise<TrendyolColorFamilyMember[]> {
  const { fetchTrendyolProductByUrl } = await import("./trendyol-product-api");
  const { mapPool, COLOR_FAMILY_CONCURRENCY, COLOR_FAMILY_MAX_MEMBERS } = await import(
    "./trendyol-color-sibling-extract"
  );

  const unique = new Map<string, TrendyolColorSiblingCandidate>();
  for (const c of candidates) {
    if (!c.productId || unique.has(c.productId)) continue;
    unique.set(c.productId, c);
  }
  const list = [...unique.values()].slice(0, COLOR_FAMILY_MAX_MEMBERS);
  if (list.length < 2) return [];

  console.log(
    `[ColorFamily] API fallback: ${list.length} aday (root=${rootProductId})`,
  );

  return mapPool(list, COLOR_FAMILY_CONCURRENCY, async (candidate) => {
    try {
      let product: Record<string, unknown> | null = null;
      let images: string[] = [];
      let title = "";
      let price: number | undefined;

      const api = await fetchTrendyolProductByUrl(candidate.url).catch(() => null);
      if (api?.rawProduct) {
        product = api.rawProduct;
        images = api.images ?? [];
        title = api.title || "";
        price = api.price?.original;
      }

      // API boşsa kardeş HTML state’ten dene (local scrape yolu)
      if (!product) {
        try {
          const { fetchTrendyolDirectHtmlRaw } = await import("./trendyol-direct-html");
          const { getTrendyolProductFromHtml } = await import("./trendyol-product-state");
          const htmlResult = await fetchTrendyolDirectHtmlRaw(candidate.url, 1);
          const html = htmlResult?.html;
          if (html && html.length >= 500) {
            product = getTrendyolProductFromHtml(html);
            if (product && images.length === 0) {
              images = filterValidProductImages(
                normalizeTrendyolImages(
                  (product as { images?: unknown }).images ??
                    (product as { imageUrls?: unknown }).imageUrls,
                ),
              );
            }
          }
        } catch {
          // soft-fail HTML
        }
      }

      if (!product) {
        return {
          productId: candidate.productId,
          url: candidate.url,
          color: candidate.color || "",
          images: candidate.images ?? (candidate.image ? [candidate.image] : []),
          ok: false,
          error: "api-empty",
        } satisfies TrendyolColorFamilyMember;
      }

      const colorResolved = resolveColorFromProductState(product, candidate.color);
      const color =
        colorResolved.color ||
        normalizeDisplayColorPair(candidate.color || "").normalizedColor ||
        candidate.color ||
        "Renk";

      if (images.length === 0) {
        images = filterValidProductImages(
          normalizeTrendyolImages(
            (product as { images?: unknown }).images ??
              (product as { imageUrls?: unknown }).imageUrls,
          ),
        );
      }
      if (images.length === 0 && candidate.images?.length) {
        images = candidate.images;
      } else if (images.length === 0 && candidate.image) {
        images = [candidate.image];
      }

      const sizes = extractSizesFromProductState(product);
      const resolved = resolveTrendyolVariants({
        product,
        url: candidate.url,
        productTitle: title || undefined,
      });

      const isolated = isolateMemberVariants({
        memberColor: color,
        memberProductId: candidate.productId,
        memberUrl: candidate.url,
        memberImage: images[0],
        sizes,
        rawVariants: resolved.allVariants.map((v) => ({
          color: v.color,
          size: v.size,
          inStock: v.inStock,
          stockCount: v.stockCount,
          price: typeof v.price === "number" ? v.price : undefined,
          image: v.image,
          sourceProductId: v.sourceProductId,
          productId: candidate.productId,
        })),
      });

      const sizeNames = [...new Set(isolated.map((v) => v.size).filter(Boolean))];
      const oos = isolated.filter((v) => v.inStock === false).map((v) => v.size);

      console.log(
        `[ColorFamily] API member=${candidate.productId}:${color} sizes=${sizeNames.join(",") || "(none)"} oos=${oos.join(",") || "—"} images=${images.length}`,
      );

      return {
        productId: candidate.productId,
        url: candidate.url,
        finalUrl: candidate.url,
        color,
        images,
        rawProductJson: product,
        ok: true,
        price,
        variants: {
          colors: [color],
          sizes: sizeNames,
          allVariants: isolated.map((v) => ({
            color,
            size: v.size || "",
            inStock: v.inStock !== false,
            stockCount: v.stockCount ?? undefined,
            image: v.image || images[0],
            images,
            sourceProductId: candidate.productId,
            sourceUrl: candidate.url,
            price: v.price,
          })),
        },
      } satisfies TrendyolColorFamilyMember;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`[ColorFamily] API memberFailed=${candidate.productId}:${message}`);
      return {
        productId: candidate.productId,
        url: candidate.url,
        color: candidate.color || "",
        images: candidate.images ?? (candidate.image ? [candidate.image] : []),
        ok: false,
        error: message,
      } satisfies TrendyolColorFamilyMember;
    }
  });
}

/**
 * En az 2 farklı productId varsa renk ailesini scrape result'a yazar.
 * Başarısız kardeşler diagnostics'e düşer; ana scrape başarılı kalabilir.
 */
export function mergeColorFamilyIntoScrapeResult(input: ColorFamilyMergeInput): {
  applied: boolean;
  family: TrendyolColorFamily | null;
} {
  const preparedMembers: TrendyolColorFamilyMember[] = [];

  for (const member of input.members) {
    if (!member.ok) {
      preparedMembers.push(member);
      continue;
    }

    const snap = member.hydratedSnapshot;
    const product =
      member.rawProductJson && typeof member.rawProductJson === "object"
        ? (asRecord(member.rawProductJson)?.product as Record<string, unknown> | undefined) ??
          member.rawProductJson
        : null;

    let images =
      snap?.images?.length
        ? snap.images
        : member.images.length > 0
          ? member.images
          : filterValidProductImages(
              normalizeTrendyolImages(
                extractImagesFromProduct(product ?? member.rawProductJson ?? undefined),
              ),
            );

    const color = resolveMemberColor(
      {
        color: snap?.color || member.color,
        rawProductJson: product ?? member.rawProductJson,
        url: member.url,
        hydratedSnapshot: snap,
      },
      { colors: [], sizes: [], allVariants: [] },
    );

    let isolated = snap?.variants?.length
      ? snap.variants.map((v) => ({
          color,
          size: v.size,
          inStock: v.inStock !== false,
          stockCount: v.stockCount ?? null,
          price: v.price,
          image: v.image || images[0],
          images,
          sourceProductId: v.sourceProductId || member.productId,
          sourceUrl: v.sourceUrl || member.finalUrl || member.url,
        }))
      : [];

    if (!isolated.length && snap?.sizes?.length) {
      isolated = isolateMemberVariants({
        memberColor: color,
        memberProductId: member.productId,
        memberUrl: member.finalUrl || member.url,
        memberImage: images[0],
        sizes: snap.sizes,
      }).map((v) => ({
        ...v,
        image: images[0],
        images,
      }));
    }

    if (!isolated.length) {
      const resolved = resolveTrendyolVariants({
        product: product ?? undefined,
        html: member.html,
        url: member.finalUrl || member.url,
        productTitle: typeof input.result.title === "string" ? input.result.title : undefined,
      });
      const rawVariants =
        member.variants?.allVariants?.length &&
        member.variants.allVariants.length >= resolved.allVariants.length
          ? member.variants.allVariants
          : resolved.allVariants.length > 0
            ? resolved.allVariants
            : member.variants?.allVariants ?? [];

      const sizesFromState = extractSizesFromProductState(product ?? member.rawProductJson);
      isolated = isolateMemberVariants({
        memberColor: color,
        memberProductId: member.productId,
        memberUrl: member.finalUrl || member.url,
        memberImage: images[0],
        sizes: sizesFromState,
        rawVariants: rawVariants.map((v) => ({
          color: v.color,
          size: v.size,
          inStock: v.inStock,
          stockCount: v.stockCount,
          price: typeof v.price === "number" ? v.price : undefined,
          image: v.image,
          sourceProductId: v.sourceProductId,
          productId: v.sourceProductId,
        })),
      }).map((v) => ({
        ...v,
        image: images[0],
        images,
      }));
    }

    const sizes = [...new Set(isolated.map((v) => v.size).filter(Boolean))];

    const enrichedVariants: SanitizedVariants = {
      colors: [color],
      sizes,
      allVariants: isolated.map((v) => ({
        color,
        size: v.size || "",
        inStock: v.inStock !== false,
        image: v.image || images[0],
        images: images.length ? images : v.images,
        sourceProductId: v.sourceProductId || member.productId,
        sourceUrl: v.sourceUrl || member.finalUrl || member.url,
        price: v.price ?? extractPriceFromProduct(product) ?? member.price ?? undefined,
        stockCount: v.stockCount ?? undefined,
      })),
    };

    preparedMembers.push({
      ...member,
      color,
      images,
      variants: enrichedVariants,
      price: member.price ?? extractPriceFromProduct(product),
      hydratedSnapshot: snap,
    });
  }

  const okMembers = preparedMembers.filter((m) => m.ok);
  const uniqueIds = new Set(okMembers.map((m) => m.productId));
  if (uniqueIds.size < 2) {
    console.log(
      `[ColorFamily] rootProductId=${input.rootProductId} skip=single-or-empty uniqueIds=${uniqueIds.size}`,
    );
    const status = buildColorFamilyStatus({
      attempted: true,
      rootProductId: input.rootProductId,
      candidates: input.candidates,
      members: preparedMembers,
      isApparel: looksLikeApparel(input.result.title, preparedMembers),
    });
    input.result.colorFamilyStatus = status;
    if (status.shopifyUploadBlocked) {
      input.result.shopifyUploadBlocked = true;
      input.result.shopifyUploadBlockReason = status.blockReason;
    }
    return { applied: false, family: null };
  }

  const groupId = resolveColorFamilyGroupId(input.rootRawProduct);
  const identity = buildColorFamilyIdentity({
    rootProductId: input.rootProductId,
    memberProductIds: [...uniqueIds],
    groupId,
  });

  const matrix = buildColorFamilyVariantMatrix(okMembers);
  const imagesByColor: Record<string, string[]> = {};
  const orderedImages: string[] = [];
  const seenImg = new Set<string>();

  const rootMember = okMembers.find((m) => m.productId === input.rootProductId) ?? okMembers[0];
  const orderedMembers = rootMember
    ? [rootMember, ...okMembers.filter((m) => m.productId !== rootMember.productId)]
    : okMembers;

  for (const m of orderedMembers) {
    imagesByColor[m.color] = m.images;
    for (const img of m.images) {
      if (seenImg.has(img)) continue;
      seenImg.add(img);
      orderedImages.push(img);
    }
  }

  const failedMembers = preparedMembers
    .filter((m) => !m.ok)
    .map((m) => ({
      productId: m.productId,
      url: m.url,
      error: m.error || "fetch-failed",
    }));

  const family: TrendyolColorFamily = {
    familyId: identity.familyId,
    familySourceKey: identity.familySourceKey,
    rootProductId: input.rootProductId,
    rootUrl: input.rootUrl,
    groupId,
    members: preparedMembers,
    colors: matrix.colors,
    imagesByColor,
    sourceAliases: identity.sourceAliases,
    diagnostics: {
      candidateCount: input.candidates?.length ?? uniqueIds.size,
      failedMembers,
    },
  };

  input.result.colorFamily = family;
  input.result.imagesByColor = imagesByColor;
  input.result.sourceAliases = identity.sourceAliases;
  input.result.familySourceKey = identity.familySourceKey;
  input.result.images = orderedImages;
  input.result.variants = {
    colors: matrix.colors,
    sizes: matrix.sizes,
    allVariants: matrix.allVariants,
    items: matrix.allVariants,
  };
  const status = buildColorFamilyStatus({
    attempted: true,
    rootProductId: input.rootProductId,
    candidates: input.candidates,
    members: preparedMembers,
    family,
    imagesByColor,
    sourceAliases: identity.sourceAliases,
    familySourceKey: identity.familySourceKey,
    colors: matrix.colors,
    variants: matrix.allVariants,
    isApparel: looksLikeApparel(input.result.title, preparedMembers),
  });
  input.result.colorFamilyStatus = status;
  if (status.shopifyUploadBlocked) {
    input.result.shopifyUploadBlocked = true;
    input.result.shopifyUploadBlockReason = status.blockReason;
  }

  console.log(`[ColorFamily] rootProductId=${input.rootProductId}`);
  console.log(`[ColorFamily] candidates=${input.candidates?.length ?? 0}`);
  console.log(
    `[ColorFamily] memberFetched=${okMembers.map((m) => `${m.productId}:${m.color}`).join(",")}`,
  );
  if (failedMembers.length) {
    console.log(
      `[ColorFamily] memberFailed=${failedMembers.map((m) => `${m.productId}:${m.error}`).join(",")}`,
    );
  }
  console.log(`[ColorFamily] colors=${matrix.colors.join(",")}`);
  console.log(`[ColorFamily] variants=${matrix.allVariants.length}`);
  console.log(`[ColorFamily] images=${orderedImages.length}`);
  console.log(`[ColorFamily] sourceAliases=${identity.sourceAliases.join(",")}`);
  console.log(`[ColorFamily] status=${status.state}`);

  return { applied: true, family };
}
