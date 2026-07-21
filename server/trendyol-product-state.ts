/** Trendyol __PRODUCT_DETAIL_APP_INITIAL_STATE__ JSON çıkarımı */

export function extractBalancedJsonObject(
  html: string,
  startIndex: number,
): unknown | null {
  const open = html.indexOf("{", startIndex);
  if (open === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = open; i < html.length; i++) {
    const ch = html[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (inString && ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(open, i + 1));
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

export function parseTrendyolProductDetailState(html: string): Record<string, unknown> | null {
  const markers = [
    "window.__PRODUCT_DETAIL_APP_INITIAL_STATE__=",
    "window.__PRODUCT_DETAIL_APP_INITIAL_STATE__ =",
    "__PRODUCT_DETAIL_APP_INITIAL_STATE__=",
    "__PRODUCT_DETAIL_APP_INITIAL_STATE__ =",
  ];

  for (const marker of markers) {
    const idx = html.indexOf(marker);
    if (idx === -1) continue;
    const state = extractBalancedJsonObject(html, idx + marker.length);
    if (state && typeof state === "object") {
      return state as Record<string, unknown>;
    }
  }

  return null;
}

export function getTrendyolProductFromState(html: string): Record<string, unknown> | null {
  const state = parseTrendyolProductDetailState(html);
  const product = state?.product;
  return product && typeof product === "object" ? (product as Record<string, unknown>) : null;
}

/** __NEXT_DATA__ içinden ürün — state bloğu yoksa (canlı sayfa / bot yanıtı) */
export function getTrendyolProductFromNextData(html: string): Record<string, unknown> | null {
  const match = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!match?.[1]) return null;
  try {
    const data = JSON.parse(match[1]);
    const product =
      data?.props?.pageProps?.product ||
      data?.props?.pageProps?.initialState?.product ||
      data?.props?.pageProps?.initialState?.productDetail?.product;
    return product && typeof product === "object" ? (product as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** State veya __NEXT_DATA__ — hangisi doluysa */
export function getTrendyolProductFromHtml(html: string): Record<string, unknown> | null {
  return getTrendyolProductFromState(html) || getTrendyolProductFromNextData(html);
}
