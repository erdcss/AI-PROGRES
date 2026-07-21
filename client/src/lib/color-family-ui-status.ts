/**
 * Renk ailesi UI durum çözümleyicisi — backend colorFamilyStatus öncelikli.
 */

export type ColorFamilyUiState =
  | "success"
  | "partial"
  | "failed"
  | "not_applicable"
  | "unknown";

export interface ColorFamilyUiCheck {
  key: string;
  label: string;
  ok: boolean;
  warning?: boolean;
  value?: string;
}

export interface ColorFamilyUiStatus {
  state: ColorFamilyUiState;
  title: string;
  description: string;
  checks: ColorFamilyUiCheck[];
  colorCount: number;
  memberCount: number;
  failedCount: number;
  familySourceKey?: string;
  sourceAliases: string[];
  failedMembers: Array<{ productId?: string; url?: string; error?: string }>;
  memberStatuses: Array<{
    productId: string;
    color: string;
    sourceUrl?: string;
    fetched: boolean;
    hydrated?: boolean;
    imageCount: number;
    sizeCount: number;
    variantCount: number;
    variantsWithImage?: number;
    imageSource?: string;
    sizeSource?: string;
    error?: string;
    warnings?: string[];
  }>;
  imagesByColor: Record<string, string[]>;
  backendState?: string;
  shopifyUploadBlocked?: boolean;
  blockReason?: string;
}

type PreviewLike = {
  colorFamilyStatus?: {
    attempted?: boolean;
    crawlAttempted?: boolean;
    applicable?: boolean;
    state?: string;
    candidateCount?: number;
    fetchedMemberCount?: number;
    failedMemberCount?: number;
    colorCount?: number;
    variantCount?: number;
    imageCount?: number;
    galleriesWithImages?: number;
    expectedGalleryCount?: number;
    variantsWithImage?: number;
    aliasesCount?: number;
    rootProductId?: string;
    familySourceKey?: string;
    colors?: string[];
    sourceAliases?: string[];
    failedMembers?: Array<{ productId?: string; url?: string; error?: string }>;
    memberStatuses?: Array<{
      productId?: string;
      color?: string;
      sourceUrl?: string;
      fetched?: boolean;
      hydrated?: boolean;
      imageCount?: number;
      sizeCount?: number;
      variantCount?: number;
      variantsWithImage?: number;
      imageSource?: string;
      sizeSource?: string;
      error?: string;
      warnings?: string[];
    }>;
    membersMissingImages?: string[];
    membersMissingSizes?: string[];
    membersMissingVariants?: string[];
    shopifyUploadBlocked?: boolean;
    blockReason?: string;
    message?: string;
  };
  colorFamily?: {
    familySourceKey?: string;
    rootProductId?: string;
    colors?: string[];
    sourceAliases?: string[];
    imagesByColor?: Record<string, string[]>;
    members?: Array<{
      productId?: string;
      color?: string;
      images?: string[];
      ok?: boolean;
      error?: string;
      url?: string;
    }>;
    diagnostics?: {
      candidateCount?: number;
      failedMembers?: Array<{ productId?: string; url?: string; error?: string }>;
    };
  };
  familySourceKey?: string;
  sourceAliases?: string[];
  imagesByColor?: Record<string, string[]>;
  variants?: {
    colors?: string[];
    allVariants?: Array<{
      color?: string;
      size?: string;
      image?: string;
      sourceProductId?: string;
    }>;
  };
};

function dedupe(values: Array<string | undefined | null>): string[] {
  return [...new Set(values.map((v) => String(v || "").trim()).filter(Boolean))];
}

