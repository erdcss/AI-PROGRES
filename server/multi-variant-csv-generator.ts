import { isClothingProduct } from './clothing-keywords';
import { sanitizeTrendyolVariants } from '@shared/trendyol-variant-utils';
import {
  SHOPIFY_NEW_TEMPLATE_HEADERS,
  SHOPIFY_NEW_TEMPLATE_COLUMN_COUNT,
  sanitizeShopifyCsvHeaders,
} from "./shopify-csv-headers";

interface CombinedProduct {
  id: string;
  title: string;
  brand: string;
  price: any;
  description: string;
  category: string;
  images: Array<{ url: string; alt?: string; colorName?: string }>;
  variants: {
    colors: string[];
    sizes: string[];
    allVariants: Array<{
      color: string;
      colorCode: string;
      size: string;
      inStock: boolean;
    }>;
  };
  features: Array<{ key: string; value: string }>;
  tags: string[];
}

// Column indices for the new Shopify format
const COL = {
  TITLE: 0,
  URL_HANDLE: 1,
  DESCRIPTION: 2,
  VENDOR: 3,
  PRODUCT_CATEGORY: 4,
  TYPE: 5,
  TAGS: 6,
  PUBLISHED: 7,
  STATUS: 8,
  SKU: 9,
  BARCODE: 10,
  OPTION1_NAME: 11,
  OPTION1_VALUE: 12,
  OPTION1_LINKED_TO: 13,
  OPTION2_NAME: 14,
  OPTION2_VALUE: 15,
  OPTION2_LINKED_TO: 16,
  OPTION3_NAME: 17,
  OPTION3_VALUE: 18,
  OPTION3_LINKED_TO: 19,
  PRICE: 20,
  COMPARE_AT_PRICE: 21,
  COST_PER_ITEM: 22,
  CHARGE_TAX: 23,
  TAX_CODE: 24,
  UNIT_PRICE_TOTAL_MEASURE: 25,
  UNIT_PRICE_TOTAL_MEASURE_UNIT: 26,
  UNIT_PRICE_BASE_MEASURE: 27,
  UNIT_PRICE_BASE_MEASURE_UNIT: 28,
  INVENTORY_TRACKER: 29,
  INVENTORY_QUANTITY: 30,
  CONTINUE_SELLING: 31,
  WEIGHT_VALUE: 32,
  WEIGHT_UNIT: 33,
  REQUIRES_SHIPPING: 34,
  FULFILLMENT_SERVICE: 35,
  PRODUCT_IMAGE_URL: 36,
  IMAGE_POSITION: 37,
  IMAGE_ALT_TEXT: 38,
  VARIANT_IMAGE_URL: 39,
  GIFT_CARD: 40,
  SEO_TITLE: 41,
  SEO_DESCRIPTION: 42,
  COLOR_METAFIELD: 43,
  GOOGLE_PRODUCT_CATEGORY: 44,
  GOOGLE_GENDER: 45,
  GOOGLE_AGE_GROUP: 46,
  GOOGLE_MPN: 47,
  GOOGLE_AD_GROUP: 48,
  GOOGLE_ADS_LABELS: 49,
  GOOGLE_CONDITION: 50,
  GOOGLE_CUSTOM_PRODUCT: 51,
  GOOGLE_CUSTOM_LABEL_0: 52,
  GOOGLE_CUSTOM_LABEL_1: 53,
  GOOGLE_CUSTOM_LABEL_2: 54,
  GOOGLE_CUSTOM_LABEL_3: 55,
  GOOGLE_CUSTOM_LABEL_4: 56,
};

const TOTAL_COLUMNS = SHOPIFY_NEW_TEMPLATE_COLUMN_COUNT;
const COLOR_LINKED_TO = 'product.metafields.shopify.color-pattern';

