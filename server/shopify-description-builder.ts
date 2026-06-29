export interface ShopifyDescriptionInput {
  title?: string;
  brand?: string;
  description?: string;
  category?: string;
  features?: Array<{ key?: string; value?: string }>;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Shopify Body (HTML) — açıklama + ürün özellikleri tablosu */
export function buildShopifyBodyHtml(input: ShopifyDescriptionInput): string {
  const title = String(input.title || "").trim();
  const brand = String(input.brand || "").trim();
  const description = String(input.description || "").trim();
  const category = String(input.category || "").trim();

  let html = `<div class="product-details">`;

  if (title) {
    html += `<h2>${escapeHtml(title)}</h2>`;
  }
  if (brand && brand.toLowerCase() !== "trendyol" && brand !== "undefined") {
    html += `<p><strong>Marka:</strong> ${escapeHtml(brand)}</p>`;
  }
  if (category && category !== "Genel" && category !== "Kategori") {
    html += `<p><strong>Kategori:</strong> ${escapeHtml(category)}</p>`;
  }
  if (description && description !== "undefined") {
    html += `<div class="product-description"><p>${escapeHtml(description)}</p></div>`;
  }

  const features = (input.features || []).filter(
    (f) =>
      f?.key &&
      f?.value &&
      String(f.key).trim() &&
      String(f.value).trim() &&
      !["kategori", "category", "marka", "brand"].includes(
        String(f.key).toLowerCase().trim(),
      ),
  );

  if (features.length > 0) {
    html += `<h3 style="margin:16px 0 8px;font-size:15px;font-weight:700;color:#333;">Öne Çıkan Özellikler</h3>`;
    html += `<table style="width:100%;border-collapse:collapse;font-size:13px;">`;
    const chunkSize = 4;
    for (let i = 0; i < features.length; i += chunkSize) {
      const rowItems = features.slice(i, i + chunkSize);
      html += `<tr>`;
      for (const f of rowItems) {
        html +=
          `<td style="padding:8px 12px;border:1px solid #e0e0e0;vertical-align:top;width:25%;">` +
          `<div style="color:#888;font-size:11px;margin-bottom:3px;">${escapeHtml(String(f.key))}</div>` +
          `<div style="font-weight:600;color:#222;">${escapeHtml(String(f.value))}</div></td>`;
      }
      for (let j = rowItems.length; j < chunkSize; j++) {
        html += `<td style="padding:8px 12px;border:1px solid #e0e0e0;width:25%;"></td>`;
      }
      html += `</tr>`;
    }
    html += `</table>`;
  }

  html += `</div>`;
  return html;
}