function titlesFor(state: ColorFamilyUiState): { title: string; description: string } {
  switch (state) {
    case "success":
      return {
        title: "Renk ailesi çalıştı",
        description: "Bağlantılı renk ürünleri tek Shopify ürününde birleştirildi.",
      };
    case "partial":
      return {
        title: "Renk ailesi kısmi",
        description: "Aile kısmen birleştirildi; bazı kardeşler veya görseller eksik.",
      };
    case "failed":
      return {
        title: "Renk ailesi başarısız",
        description:
          "Bağlantılı renk ürünleri bulundu ancak aile birleştirilemedi. Yanlış aktarımı önlemek için dikkat edin.",
      };
    case "not_applicable":
      return {
        title: "Tek renkli ürün",
        description: "Bağlantılı başka productId bulunmadı — bu bir hata değil.",
      };
    default:
      return {
        title: "Renk ailesi doğrulanmadı",
        description: "Bu sonuç renk ailesi sistemiyle doğrulanmamış olabilir (eski payload).",
      };
  }
}

function buildChecks(input: {
  candidateCount: number;
  fetchedMemberCount: number;
  failedMemberCount: number;
  colorCount: number;
  galleriesWithImages: number;
  expectedGalleryCount: number;
  variantsWithImage: number;
  variantCount: number;
  aliasesCount: number;
  familySourceKey?: string;
}): ColorFamilyUiCheck[] {
  const galleryOk =
    input.expectedGalleryCount >= 2
      ? input.galleriesWithImages >= input.expectedGalleryCount
      : input.galleriesWithImages > 0 || input.expectedGalleryCount <= 1;
  const galleryWarn =
    input.expectedGalleryCount >= 2 &&
    input.galleriesWithImages > 0 &&
    input.galleriesWithImages < input.expectedGalleryCount;

  const variantImgOk =
    input.variantCount === 0
      ? false
      : input.variantsWithImage >= Math.min(input.variantCount, Math.max(input.colorCount, 1));
  const variantImgWarn =
    input.variantCount > 0 &&
    input.variantsWithImage > 0 &&
    input.variantsWithImage < input.variantCount;

  return [
    {
      key: "candidates",
      label: "Kardeş ürünler tespit edildi",
      ok: input.candidateCount >= 2,
      value: String(input.candidateCount),
    },
    {
      key: "members",
      label: "Kardeş sayfalar çekildi",
      ok: input.fetchedMemberCount >= 2 && input.failedMemberCount === 0,
      warning: input.fetchedMemberCount >= 2 && input.failedMemberCount > 0,
      value: `${input.fetchedMemberCount} ok / ${input.failedMemberCount} hata`,
    },
    {
      key: "colors",
      label: "Renkler birleştirildi",
      ok: input.colorCount >= 2,
      value: String(input.colorCount),
    },
    {
      key: "galleries",
      label: "Renk galerileri alındı",
      ok: galleryOk,
      warning: galleryWarn,
      value: `${input.galleriesWithImages}/${Math.max(input.expectedGalleryCount, input.colorCount)}`,
    },
    {
      key: "variant-images",
      label: "Varyant görselleri bağlandı",
      ok: variantImgOk,
      warning: variantImgWarn,
      value: `${input.variantsWithImage}/${input.variantCount}`,
    },
    {
      key: "family-key",
      label: "Aile anahtarı oluşturuldu",
      ok: Boolean(input.familySourceKey),
      value: input.familySourceKey || "—",
    },
    {
      key: "aliases",
      label: "Kaynak alias’ları oluşturuldu",
      ok: input.aliasesCount >= 2,
      value: String(input.aliasesCount),
    },
  ];
}