export async function generateMultiVariantShopifyCSV(product: CombinedProduct): Promise<string> {
  // Apply brand sanitization
  const brandSanitizer = await import('./brand-sanitizer');
  const sanitizedProduct = brandSanitizer.sanitizeProduct(product);
  console.log('🧹 CSV: Trendyol branding removed from product data');

  sanitizedProduct.variants = sanitizeTrendyolVariants(sanitizedProduct.variants, {
    productTitle: sanitizedProduct.title,
  }) as CombinedProduct["variants"];

  if (!sanitizedProduct || !sanitizedProduct.title) {
    console.log('⚠️ Invalid product data, skipping CSV generation');
    return '';
  }

  if (!sanitizedProduct.brand || sanitizedProduct.brand.trim() === '') {
    sanitizedProduct.brand = 'Generic';
  }

  if (sanitizedProduct.brand && sanitizedProduct.brand.toLowerCase() === 'trendyol') {
    const titleWords = sanitizedProduct.title.split(' ');
    const possibleBrand = titleWords[0];
    sanitizedProduct.brand = (possibleBrand && possibleBrand.length > 2 && possibleBrand.toLowerCase() !== 'trendyol')
      ? possibleBrand : 'Generic';
  }

  const errorIndicators = [
    'Sorry, you have been blocked', '429', '403', 'Access Denied', 'Erişim Engellendi',
    'Rate limit', 'Blocked', 'Error', 'undefined', 'null', 'Product', 'Bilinmeyen Ürün'
  ];
  const titleLower = sanitizedProduct.title.toLowerCase();
  const isErrorContent = errorIndicators.some(ind => titleLower.includes(ind.toLowerCase())) ||
    sanitizedProduct.title.length < 3 ||
    sanitizedProduct.title === 'Product' ||
    sanitizedProduct.brand === 'Bilinmiyor' ||
    sanitizedProduct.brand === 'Lütfen bekleyin' ||
    sanitizedProduct.brand === 'Unknown';

  if (isErrorContent) {
    console.log(`⚠️ Poor quality/blocked product detected: "${product.title}", skipping CSV`);
    return '';
  }

  // Strip fake clothing sizes for non-clothing products (ek güvenlik)
  const isConfirmedClothingProduct = isClothingProduct(sanitizedProduct.title);
  if (!isConfirmedClothingProduct && sanitizedProduct.variants) {
    console.log(`🚫 CSV GATE: "${sanitizedProduct.title.substring(0, 40)}..." is NOT clothing - stripping sizes`);
    sanitizedProduct.variants = sanitizeTrendyolVariants(sanitizedProduct.variants, {
      productTitle: sanitizedProduct.title,
    }) as CombinedProduct["variants"];
  }

  // Price calculation
  let originalPrice = 0;
  if (typeof product.price === 'object' && product.price !== null) {
    if (product.price.original > 0) originalPrice = parseFloat(product.price.original.toString());
    else if (product.price.value > 0) originalPrice = parseFloat(product.price.value.toString());
    else if (product.price.withProfit > 0) originalPrice = Math.round((parseFloat(product.price.withProfit.toString()) / 1.10) * 100) / 100;
  } else if (typeof product.price === 'number' && product.price > 0) {
    originalPrice = product.price;
  } else if (typeof product.price === 'string') {
    const m = product.price.match(/[\d.,]+/);
    if (m) originalPrice = parseFloat(m[0].replace(',', '.'));
  }

  if (originalPrice < 1) originalPrice = 10;

  // salePrice = Trendyol fiyatı + %10 kâr marjı (müşteriye gösterilen fiyat)
  // compareAtPrice = salePrice'dan yüksek olmalı (Shopify'da üstü çizili "eski fiyat")
  const salePrice = originalPrice > 0
    ? (Math.round(originalPrice * 1.10 * 100) / 100).toString()
    : '29.90';
  // Compare-at: satış fiyatından %20 daha yüksek → indirim göstergesi
  const compareAtPrice = originalPrice > 0
    ? Math.round(originalPrice * 1.10 * 1.20 * 100) / 100
    : 0;

  console.log(`💰 CSV: Price ${originalPrice} TL + 10% = ${salePrice} TL`);

  // URL handle
  const productHandle = sanitizedProduct.title.toLowerCase()
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i')
    .replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);

  // Body HTML (Description)
  let bodyHtml = `<div class="product-details">`;
  const safeBrand = (sanitizedProduct.brand && sanitizedProduct.brand.toLowerCase() !== 'trendyol' && sanitizedProduct.brand !== 'undefined')
    ? sanitizedProduct.brand : '';
  if (safeBrand) bodyHtml += `<p><strong>Marka:</strong> ${safeBrand}</p>`;

  let categoryFeature: any = null;
  if (product.features && Array.isArray(product.features)) {
    categoryFeature = product.features.find(f =>
      f?.key && (f.key.toLowerCase().includes('kategori') || f.key.toLowerCase().includes('category') || f.key.toLowerCase().includes('type'))
    );
  }
  const categoryVal = (categoryFeature?.value && categoryFeature.value !== 'Kategori') ? categoryFeature.value
    : (sanitizedProduct.category && sanitizedProduct.category !== 'Kategori' && sanitizedProduct.category !== 'Genel Ürünler') ? sanitizedProduct.category : '';
  if (categoryVal) bodyHtml += `<p><strong>Kategori:</strong> ${categoryVal}</p>`;

  if (product.description && product.description !== 'undefined' && product.description.trim() !== '') {
    bodyHtml += `<div class="description"><strong>Ürün Açıklaması:</strong><br/>${product.description}</div>`;
  }

  if (product.features && Array.isArray(product.features)) {
    const skipKeys = new Set(['kategori', 'category', 'marka', 'brand']);
    const validFeatures = product.features.filter(f =>
      f?.key && f?.value &&
      typeof f.key === 'string' && typeof f.value === 'string' &&
      f.key.trim() !== '' && f.value.trim() !== '' &&
      !skipKeys.has(f.key.toLowerCase().trim())
    );
    if (validFeatures.length > 0) {
      // Grid table styled like Trendyol "Öne Çıkan Özellikler"
      bodyHtml += `<h3 style="margin:16px 0 8px;font-size:15px;font-weight:700;color:#333;">Öne Çıkan Özellikler</h3>`;
      bodyHtml += `<table style="width:100%;border-collapse:collapse;font-size:13px;">`;
      // Render 4 columns per row
      const chunkSize = 4;
      for (let i = 0; i < validFeatures.length; i += chunkSize) {
        const rowItems = validFeatures.slice(i, i + chunkSize);
        bodyHtml += `<tr>`;
        rowItems.forEach(f => {
          bodyHtml += `<td style="padding:8px 12px;border:1px solid #e0e0e0;vertical-align:top;width:25%;">` +
            `<div style="color:#888;font-size:11px;margin-bottom:3px;">${f.key}</div>` +
            `<div style="font-weight:600;color:#222;">${f.value}</div></td>`;
        });
        // Fill empty cells if row isn't complete
        for (let j = rowItems.length; j < chunkSize; j++) {
          bodyHtml += `<td style="padding:8px 12px;border:1px solid #e0e0e0;width:25%;"></td>`;
        }
        bodyHtml += `</tr>`;
      }
      bodyHtml += `</table>`;
    }
  }

  // Tags
  const filteredTags = (product.tags && Array.isArray(product.tags))
    ? product.tags.filter(t => t.toLowerCase() !== 'trendyol' && t.toLowerCase() !== '#trendyol')
    : [];
  const tagsStr = filteredTags.join(', ');

  // Vendor
  const vendorName = (product.brand && product.brand.toLowerCase() !== 'trendyol')
    ? product.brand : (product.title.split(' ')[0] || 'Generic');

  // Category for product category column
  const productCategoryStr = categoryVal || product.category || '';

  // SEO
  const seoTitle = safeBrand
    ? `${safeBrand} ${sanitizedProduct.title}`.substring(0, 70)
    : (sanitizedProduct.title || '').substring(0, 70);

  let seoDescription = '';
  if (product.description && product.description !== 'undefined' && product.description.trim() !== '') {
    seoDescription = product.description.substring(0, 160);
  } else {
    const parts = [safeBrand, sanitizedProduct.title].filter(Boolean);
    if (categoryVal) parts.push(categoryVal);
    seoDescription = parts.join(', ').substring(0, 160);
  }

  // Process images
  let processedImages: Array<{ url: string; colorName: string }> = [];
  if (Array.isArray(product.images)) {
    product.images.forEach(img => {
      if (typeof img === 'string' && img) processedImages.push({ url: img, colorName: 'none' });
      else if (img && typeof img === 'object' && (img as any).url) processedImages.push({ url: (img as any).url, colorName: (img as any).colorName || 'none' });
    });
  }

  const imagesByColor: Record<string, string[]> = {};
  const generalImages: string[] = [];
  processedImages.forEach(img => {
    if (!img.url) return;
    if (img.colorName && img.colorName !== '' && img.colorName !== 'none') {
      if (!imagesByColor[img.colorName]) imagesByColor[img.colorName] = [];
      imagesByColor[img.colorName].push(img.url);
    } else {
      generalImages.push(img.url);
    }
  });

  // Variants
  const inputVariants = Array.isArray(sanitizedProduct.variants)
    ? sanitizedProduct.variants
    : sanitizedProduct.variants?.allVariants || [];

  // 🚫 TITLE-AS-COLOR FILTER: Reject colors that are actually the product title
  // Real color names are short (e.g. "Siyah", "Kırmızı"). Titles are long sentences.
  const productTitleNorm = sanitizedProduct.title.trim().toLowerCase();
  const realVariants = inputVariants.filter(v => {
    const hasRealColor = v.color && v.color.trim() !== '' && v.color !== 'Tek Renk';
    const hasRealSize = v.size && v.size.trim() !== '';
    if (!hasRealColor && !hasRealSize) return false;

    // Detect title used as color
    if (hasRealColor) {
      const colorNorm = v.color.trim().toLowerCase();
      const isTitleColor =
        colorNorm === productTitleNorm ||
        (productTitleNorm.length > 10 && colorNorm.includes(productTitleNorm.substring(0, 20).toLowerCase())) ||
        v.color.trim().length > 50;
      if (isTitleColor) {
        console.log(`🚫 CSV: Title-as-color rejected: "${v.color.substring(0, 60)}"`);
        // If there's a real size, keep the variant but without the fake color
        return hasRealSize;
      }
    }
    return true;
  }).map(v => {
    // Strip fake color but keep size if present
    if (v.color && v.color.trim().length > 50) return { ...v, color: '' };
    const colorNorm = (v.color || '').trim().toLowerCase();
    if (productTitleNorm.length > 10 && colorNorm.includes(productTitleNorm.substring(0, 20).toLowerCase())) {
      return { ...v, color: '' };
    }
    return v;
  });

  let actualVariants = realVariants.length > 0 ? realVariants : [{ color: '', colorCode: '', size: '', inStock: true }];

  // Deduplicate
  const uniqueVariantsMap = new Map<string, typeof actualVariants[0]>();
  actualVariants.forEach(v => {
    const key = `${(v.color || '').trim().toLowerCase()}|${(v.size || '').trim().toLowerCase()}`;
    if (!uniqueVariantsMap.has(key)) uniqueVariantsMap.set(key, v);
  });
  const deduped = Array.from(uniqueVariantsMap.values());

  // In-stock only
  const inStockVariants = deduped.filter(v => v.inStock !== false);
  console.log(`✅ STOCK FILTER: ${deduped.length} total → ${inStockVariants.length} in-stock`);

  const htmlVariantsInStock = inStockVariants.filter(v => v.color && v.color.trim() !== '');
  if (htmlVariantsInStock.length > 0) {
    const realColors = [...new Set(htmlVariantsInStock.map(v => v.color).filter(Boolean))];
    const realSizes = [...new Set(htmlVariantsInStock.map(v => v.size).filter(Boolean))];
    if (realColors.length > 0) bodyHtml += `<p><strong>Mevcut Renkler:</strong> ${realColors.join(', ')}</p>`;
    if (realSizes.length > 0) bodyHtml += `<p><strong>Mevcut Bedenler:</strong> ${realSizes.join(', ')}</p>`;
  }
  bodyHtml += `</div>`;

  // All unique colors for metafield
  const allColors = [...new Set(inStockVariants.map(v => v.color).filter(c => c && c.trim() !== '' && c !== 'Tek Renk'))];
  const colorMetafield = allColors.join('; ');

  // Unique tracking ID
  const uniqueTrackingId = (product as any).uniqueTrackingId ||
    `trendyol_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const headers = [...SHOPIFY_NEW_TEMPLATE_HEADERS];
  const rows: string[][] = [];
  rows.push(headers);

  let imagePosition = 1;
  const addedImageUrls = new Set<string>();

  // 🎨 MULTI-COLOR GUARD: Only show Renk option when there are 2+ distinct colors.
  // A product with only 1 color has no real color choice for the customer → skip Renk option.
  const distinctColorSet = new Set(
    inStockVariants.map(v => v.color).filter(c => c && c.trim() !== '' && c !== 'Tek Renk' && c !== 'Standart')
  );
  if (distinctColorSet.size > 0) {
    console.log(`🎨 CSV colors: ${[...distinctColorSet].join(', ')} (${distinctColorSet.size} renk)`);
  }

  inStockVariants.forEach((variant, index) => {
    const isFirst = index === 0;
    const row: string[] = Array(TOTAL_COLUMNS).fill('');

    // URL handle always present
    row[COL.URL_HANDLE] = productHandle;

    if (isFirst) {
      row[COL.TITLE] = sanitizedProduct.title;
      row[COL.DESCRIPTION] = bodyHtml;
      row[COL.VENDOR] = vendorName;
      row[COL.PRODUCT_CATEGORY] = productCategoryStr;
      row[COL.TYPE] = productCategoryStr;
      row[COL.TAGS] = tagsStr;
      row[COL.PUBLISHED] = 'TRUE';
      row[COL.STATUS] = 'active';
      row[COL.GIFT_CARD] = 'FALSE';
      row[COL.SEO_TITLE] = seoTitle;
      row[COL.SEO_DESCRIPTION] = seoDescription;
      row[COL.COLOR_METAFIELD] = colorMetafield;
      row[COL.GOOGLE_CONDITION] = 'New';
      row[COL.GOOGLE_CUSTOM_PRODUCT] = 'FALSE';
    } else {
      row[COL.STATUS] = 'active';
    }

    // Options — geçerli renk/beden değerleri CSV ve Shopify'a yazılır
    const hasColor =
      variant.color && variant.color.trim() !== '' && variant.color !== 'Tek Renk' && variant.color !== 'Standart';
    const hasSize = variant.size && variant.size.trim() !== '' && variant.size !== 'Tek Beden' && variant.size !== 'Standart';

    if (hasColor && hasSize) {
      row[COL.OPTION1_NAME] = isFirst ? 'Renk' : '';
      row[COL.OPTION1_VALUE] = variant.color;
      row[COL.OPTION1_LINKED_TO] = COLOR_LINKED_TO;
      row[COL.OPTION2_NAME] = isFirst ? 'Beden' : '';
      row[COL.OPTION2_VALUE] = variant.size;
      row[COL.OPTION2_LINKED_TO] = '';
    } else if (hasColor) {
      row[COL.OPTION1_NAME] = isFirst ? 'Renk' : '';
      row[COL.OPTION1_VALUE] = variant.color;
      row[COL.OPTION1_LINKED_TO] = COLOR_LINKED_TO;
    } else if (hasSize) {
      row[COL.OPTION1_NAME] = isFirst ? 'Beden' : '';
      row[COL.OPTION1_VALUE] = variant.size;
      row[COL.OPTION1_LINKED_TO] = '';
    } else {
      row[COL.OPTION1_NAME] = isFirst ? 'Title' : '';
      row[COL.OPTION1_VALUE] = 'Default Title';
    }

    // SKU
    let sku = productHandle;
    if (hasColor) sku += `-${variant.color.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`;
    if (hasSize) sku += `-${variant.size.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`;
    if (variant.colorCode && variant.colorCode !== 'single') sku += `-${variant.colorCode}`;
    row[COL.SKU] = sku;

    // Price & inventory
    row[COL.PRICE] = salePrice;
    row[COL.COMPARE_AT_PRICE] = compareAtPrice.toString();
    row[COL.CHARGE_TAX] = 'TRUE';
    row[COL.INVENTORY_TRACKER] = 'shopify';
    row[COL.INVENTORY_QUANTITY] = '0';
    row[COL.CONTINUE_SELLING] = 'CONTINUE';
    row[COL.WEIGHT_UNIT] = 'g';
    row[COL.REQUIRES_SHIPPING] = 'TRUE';
    row[COL.FULFILLMENT_SERVICE] = 'manual';

    // Main image (first variant gets first image, others get sequential)
    let selectedImage = '';
    if (processedImages.length > 0) {
      if (isFirst) {
        selectedImage = processedImages[0].url;
        addedImageUrls.add(selectedImage);
      } else {
        const colorBased = hasColor ? processedImages.find(img => img.colorName === variant.color) : null;
        if (colorBased && !addedImageUrls.has(colorBased.url)) {
          selectedImage = colorBased.url;
          addedImageUrls.add(selectedImage);
        } else if (index < processedImages.length && !addedImageUrls.has(processedImages[index].url)) {
          selectedImage = processedImages[index].url;
          addedImageUrls.add(selectedImage);
        }
      }
    }

    if (selectedImage) {
      row[COL.PRODUCT_IMAGE_URL] = selectedImage;
      row[COL.IMAGE_POSITION] = imagePosition.toString();
      row[COL.IMAGE_ALT_TEXT] = `${sanitizedProduct.title}${hasColor ? ' - ' + variant.color : ''}`;
      imagePosition++;
    }

    // Variant image
    const colorImgs = hasColor ? imagesByColor[variant.color] : null;
    if (colorImgs && colorImgs.length > 0) {
      row[COL.VARIANT_IMAGE_URL] = colorImgs[0];
    }

    rows.push(row);
  });

  // Additional image rows for remaining images
  const allProcessedUrls = processedImages.map(img => img.url);

  allProcessedUrls.forEach(imgUrl => {
    if (!imgUrl || addedImageUrls.has(imgUrl)) return;
    const imageRow: string[] = Array(TOTAL_COLUMNS).fill('');
    imageRow[COL.URL_HANDLE] = productHandle;
    imageRow[COL.PRODUCT_IMAGE_URL] = imgUrl;
    imageRow[COL.IMAGE_POSITION] = imagePosition.toString();
    imageRow[COL.IMAGE_ALT_TEXT] = sanitizedProduct.title;
    rows.push(imageRow);
    addedImageUrls.add(imgUrl);
    imagePosition++;
  });

  // Any remaining general images not yet added
  generalImages.forEach(imgUrl => {
    if (!imgUrl || addedImageUrls.has(imgUrl)) return;
    const imageRow: string[] = Array(TOTAL_COLUMNS).fill('');
    imageRow[COL.URL_HANDLE] = productHandle;
    imageRow[COL.PRODUCT_IMAGE_URL] = imgUrl;
    imageRow[COL.IMAGE_POSITION] = imagePosition.toString();
    imageRow[COL.IMAGE_ALT_TEXT] = sanitizedProduct.title;
    rows.push(imageRow);
    addedImageUrls.add(imgUrl);
    imagePosition++;
  });

  console.log(`📸 CSV: Total images added: ${addedImageUrls.size}`);
  console.log(`📊 CSV: Total rows: ${rows.length} (1 header + ${rows.length - 1} data rows)`);

  // Convert to CSV string
  const csvBody = rows.map(row =>
    row.map(cell => {
      const s = cell !== null && cell !== undefined ? String(cell) : '';
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    }).join(',')
  ).join('\n');

  const sanitized = sanitizeShopifyCsvHeaders(csvBody);
  const { validateCsvContent } = await import("./shopify-csv-headers");
  const check = validateCsvContent(sanitized);
  console.log("[CSV] generateMultiVariantShopifyCSV", {
    headerCount: check.headerCount,
    rowCounts: check.rowCounts,
    valid: check.valid,
  });
  if (!check.valid) {
    throw new Error(check.error || "CSV column mismatch");
  }
  return sanitized;
}
