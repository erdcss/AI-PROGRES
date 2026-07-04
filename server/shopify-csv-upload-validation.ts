export function assertCsvUploadReady(
  csvContent: unknown,
  csvInfo?: { ready?: boolean; productCount?: number },
): { ok: true } | { ok: false; error: string; step: string } {
  const hasInlineCsv = typeof csvContent === 'string' && csvContent.trim().length >= 50;

  if ((csvInfo?.ready === false || csvInfo?.productCount === 0) && !hasInlineCsv) {
    return {
      ok: false,
      error: 'CSV hazır değil — önce geçerli fiyatlı ürün verisi çekin.',
      step: 'csv_not_ready',
    };
  }

  if (!hasInlineCsv) {
    return {
      ok: false,
      error: 'CSV içeriği eksik veya çok kısa',
      step: 'csv_missing',
    };
  }

  return { ok: true };
}

/** Upload isteğinde CSV yoksa productData'dan sunucuda üret */
export async function resolveUploadCsvContent(
  csvContent: unknown,
  productData: unknown,
  options?: { sourceUrl?: string; productTitle?: string },
): Promise<{ ok: true; csvContent: string; generated: boolean } | { ok: false; error: string; step: string }> {
  const inline = typeof csvContent === 'string' ? csvContent.trim() : '';
  if (inline.length >= 50) {
    return { ok: true, csvContent: inline, generated: false };
  }

  if (productData && typeof productData === 'object') {
    const { buildScrapeCsvContent } = await import('./scrape-csv-builder');
    const record = productData as Record<string, unknown>;
    const merged: Record<string, unknown> = {
      ...record,
      title: options?.productTitle || record.title,
    };
    const sourceUrl =
      options?.sourceUrl ||
      (typeof record.sourceUrl === 'string' ? record.sourceUrl : undefined) ||
      (typeof record.originalUrl === 'string' ? record.originalUrl : undefined);

    const generated = await buildScrapeCsvContent(merged, sourceUrl);
    if (generated && generated.trim().length >= 50) {
      return { ok: true, csvContent: generated, generated: true };
    }
  }

  return {
    ok: false,
    error: 'CSV içeriği eksik — ürün verisinden CSV oluşturulamadı. Fiyat ve görsel kontrol edin.',
    step: 'csv_missing',
  };
}
