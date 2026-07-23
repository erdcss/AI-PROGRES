/**
 * Takip değişiklik teşhisleri — net, doğru Türkçe açıklama üretir.
 * Hem sunucu (kayıt) hem istemci (gösterim) bu fonksiyonları kullanır.
 */

import { applyProfitMargin, formatTryPrice } from "./tracking-price-display";

function asText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return "";
}

function asPrice(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatTry(value: number): string {
  return `${value.toLocaleString("tr-TR", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })} ₺`;
}

function normalizeTitle(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase("tr-TR");
}

function describeTitleChange(oldTitle: string, newTitle: string): string {
  const oldN = normalizeTitle(oldTitle);
  const newN = normalizeTitle(newTitle);

  if (oldN === newN) {
    return "Başlık yazım/boşluk farkı tespit edildi; anlamlı değişiklik yok gibi görünüyor.";
  }

  // Yeni başlık, eski başlığın son kısmıysa → baştan ifade/marka kaldırılmış
  if (oldN.endsWith(newN) && oldTitle.length > newTitle.length) {
    const removed = oldTitle.slice(0, oldTitle.length - newTitle.length).trim();
    if (removed) {
      return `Kaynak sitede ürün başlığından “${removed}” kısmı kaldırıldı.`;
    }
    return "Kaynak sitede ürün başlığı kısaldı.";
  }

  // Eski başlık, yeni başlığın son kısmıysa → başa ifade/marka eklenmiş
  if (newN.endsWith(oldN) && newTitle.length > oldTitle.length) {
    const added = newTitle.slice(0, newTitle.length - oldTitle.length).trim();
    if (added) {
      return `Kaynak sitede ürün başlığına “${added}” eklendi.`;
    }
    return "Kaynak sitede ürün başlığı uzadı.";
  }

  if (oldN.startsWith(newN) && oldTitle.length > newTitle.length) {
    return "Kaynak sitede ürün başlığı kısaldı.";
  }

  if (newN.startsWith(oldN) && newTitle.length > oldTitle.length) {
    return "Kaynak sitede ürün başlığı uzadı.";
  }

  if (oldN.includes(newN) || newN.includes(oldN)) {
    return "Kaynak sitede ürün başlığı kısmen değişti (marka/ek ifade farkı olabilir).";
  }

  return "Kaynak sitede ürün başlığı tamamen değişti.";
}

function describePriceChange(oldPrice: number, newPrice: number): string {
  const diff = Math.round((newPrice - oldPrice) * 100) / 100;
  const pct = oldPrice > 0 ? Math.round((diff / oldPrice) * 1000) / 10 : 0;
  const direction = diff > 0 ? "yükseldi" : "düştü";
  const absDiff = Math.abs(diff);
  const absPct = Math.abs(pct);

  return `Kaynak sitede fiyat ${formatTry(oldPrice)} → ${formatTry(newPrice)} (${direction}: ${formatTry(absDiff)}, %${absPct}).`;
}

function describeStockCountChange(oldStock: number, newStock: number): string {
  if (newStock > oldStock) {
    return `Kaynak sitede stok artışı tespit edildi: ${oldStock} → ${newStock} adet.`;
  }
  if (newStock === 0) {
    return `Kaynak sitede stok tükendi: ${oldStock} → 0 adet.`;
  }
  return `Kaynak sitede stok azaldı: ${oldStock} → ${newStock} adet.`;
}

function describeAvailabilityChange(oldValue: unknown, newValue: unknown): string {
  const wasAvailable = oldValue === true || oldValue === "true" || oldValue === 1;
  const isAvailable = newValue === true || newValue === "true" || newValue === 1;
  if (wasAvailable && !isAvailable) {
    return "Kaynak sitede ürün satışa kapandı / stokta yok görünüyor.";
  }
  if (!wasAvailable && isAvailable) {
    return "Kaynak sitede ürün yeniden stoka girdi / satışa açıldı.";
  }
  return "Kaynak sitede ürün müsaitlik durumu değişti.";
}

function describeVariantStockChange(
  oldValue: unknown,
  newValue: unknown,
  variantLabel?: string | null,
): string {
  const wasInStock = oldValue === true || oldValue === "true";
  const isInStock = newValue === true || newValue === "true";
  const where = variantLabel ? `“${variantLabel}”` : "Bu beden/renk seçeneği";

  if (wasInStock && !isInStock) {
    return `${where} seçeneğinde stok tükendi. Ürünün tamamı kapanmadı; yalnızca bu seçenek bitti.`;
  }
  if (!wasInStock && isInStock) {
    return `${where} seçeneği yeniden stoka girdi.`;
  }
  return `${where} stok durumu değişti.`;
}

function describeVariantPriceChange(
  oldValue: unknown,
  newValue: unknown,
  variantLabel?: string | null,
): string {
  const oldP = asPrice(oldValue);
  const newP = asPrice(newValue);
  const where = variantLabel ? `“${variantLabel}” varyantında` : "Bir varyantta";
  if (oldP == null || newP == null) {
    return `${where} fiyat değişti.`;
  }
  const direction = newP > oldP ? "yükseldi" : "düştü";
  return `${where} fiyat ${formatTry(oldP)} → ${formatTry(newP)} (${direction}).`;
}

export type ChangeDiagnosisInput = {
  changeType: string;
  fieldName?: string | null;
  oldValue: unknown;
  newValue: unknown;
  variantLabel?: string | null;
  storedReason?: string | null;
  /** Kaynak alış → kârlı satış için marj (%) */
  profitMarginPercent?: number | null;
};

export type ChangeDiagnosis = {
  /** Kısa başlık: "Başlık değişti", "Fiyat yükseldi" */
  headline: string;
  /** Net teşhis cümlesi */
  diagnosis: string;
  /** Kullanıcıya öneri */
  advice: string | null;
};

/**
 * Tespit edilen değişikliği net Türkçe teşhise çevirir.
 * Eski kayıtların reason alanı belirsiz olsa bile değerlerden doğru açıklama üretir.
 */
export function buildChangeDiagnosis(input: ChangeDiagnosisInput): ChangeDiagnosis {
  const { changeType, fieldName, oldValue, newValue, variantLabel } = input;

  switch (changeType) {
    case "title_changed":
    case "title": {
      const oldTitle = asText(oldValue);
      const newTitle = asText(newValue);
      return {
        headline: "Başlık değişti",
        diagnosis:
          oldTitle && newTitle
            ? describeTitleChange(oldTitle, newTitle)
            : "Kaynak sitede ürün başlığı değişti.",
        advice:
          "Shopify başlığını yalnızca doğruysa güncelleyin. Marka adı kasıtlı kaldırıldıysa yok sayabilirsiniz.",
      };
    }

    case "price_changed":
    case "price":
    case "variant_price_changed": {
      const oldP = asPrice(oldValue);
      const newP = asPrice(newValue);
      const margin = input.profitMarginPercent;
      if (oldP != null && newP != null) {
        const up = newP > oldP;
        const saleOld = applyProfitMargin(oldP, margin);
        const saleNew = applyProfitMargin(newP, margin);
        const salePart =
          saleOld != null && saleNew != null
            ? ` Kârlı satış: ${formatTryPrice(saleOld)} → ${formatTryPrice(saleNew)}${
                margin != null ? ` (%${margin} marj)` : ""
              }.`
            : "";
        return {
          headline: up ? "Alış fiyatı yükseldi" : "Alış fiyatı düştü",
          diagnosis: `Eski alış ${formatTry(oldP)} → yeni alış ${formatTry(newP)}.${salePart}`,
          advice: "Shopify satış fiyatını yeni kârlı satışa göre güncelleyin.",
        };
      }
      return {
        headline: "Fiyat değişti",
        diagnosis: "Kaynak sitede ürün alış fiyatı değişti.",
        advice: "Shopify fiyatını güncellemeden önce değerleri kontrol edin.",
      };
    }

    case "stock_changed":
    case "stock": {
      if (fieldName === "available") {
        const becameUnavailable =
          (oldValue === true || oldValue === "true") &&
          (newValue === false || newValue === "false");
        return {
          headline: becameUnavailable ? "Ürün stokta yok" : "Ürün stoka girdi",
          diagnosis: describeAvailabilityChange(oldValue, newValue),
          advice: becameUnavailable
            ? "Shopify ürününü taslak/pasif yapmak isteyebilirsiniz."
            : "Shopify ürününü yeniden aktif etmek isteyebilirsiniz.",
        };
      }
      const oldS = asPrice(oldValue);
      const newS = asPrice(newValue);
      if (oldS != null && newS != null) {
        return {
          headline: newS > oldS ? "Stok arttı" : newS === 0 ? "Stok tükendi" : "Stok azaldı",
          diagnosis: describeStockCountChange(oldS, newS),
          advice: "Bu toplam stok bilgisidir; varyant stokları ayrı takip edilir.",
        };
      }
      return {
        headline: "Stok değişti",
        diagnosis: "Kaynak sitede stok bilgisi değişti.",
        advice: null,
      };
    }

    case "variant_stock_changed": {
      const becameOos =
        (oldValue === true || oldValue === "true") &&
        (newValue === false || newValue === "false");
      const optionName = variantLabel || "Seçenek";
      return {
        headline: becameOos ? `${optionName} tükendi` : `${optionName} stoka girdi`,
        diagnosis: describeVariantStockChange(oldValue, newValue, variantLabel),
        advice: becameOos
          ? "Yalnızca bu beden/renk seçeneğinin Shopify stoğunu 0 yapın; ürünü kapatmayın."
          : "Stok miktarı bilinmeden Shopify stoğu güvenle açılamaz; yalnızca durumu doğrulayın.",
      };
    }

    case "variant_added":
      return {
        headline: "Yeni varyant iddiası",
        diagnosis: variantLabel
          ? `Kaynak ölçümünde “${variantLabel}” yeni göründü. Bu her zaman gerçek ekleme değildir.`
          : "Kaynak ölçümünde yeni bir varyant göründü. Bu her zaman gerçek ekleme değildir.",
        advice: "Shopify’da oluşturmadan önce varyantın gerçekten yeni olduğunu doğrulayın.",
      };

    case "variant_removed":
      return {
        headline: "Varyant kayboldu",
        diagnosis: variantLabel
          ? `“${variantLabel}” bu ölçümde kaynak sitede görünmedi. Geçici eksik veri olabilir.`
          : "Bir varyant bu ölçümde kaynak sitede görünmedi. Geçici eksik veri olabilir.",
        advice: "Tek ölçümle silme yapmayın; sonraki kontrolde doğrulayın.",
      };

    case "image_changed":
    case "image":
      return {
        headline: "Görsel değişti",
        diagnosis: "Kaynak sitede ürün görselleri değişti.",
        advice: "Shopify görsellerini güncellemeden önce farkı kontrol edin.",
      };

    default:
      return {
        headline: "Değişiklik tespit edildi",
        diagnosis:
          input.storedReason?.trim() ||
          `Kaynak sitede ${changeType.replace(/_/g, " ")} değişikliği görüldü.`,
        advice: "İşlem yapmadan önce eski ve yeni değerleri karşılaştırın.",
      };
  }
}
