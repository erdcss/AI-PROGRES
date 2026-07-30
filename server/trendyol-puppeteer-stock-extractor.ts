/**
 * Puppeteer/Playwright — gerçek DOM'dan varyant stok çıkarımı
 */
import type { Page } from "puppeteer";
import type { PuppeteerStockSnapshot } from "./trendyol-variant-stock-normalizer";

const SIZE_PATTERN =
  /^(XXS|XS|S|M|L|XL|XXL|XXXL|2XL|3XL|4XL|5XL|STD|STANDART|TEK\s*EBAT|TEK\s*BEDEN|ONE\s*SIZE|\d{2,3})$/i;

const OOS_TEXT = /tükendi|tukendi|stokta yok|satışa kapalı|gelince haber ver|ürün tükenmiştir|beden tükendi/i;

function isValidSizeLabel(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 12) return false;
  if (OOS_TEXT.test(t)) return false;
  if (/sepete ekle|şimdi al|son \d+ ürün|kupon|popüler|yorum/i.test(t)) return false;
  return SIZE_PATTERN.test(t);
}

/** page.evaluate içinde çalışacak DOM stok okuyucu — dış scope referansı yok */
export function domStockEvaluateScript(): PuppeteerStockSnapshot {
  const OOS_TEXT = /tükendi|tukendi|stokta yok|satışa kapalı|gelince haber ver|ürün tükenmiştir|beden tükendi/i;

  const snapshot: PuppeteerStockSnapshot = {
    colors: [],
    sizesByColor: {},
    productInStock: true,
    source: "dom",
  };

  const pushColor = (name: string, inStock = true) => {
    const n = name.trim();
    if (!n || n.length > 40 || /^\d+$/.test(n)) return;
    if (!snapshot.colors.some((c) => c.name.toLowerCase() === n.toLowerCase())) {
      snapshot.colors.push({ name: n, inStock });
    }
  };

  const inspectElement = (el: Element): { inStock: boolean; reason?: string } => {
    const htmlEl = el as HTMLElement;
    const cls = (el.getAttribute("class") || "").toLowerCase();
    const aria = el.getAttribute("aria-disabled");
    const disabled = el.hasAttribute("disabled") || aria === "true";
    const text = (htmlEl.innerText || htmlEl.textContent || "").toLowerCase();
    const attrBlob = `${cls} ${el.getAttribute("aria-label") || ""} ${el.getAttribute("title") || ""} ${el.getAttribute("data-testid") || ""}`.toLowerCase();

    if (disabled) return { inStock: false, reason: "disabled attribute" };
    if (el.getAttribute("data-available") === "false" || el.getAttribute("data-instock") === "false") {
      return { inStock: false, reason: "data-available false" };
    }
    if (
      cls.includes("disabled") ||
      cls.includes("passive") ||
      cls.includes("sold-out") ||
      cls.includes("soldout") ||
      cls.includes("out-of-stock") ||
      cls.includes("unavailable") ||
      cls.includes("tukendi") ||
      cls.includes("locked") ||
      /\block(?:ed)?\b|\bkilit\b|i-lock|icon-lock|has-lock|size-lock/.test(attrBlob)
    ) {
      return { inStock: false, reason: "disabled class" };
    }

    // Trendyol OOS bedenler çoğu zaman disabled değil — kilit ikonu ile işaretlenir
    const hasLockChild = Boolean(
      el.querySelector(
        '[class*="lock"], [class*="Lock"], [class*="kilit"], [data-testid*="lock"], [aria-label*="lock"], [aria-label*="kilit"]',
      ),
    );
    if (hasLockChild) return { inStock: false, reason: "lock icon" };

    const style = window.getComputedStyle(htmlEl);
    if (parseFloat(style.opacity) > 0 && parseFloat(style.opacity) < 0.45) {
      return { inStock: false, reason: "low opacity" };
    }
    if (style.pointerEvents === "none") {
      return { inStock: false, reason: "pointer-events none" };
    }
    if (style.cursor === "not-allowed") {
      return { inStock: false, reason: "cursor not-allowed" };
    }
    if (style.textDecoration.includes("line-through")) {
      return { inStock: false, reason: "line-through" };
    }

    let parent: HTMLElement | null = htmlEl.parentElement;
    for (let i = 0; i < 3 && parent; i++) {
      const pCls = (parent.getAttribute("class") || "").toLowerCase();
      if (
        pCls.includes("disabled") ||
        pCls.includes("passive") ||
        pCls.includes("sold-out") ||
        pCls.includes("out-of-stock") ||
        pCls.includes("locked") ||
        /\block(?:ed)?\b|\bkilit\b/.test(pCls)
      ) {
        return { inStock: false, reason: "parent disabled class" };
      }
      parent = parent.parentElement;
    }

    if (OOS_TEXT.test(text)) {
      return { inStock: false, reason: "out-of-stock text" };
    }

    return { inStock: true };
  };

  const readSizesForCurrentColor = (): Array<{
    name: string;
    inStock: boolean;
    disabledReason?: string;
  }> => {
    const isValidSizeLabelInDom = (text: string): boolean => {
      const t = text.trim();
      if (!t || t.length > 20) return false;
      if (/sepete ekle|şimdi al|son \d+ ürün|kupon|popüler|yorum/i.test(t)) return false;
      const sizePattern =
        /^(XXS|XS|S|M|L|XL|XXL|XXXL|2XL|3XL|4XL|5XL|STD|STANDART|TEK\s*EBAT|TEK\s*BEDEN|ONE\s*SIZE|\d{2,3})$/i;
      if (sizePattern.test(t)) return true;
      // "XS Tükendi" / kilit yanındaki gürültü — beden token'ını kabul et
      const token = t.match(/^(XXS|XS|S|M|L|XL|XXL|XXXL|2XL|3XL|4XL|5XL|\d{2,3})\b/i);
      return Boolean(token && sizePattern.test(token[1]));
    };

    const sizes: Array<{ name: string; inStock: boolean; disabledReason?: string }> = [];
    const seen = new Set<string>();

    const selectors = [
      '[data-testid="size-box"]',
      '[data-testid*="size-box"]',
      '[data-testid*="size"] button',
      '[data-testid="size-variant-item"]',
      '.slicing-attribute-section-value button',
      '.slicing-attribute-section-value a',
      '.slicing-attribute-section-value span',
      '[class*="slicing-attribute"] button',
      '.pr-in-sz button',
      '.pr-in-sz .sp-itm',
      '.sp-itm',
      '[class*="size-variant"] button',
    ];

    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach((el) => {
        const htmlEl = el as HTMLElement;
        const raw = (
          htmlEl.innerText ||
          htmlEl.textContent ||
          htmlEl.getAttribute("title") ||
          htmlEl.getAttribute("aria-label") ||
          ""
        )
          .replace(/\s+/g, " ")
          .trim();
        if (!isValidSizeLabelInDom(raw)) return;
        const token =
          raw.match(/^(XXS|XS|S|M|L|XL|XXL|XXXL|2XL|3XL|4XL|5XL|\d{2,3})\b/i)?.[1] || raw;
        const key = token.toLowerCase();
        if (seen.has(key)) {
          // Aynı beden tekrar: OOS kazanır
          const idx = sizes.findIndex((s) => s.name.toLowerCase() === key);
          if (idx >= 0) {
            const stock = inspectElement(el);
            if (sizes[idx].inStock && !stock.inStock) {
              sizes[idx] = {
                name: token,
                inStock: false,
                disabledReason: stock.reason,
              };
            }
          }
          return;
        }
        seen.add(key);
        const stock = inspectElement(el);
        sizes.push({
          name: token,
          inStock: stock.inStock,
          disabledReason: stock.reason,
        });
      });
      if (sizes.length > 0) break;
    }
    return sizes;
  };

  const win = window as any;
  const state = win.__PRODUCT_DETAIL_APP_INITIAL_STATE__;
  if (state?.product) {
    const p = state.product;
    const currentColor =
      p.color ||
      p.renk ||
      (p.attributes || []).find((a: any) => String(a.key || a.name || "").toLowerCase() === "renk")
        ?.value;
    if (currentColor) pushColor(String(currentColor));

    const sliced = p.slicedAttributes || [];
    for (const attr of sliced) {
      const attrName = String(attr.attributeName || "").toLowerCase();
      if (attrName === "renk" || attrName === "color") {
        for (const item of attr.attributes || []) {
          const name = item.attributeValue || item.value || "";
          if (name) pushColor(String(name), item.inStock !== false);
        }
      }
    }
  }

  const colorSelectors = [
    'a.slicing-attributes__item img[alt]',
    '.slicing-attributes img[alt]',
    '[data-testid="slicing-attribute-section"] img[alt]',
    '[class*="color-variant"] img[alt]',
    '.pr-in-cn img[alt]',
  ];
  for (const sel of colorSelectors) {
    document.querySelectorAll(sel).forEach((img) => {
      const alt = (img as HTMLImageElement).alt?.trim();
      if (alt) pushColor(alt);
    });
  }

  const renkMatch = document.body.innerText.match(/Renk\s*:\s*([^\n\r,;]+)/i);
  if (renkMatch?.[1]) pushColor(renkMatch[1].trim());

  if (snapshot.colors.length === 0) {
    pushColor("Tek Renk");
  }

  for (const color of snapshot.colors) {
    snapshot.sizesByColor[color.name] = readSizesForCurrentColor();
  }

  const addToCart = document.querySelector(
    [
      '[data-testid="add-to-cart"]',
      '[data-testid*="add-to-basket"]',
      'button[class*="add-to-basket"]',
      '.add-to-basket',
      'button[class*="AddToBasket"]',
      'button[class*="addToCart"]',
      'button[class*="sold-out"]',
      'button[class*="SoldOut"]',
    ].join(', '),
  );
  if (addToCart) {
    const btn = inspectElement(addToCart);
    snapshot.productInStock = btn.inStock;
  } else {
    const bodyText = (document.body?.innerText || '').slice(0, 8000);
    if (/Stoklar\s+Tükendi/i.test(bodyText) || /Ürün\s+tükenmiştir/i.test(bodyText)) {
      snapshot.productInStock = false;
    } else {
      const buttons = Array.from(document.querySelectorAll('button'));
      const tukendiBtn = buttons.find((b) => /^\s*Tükendi!?\s*$/i.test(b.innerText || ''));
      if (tukendiBtn) {
        snapshot.productInStock = false;
      } else if (
        /Gelince\s+Haber\s+Ver/i.test(bodyText) &&
        !/Sepete\s+Ekle/i.test(bodyText)
      ) {
        snapshot.productInStock = false;
      }
    }
  }

  return snapshot;
}

