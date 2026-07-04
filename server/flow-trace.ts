export interface FlowTraceContext {
  activeRoute?: string;
  scrapeEndpoint?: string;
  scraperModule?: string;
  variantExtractor?: string;
  normalizer?: string;
  previewSource?: string;
  csvSource?: "fresh" | "cached";
}

export interface CacheGuardContext {
  cleared?: boolean;
  oldCsvDeleted?: boolean;
  localPreviewInvalidated?: boolean;
  scrapeRunId?: string;
  previewSourceProductId?: string;
  sourceUrl?: string;
}

/** Her scrape işleminde aktif akışı terminalde kanıtlar */
export function logFlowTrace(ctx: FlowTraceContext): void {
  if (ctx.activeRoute) console.log(`[FlowTrace] activeRoute=${ctx.activeRoute}`);
  if (ctx.scrapeEndpoint) console.log(`[FlowTrace] scrapeEndpoint=${ctx.scrapeEndpoint}`);
  if (ctx.scraperModule) console.log(`[FlowTrace] scraperModule=${ctx.scraperModule}`);
  if (ctx.variantExtractor) console.log(`[FlowTrace] variantExtractor=${ctx.variantExtractor}`);
  if (ctx.normalizer) console.log(`[FlowTrace] normalizer=${ctx.normalizer}`);
  if (ctx.previewSource) console.log(`[FlowTrace] previewSource=${ctx.previewSource}`);
  if (ctx.csvSource) console.log(`[FlowTrace] csvSource=${ctx.csvSource}`);
}

/** Yeni scrape başladığında cache invalidation logları */
export function logCacheGuard(ctx: CacheGuardContext): void {
  if (ctx.cleared) console.log("[CacheGuard] cleared previous preview state");
  if (ctx.oldCsvDeleted) console.log("[CacheGuard] oldCsvDeleted=true");
  if (ctx.localPreviewInvalidated) console.log("[CacheGuard] localPreviewInvalidated=true");
  if (ctx.scrapeRunId) console.log(`[CacheGuard] scrapeRunId=${ctx.scrapeRunId}`);
  if (ctx.previewSourceProductId) {
    console.log(`[CacheGuard] previewSourceProductId=${ctx.previewSourceProductId}`);
  }
}