function inferFromLegacy(preview: PreviewLike): ColorFamilyUiStatus {
  const family = preview.colorFamily;
  const familySourceKey = preview.familySourceKey || family?.familySourceKey;
  const sourceAliases = dedupe([
    ...(preview.sourceAliases || []),
    ...(family?.sourceAliases || []),
  ]);
  const imagesByColor = preview.imagesByColor || family?.imagesByColor || {};
  const members = family?.members || [];
  const okMembers = members.filter((m) => m.ok !== false);
  const failedMembers =
    family?.diagnostics?.failedMembers ||
    members
      .filter((m) => m.ok === false)
      .map((m) => ({ productId: m.productId, url: m.url, error: m.error }));

  const colors = dedupe([
    ...(family?.colors || []),
    ...(preview.variants?.colors || []),
    ...Object.keys(imagesByColor),
    ...okMembers.map((m) => m.color),
  ]);
  const variants = preview.variants?.allVariants || [];
  const variantsWithImage = variants.filter(
    (v) => typeof v.image === "string" && v.image.startsWith("http"),
  ).length;
  const galleriesWithImages = colors.filter(
    (c) => Array.isArray(imagesByColor[c]) && imagesByColor[c]!.length > 0,
  ).length;

  const hasAnyFamilyField = Boolean(
    family ||
      familySourceKey ||
      sourceAliases.length ||
      Object.keys(imagesByColor).length ||
      members.length,
  );

  if (!hasAnyFamilyField) {
    const colorCount = preview.variants?.colors?.length ?? 0;
    if (colorCount >= 2) {
      // Backend status gelmemiş ama çok renk var — unknown yerine net mesaj
      const { title, description } = titlesFor("not_applicable");
      return {
        state: "not_applicable",
        title: "Çok renkli (tek ürün)",
        description:
          "Sayfada birden fazla renk var; renk ailesi kardeş URL birleştirmesi uygulanmadı veya doğrulanamadı.",
        checks: buildChecks({
          candidateCount: 0,
          fetchedMemberCount: 0,
          failedMemberCount: 0,
          colorCount,
          galleriesWithImages: 0,
          expectedGalleryCount: 0,
          variantsWithImage: 0,
          variantCount: variants.length,
          aliasesCount: 0,
        }),
        colorCount,
        memberCount: 0,
        failedCount: 0,
        sourceAliases: [],
        failedMembers: [],
        imagesByColor: {},
      };
    }
    const { title, description } = titlesFor("unknown");
    return {
      state: "unknown",
      title,
      description,
      checks: [],
      colorCount: 0,
      memberCount: 0,
      failedCount: 0,
      sourceAliases: [],
      failedMembers: [],
      imagesByColor: {},
    };
  }

  const candidateCount = Math.max(
    family?.diagnostics?.candidateCount ?? 0,
    sourceAliases.length,
    members.length,
  );
  const fetchedMemberCount = okMembers.length || (familySourceKey && colors.length >= 2 ? colors.length : 0);
  const failedCount = failedMembers.length;
  const expectedGalleryCount = Math.max(colors.length, fetchedMemberCount);

  let state: ColorFamilyUiState = "unknown";
  if (
    fetchedMemberCount >= 2 &&
    failedCount === 0 &&
    sourceAliases.length >= 2 &&
    colors.length >= 2 &&
    familySourceKey &&
    galleriesWithImages >= expectedGalleryCount &&
    variantsWithImage >= Math.min(variants.length, 2)
  ) {
    state = "success";
  } else if (candidateCount >= 2 && (fetchedMemberCount < 2 || colors.length < 2 || !familySourceKey)) {
    state = "failed";
  } else if (
    (fetchedMemberCount >= 2 || colors.length >= 2 || sourceAliases.length >= 2) &&
    (failedCount > 0 || galleriesWithImages < expectedGalleryCount || !familySourceKey)
  ) {
    state = "partial";
  } else if (candidateCount < 2 && sourceAliases.length < 2 && colors.length <= 1) {
    state = "not_applicable";
  }

  // colors >= 2 alone must NOT be success
  if (state === "success" && (!familySourceKey || sourceAliases.length < 2)) {
    state = "partial";
  }

  const { title, description } = titlesFor(state);
  return {
    state,
    title,
    description,
    checks: buildChecks({
      candidateCount,
      fetchedMemberCount,
      failedMemberCount: failedCount,
      colorCount: colors.length,
      galleriesWithImages,
      expectedGalleryCount,
      variantsWithImage,
      variantCount: variants.length,
      aliasesCount: sourceAliases.length,
      familySourceKey,
    }),
    colorCount: colors.length,
    memberCount: fetchedMemberCount,
    failedCount,
    familySourceKey,
    sourceAliases,
    failedMembers,
    memberStatuses: [],
    imagesByColor,
  };
}