/** Puppeteer sayfasından stok snapshot'ı al */
export async function extractPuppeteerStockSnapshot(page: Page): Promise<PuppeteerStockSnapshot> {
  const base = await page.evaluate(domStockEvaluateScript);

  const colorLinks = await page.$$eval(
    'a.slicing-attributes__item[href*="/p-"], a[class*="color"][href*="/p-"]',
    (links) =>
      links
        .map((a) => ({
          href: (a as HTMLAnchorElement).href,
          alt: (a.querySelector("img") as HTMLImageElement | null)?.alt?.trim() || "",
        }))
        .filter((x) => x.href && x.alt)
        .slice(0, 8),
  );

  if (colorLinks.length <= 1) {
    return base;
  }

  const merged: PuppeteerStockSnapshot = {
    colors: [],
    sizesByColor: {},
    productInStock: base.productInStock,
    source: "dom",
  };

  for (const link of colorLinks) {
    try {
      await page.goto(link.href, { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.waitForFunction(
        '!!(window.__PRODUCT_DETAIL_APP_INITIAL_STATE__?.product?.id)',
        { timeout: 8000 },
      ).catch(() => undefined);
      await new Promise((r) => setTimeout(r, 600));
      const snap = await page.evaluate(domStockEvaluateScript);
      const colorName = link.alt || snap.colors[0]?.name || "Tek Renk";
      if (!merged.colors.some((c) => c.name.toLowerCase() === colorName.toLowerCase())) {
        merged.colors.push({ name: colorName, inStock: true });
      }
      merged.sizesByColor[colorName] =
        snap.sizesByColor[snap.colors[0]?.name || colorName] || snap.sizesByColor[colorName] || [];
    } catch {
      /* skip failed color navigation */
    }
  }

  if (merged.colors.length === 0) return base;
  return merged;
}
