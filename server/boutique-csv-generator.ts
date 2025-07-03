// Boutique CSV Generator for specialized products

export interface BoutiqueVariant {
  color: string;
  originalPrice: number;
  discountPrice?: number;
  finalPrice: number;
  sizes: string[];
  inStock: boolean;
}

export function generateBoutiqueCSV(
  title: string,
  brand: string,
  images: string[],
  features: Array<{key: string; value: string}>
): string {
  
  // Mayo ürünü için gerçek varyant verileri
  const variants: BoutiqueVariant[] = [
    {
      color: 'Sarı',
      originalPrice: 1458.03,
      discountPrice: 1393.03,
      finalPrice: 1393.03,
      sizes: ['38', '40'],
      inStock: true
    },
    {
      color: 'Lacivert',
      originalPrice: 3144.27,
      discountPrice: 3079.22,
      finalPrice: 3079.22,
      sizes: ['36', '38', '42', '44'],
      inStock: true
    },
    {
      color: 'İndigo Mavi',
      originalPrice: 1458.03,
      discountPrice: 1393.03,
      finalPrice: 1393.03,
      sizes: ['38', '40'],
      inStock: true
    },
    {
      color: 'Lila',
      originalPrice: 1458.03,
      discountPrice: 1393.03,
      finalPrice: 1393.03,
      sizes: ['38', '40'],
      inStock: true
    },
    {
      color: 'Mor',
      originalPrice: 1458.03,
      discountPrice: 1393.03,
      finalPrice: 1393.03,
      sizes: ['38', '40'],
      inStock: true
    },
    {
      color: 'Bordo',
      originalPrice: 3144.27,
      discountPrice: 3079.22,
      finalPrice: 3079.22,
      sizes: ['36', '38', '42', '44'],
      inStock: true
    },
    {
      color: 'Turuncu',
      originalPrice: 1458.03,
      discountPrice: 1393.03,
      finalPrice: 1393.03,
      sizes: ['38', '40'],
      inStock: true
    },
    {
      color: 'Haki',
      originalPrice: 1458.03,
      discountPrice: 1393.03,
      finalPrice: 1393.03,
      sizes: ['38', '40'],
      inStock: true
    },
    {
      color: 'Pembe',
      originalPrice: 1458.03,
      discountPrice: 1393.03,
      finalPrice: 1393.03,
      sizes: ['38', '40'],
      inStock: true
    },
    {
      color: 'Ekru',
      originalPrice: 1458.03,
      discountPrice: 1393.03,
      finalPrice: 1393.03,
      sizes: ['38', '40'],
      inStock: true
    },
    {
      color: 'Siyah',
      originalPrice: 3144.27,
      discountPrice: 3079.22,
      finalPrice: 3079.22,
      sizes: ['36', '38', '42', '44'],
      inStock: true
    },
    {
      color: 'Yeşil',
      originalPrice: 1458.03,
      discountPrice: 1393.03,
      finalPrice: 1393.03,
      sizes: ['38', '40'],
      inStock: true
    }
  ];

  const csvHeaders = [
    'Handle',
    'Title',
    'Body (HTML)',
    'Vendor',
    'Product Category',
    'Type',
    'Tags',
    'Published',
    'Option1 Name',
    'Option1 Value',
    'Option2 Name', 
    'Option2 Value',
    'Option3 Name',
    'Option3 Value',
    'Variant SKU',
    'Variant Grams',
    'Variant Inventory Tracker',
    'Variant Inventory Qty',
    'Variant Inventory Policy',
    'Variant Fulfillment Service',
    'Variant Price',
    'Variant Compare At Price',
    'Variant Requires Shipping',
    'Variant Taxable',
    'Variant Barcode',
    'Image Src',
    'Image Position',
    'Image Alt Text',
    'Gift Card',
    'SEO Title',
    'SEO Description',
    'Google Shopping / Google Product Category',
    'Google Shopping / Gender',
    'Google Shopping / Age Group',
    'Google Shopping / MPN',
    'Google Shopping / AdWords Grouping',
    'Google Shopping / AdWords Labels',
    'Google Shopping / Condition',
    'Google Shopping / Custom Product',
    'Google Shopping / Custom Label 0',
    'Google Shopping / Custom Label 1',
    'Google Shopping / Custom Label 2',
    'Google Shopping / Custom Label 3',
    'Google Shopping / Custom Label 4',
    'Variant Image',
    'Variant Weight Unit',
    'Variant Tax Code',
    'Cost per item',
    'Price / International',
    'Compare At Price / International',
    'Status'
  ];

  const rows: string[] = [csvHeaders.join(',')];
  
  // Ana ürün handle'ı
  const handle = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);

  // HTML açıklama oluştur
  const description = `
    <div class="product-description">
      <h3>Ürün Özellikleri</h3>
      <ul>
        ${features.map(f => `<li><strong>${f.key}:</strong> ${f.value}</li>`).join('')}
      </ul>
      <p>Premium kalitede boutique mayo, farklı renk ve beden seçenekleri ile.</p>
    </div>
  `;

  let isFirstRow = true;
  let imagePosition = 1;

  // Her varyant için satır oluştur
  variants.forEach((variant, variantIndex) => {
    variant.sizes.forEach((size, sizeIndex) => {
      
      // %15 kar marjı uygula
      const finalPriceWithMargin = Math.round(variant.finalPrice * 1.15 * 100) / 100;
      const originalPriceWithMargin = Math.round(variant.originalPrice * 1.15 * 100) / 100;
      
      const row = [
        handle, // Handle
        isFirstRow ? title : '', // Title (sadece ilk satırda)
        isFirstRow ? `"${description.replace(/"/g, '""')}"` : '', // Body HTML
        isFirstRow ? brand : '', // Vendor
        isFirstRow ? 'Giyim > Kadın > Plaj & Mayo' : '', // Product Category
        isFirstRow ? 'Mayo' : '', // Type
        isFirstRow ? 'boutique,mayo,swimwear,yüzücü,plaj' : '', // Tags
        isFirstRow ? 'TRUE' : '', // Published
        isFirstRow ? 'Renk' : '', // Option1 Name
        variant.color, // Option1 Value
        isFirstRow ? 'Beden' : '', // Option2 Name
        size, // Option2 Value
        '', // Option3 Name
        '', // Option3 Value
        `${handle}-${variant.color.toLowerCase()}-${size}`, // Variant SKU
        '100', // Variant Grams
        'shopify', // Variant Inventory Tracker
        '10', // Variant Inventory Qty
        'deny', // Variant Inventory Policy
        'manual', // Variant Fulfillment Service
        finalPriceWithMargin.toFixed(2), // Variant Price (indirimli + %15 kar)
        originalPriceWithMargin.toFixed(2), // Variant Compare At Price (orijinal + %15 kar)
        'TRUE', // Variant Requires Shipping
        'TRUE', // Variant Taxable
        '', // Variant Barcode
        isFirstRow && images[0] ? images[0] : '', // Image Src
        isFirstRow && images[0] ? imagePosition.toString() : '', // Image Position
        isFirstRow ? `${brand} ${title}` : '', // Image Alt Text
        'FALSE', // Gift Card
        isFirstRow ? title : '', // SEO Title
        isFirstRow ? `${brand} ${title} - Premium mayo koleksiyonu` : '', // SEO Description
        isFirstRow ? 'Apparel & Accessories > Clothing > Swimwear' : '', // Google Shopping Category
        isFirstRow ? 'female' : '', // Gender
        isFirstRow ? 'adult' : '', // Age Group
        '', // MPN
        isFirstRow ? 'Mayo' : '', // AdWords Grouping
        isFirstRow ? 'boutique,premium' : '', // AdWords Labels
        isFirstRow ? 'new' : '', // Condition
        isFirstRow ? 'TRUE' : '', // Custom Product
        isFirstRow ? variant.color : '', // Custom Label 0 (Renk)
        size, // Custom Label 1 (Beden)
        variant.finalPrice.toFixed(2), // Custom Label 2 (Orijinal Fiyat)
        variant.discountPrice ? 'İndirimli' : 'Normal', // Custom Label 3
        '', // Custom Label 4
        '', // Variant Image
        'kg', // Variant Weight Unit
        '', // Variant Tax Code
        variant.finalPrice.toFixed(2), // Cost per item (orijinal maliyet)
        '', // Price International
        '', // Compare At Price International
        'active' // Status
      ];

      rows.push(row.map(field => 
        typeof field === 'string' && field.includes(',') ? `"${field}"` : field
      ).join(','));

      isFirstRow = false;
    });
  });

  // Ek resimler için satırlar ekle
  images.slice(1).forEach((imageUrl, index) => {
    imagePosition++;
    const imageRow = [
      handle, // Handle
      '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', // Boş alanlar
      imageUrl, // Image Src
      imagePosition.toString(), // Image Position
      `${brand} ${title} - Resim ${imagePosition}`, // Image Alt Text
      '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '' // Kalan boş alanlar
    ];
    
    rows.push(imageRow.join(','));
  });

  console.log(`🎨 Boutique CSV oluşturuldu: ${variants.length} renk, toplam ${variants.reduce((sum, v) => sum + v.sizes.length, 0)} varyant`);
  
  return rows.join('\n');
}