// Lipton CSV template generator - uses the exact format from the provided template
import slugify from 'slugify';

export function generateLiptonTemplateCSV(productData: any): string {
  if (!productData || !productData.success) {
    throw new Error('Invalid product data');
  }

  const { title, brand, price, images, features, variants, colors, sizes } = productData;
  
  // Generate handle like Lipton template
  const handle = slugify(title, { 
    lower: true, 
    strict: true,
    remove: /[*+~.()'"!:@]/g 
  }).substring(0, 50) + '-';

  // Create HTML body like Lipton template
  const bodyHtml = `${brand} ${title}. <h3>Ürün Özellikleri:</h3><ul>${
    features.map((f: any) => `<li><strong>${f.key}:</strong> ${f.value}</li>`).join('')
  }</ul>`;

  // Create tags like Lipton template
  const tags = features.map((f: any) => `${f.key}: ${f.value}`).join(', ');

  const rows: string[][] = [];
  
  // Header row - exactly like Lipton template
  const csvHeader = [
    'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Product Type', 'Tags',
    'Published', 'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value',
    'Variant SKU', 'Variant Inventory Qty', 'Variant Price', 'Variant Compare At Price',
    'Cost per item', 'Image Src', 'Image Position', 'Image Alt Text',
    'SEO Title', 'SEO Description', 'Variant Weight Unit', 'Status'
  ];
  
  rows.push(csvHeader);

  // Determine variants structure - improved logic
  let productVariants: Array<{color: string, size: string, stock: number}> = [];
  
  if (variants && variants.length > 0) {
    productVariants = variants.filter((v: any) => v.stock > 0);
  } else {
    // Sadece gerçek varyantlar varsa kullan
    const hasRealColors = colors.length > 1;
    const hasRealSizes = sizes.length > 1;
    
    if (hasRealColors && hasRealSizes) {
      // Hem renk hem beden varyantı var
      colors.forEach((color: string) => {
        sizes.forEach((size: string) => {
          productVariants.push({ color, size, stock: 25 });
        });
      });
    } else if (hasRealColors) {
      // Sadece renk varyantı var
      colors.forEach((color: string) => {
        productVariants.push({ color, size: '', stock: 25 });
      });
    } else if (hasRealSizes) {
      // Sadece beden varyantı var
      sizes.forEach((size: string) => {
        productVariants.push({ color: '', size, stock: 25 });
      });
    } else {
      // Varyant yok - tek ürün
      productVariants = [{ color: '', size: '', stock: 25 }];
    }
  }

  // Main product row (first variant)
  if (productVariants.length > 0) {
    const firstVariant = productVariants[0];
    const variantSku = `${handle}${slugify(firstVariant.color, {lower: true})}-${slugify(firstVariant.size, {lower: true})}`;
    const imageAltText = `${title} ${firstVariant.color} ${firstVariant.size}`;
    const seoTitle = `${title} | ${brand}`;
    const seoDescription = bodyHtml.substring(0, 160) + '...';

    // Option fields - only set if there are real variants
    const hasColors = productVariants.some(v => v.color);
    const hasSizes = productVariants.some(v => v.size);
    
    let option1Name = '';
    let option1Value = '';
    let option2Name = '';
    let option2Value = '';
    
    if (hasColors && hasSizes) {
      option1Name = 'Renk';
      option1Value = firstVariant.color;
      option2Name = 'Beden';
      option2Value = firstVariant.size;
    } else if (hasColors) {
      option1Name = 'Renk';
      option1Value = firstVariant.color;
    } else if (hasSizes) {
      option1Name = 'Beden';
      option1Value = firstVariant.size;
    }

    rows.push([
      handle,
      title,
      bodyHtml,
      brand,
      'Genel', // Product Type like Lipton
      tags,
      'TRUE', // Published
      option1Name, // Option1 Name
      option1Value, // Option1 Value
      option2Name, // Option2 Name
      option2Value, // Option2 Value
      variantSku, // Variant SKU
      firstVariant.stock.toString(), // Variant Inventory Qty
      price.withProfit.toFixed(2), // Variant Price
      '', // Variant Compare At Price
      price.original.toFixed(2), // Cost per item
      images[0] || '', // Image Src
      '1', // Image Position
      imageAltText, // Image Alt Text
      seoTitle, // SEO Title
      seoDescription, // SEO Description
      'kg', // Variant Weight Unit (like Lipton)
      'active' // Status
    ]);
  }

  // Additional image rows - exactly like Lipton template
  if (images && images.length > 1) {
    images.slice(1).forEach((imageUrl: string, index: number) => {
      if (imageUrl) {
        rows.push([
          handle, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
          imageUrl, (index + 2).toString(), '', '', '', '', ''
        ]);
      }
    });
  }

  // Additional variant rows (if multiple variants)
  if (productVariants.length > 1) {
    productVariants.slice(1).forEach((variant) => {
      const variantSku = `${handle}${slugify(variant.color, {lower: true})}-${slugify(variant.size, {lower: true})}`;
      const imageAltText = `${title} ${variant.color} ${variant.size}`;

      rows.push([
        handle, '', '', '', '', '', '', '', variant.color, '', variant.size,
        variantSku, variant.stock.toString(), price.withProfit.toFixed(2), '',
        price.original.toFixed(2), '', '', imageAltText, '', '', '', ''
      ]);
    });
  }

  // Convert to CSV string with proper escaping
  return rows.map(row => 
    row.map(cell => {
      const cellStr = String(cell || '');
      if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
        return `"${cellStr.replace(/"/g, '""')}"`;
      }
      return cellStr;
    }).join(',')
  ).join('\n');
}