export function resolveColorFamilyUiStatus(preview: PreviewLike | null | undefined): ColorFamilyUiStatus {
  if (!preview) {
    const { title, description } = titlesFor("unknown");
    return {
      state: "unknown",
      title,
      description,
      checks: [],
      colorCount: 0,
      memberCount: 0,
      failedCount: 0,
      sourceAliases: [],
      failedMembers: [],
      memberStatuses: [],
      imagesByColor: {},
    };
  }

  const status = preview.colorFamilyStatus;
  if (status && typeof status.state === "string") {
    const state = (
      ["success", "partial", "failed", "not_applicable"].includes(status.state)
        ? status.state
        : "unknown"
    ) as ColorFamilyUiState;

    const sourceAliases = dedupe(status.sourceAliases || []);
    const imagesByColor = preview.imagesByColor || preview.colorFamily?.imagesByColor || {};
    const colors = dedupe(status.colors || Object.keys(imagesByColor));
    const familySourceKey = status.familySourceKey || preview.familySourceKey;
    const variants = preview.variants?.allVariants || [];
    const variantsWithImage =
      status.variantsWithImage ??
      variants.filter((v) => typeof v.image === "string" && v.image.startsWith("http")).length;

    const memberStatuses = (status.memberStatuses || []).map((m) => ({
      productId: String(m.productId || ""),
      color: String(m.color || ""),
      sourceUrl: m.sourceUrl,
      fetched: m.fetched !== false,
      hydrated: m.hydrated,
      imageCount: m.imageCount ?? 0,
      sizeCount: m.sizeCount ?? 0,
      variantCount: m.variantCount ?? 0,
      variantsWithImage: m.variantsWithImage,
      imageSource: m.imageSource,
      sizeSource: m.sizeSource,
      error: m.error,
      warnings: m.warnings,
    }));

    const { title, description: defaultDesc } = titlesFor(state);
    return {
      state,
      title,
      description: status.message || defaultDesc,
      checks: buildChecks({
        candidateCount: status.candidateCount ?? 0,
        fetchedMemberCount: status.fetchedMemberCount ?? 0,
        failedMemberCount: status.failedMemberCount ?? 0,
        colorCount: status.colorCount ?? colors.length,
        galleriesWithImages: status.galleriesWithImages ?? 0,
        expectedGalleryCount: status.expectedGalleryCount ?? colors.length,
        variantsWithImage,
        variantCount: status.variantCount ?? variants.length,
        aliasesCount: status.aliasesCount ?? sourceAliases.length,
        familySourceKey,
      }),
      colorCount: status.colorCount ?? colors.length,
      memberCount: status.fetchedMemberCount ?? 0,
      failedCount: status.failedMemberCount ?? 0,
      familySourceKey,
      sourceAliases,
      failedMembers: status.failedMembers || [],
      memberStatuses,
      imagesByColor,
      backendState: status.state,
      shopifyUploadBlocked: status.shopifyUploadBlocked,
      blockReason: status.blockReason,
    };
  }

  return inferFromLegacy(preview);
}

/** Shopify yükleme engeli — failed aile veya eksik bedenli kıyafet ailesi */
export function shouldBlockShopifyForColorFamily(preview: PreviewLike | null | undefined): boolean {
  const status = preview?.colorFamilyStatus;
  if (!status) return false;
  if (status.shopifyUploadBlocked === true) return true;
  if ((status.membersMissingSizes?.length ?? 0) > 0 && (status.fetchedMemberCount ?? 0) >= 2) {
    return true;
  }
  if ((status.membersMissingVariants?.length ?? 0) > 0 && (status.fetchedMemberCount ?? 0) >= 2) {
    return true;
  }
  if (status.state !== "failed") return false;
  if (status.crawlAttempted === false) return false;
  const candidates = status.candidateCount ?? 0;
  return candidates >= 2 && !status.familySourceKey && (status.colorCount ?? 0) < 2;
}
