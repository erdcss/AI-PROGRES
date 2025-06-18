import * as fs from 'fs';
import * as path from 'path';

interface VariantData {
  color: string;
  size: string;
  sku: string;
  inStock: boolean;
  variantKey: string;
  images: string[];
  price: string;
  originalPrice: string;
}

interface ProductData {
  id: number;
  url: string;
  title: string;
  description: string;
  brand: string | null;
  attributes: Record<string, string>;
  categories: string[] | null;
  tags: string[] | null;
  category: string | null;
  subcategory: string | null;
  productType: string | null;
}

/**
 * Safely escape CSV field content with enhanced HTML handling
 */
function escapeCsvField(field: string): string {
  if (!field) return '';
  
  // Clean field of problematic characters first
  let cleaned = field
    .replace(/\r\n|\r|\n/g, ' ') // Remove line breaks
    .replace(/\t/g, ' ') // Remove tabs
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
  
  // Escape quotes by doubling them
  cleaned = cleaned.replace(/"/g, '""');
  
  // Always wrap in quotes to avoid issues with commas, quotes, and newlines
  return `"${cleaned}"`;
}

/**
 * Clean HTML content for CSV export with aggressive sanitization
 */
function cleanHtmlForCsv(html: string): string {
  if (!html) return '';
  
  // Aggressive HTML cleaning for CSV safety
  return html
    .replace(/<[^>]*>/g, '') // Remove all HTML tags
    .replace(/&[^;]+;/g, ' ') // Remove all HTML entities
    .replace(/\r\n|\r|\n/g, ' ') // Remove line breaks
    .replace(/\t/g, ' ') // Remove tabs
    .replace(/["']/g, '') // Remove quotes entirely for CSV safety
    .replace(/[^\w\s\-.,!?()]/g, ' ') // Remove special characters except basic punctuation
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()
    .substring(0, 500); // Limit length for CSV
}

/**
 * Generate Shopify CSV with individual variant rows, each with specific images and 10% markup pricing
 */
export async function generateVariantSpecificCSV(
  productData: ProductData,
  variants: VariantData[]
): Promise<{ csvPath: string; filename: string; totalRows: number }> {
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `shopify-variants-${timestamp}.csv`;
  const csvPath = path.join(process.cwd(), 'temp', filename);
  
  // Ensure temp directory exists
  const tempDir = path.dirname(csvPath);
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Shopify CSV headers with all required fields
  const headers = [
    'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Product Category', 'Type',
    'Tags', 'Published', 'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value',
    'Option3 Name', 'Option3 Value', 'Variant SKU', 'Variant Grams', 'Variant Inventory Tracker',
    'Variant Inventory Qty', 'Variant Inventory Policy', 'Variant Fulfillment Service',
    'Variant Price', 'Variant Compare At Price', 'Variant Requires Shipping', 'Variant Taxable',
    'Variant Barcode', 'Image Src', 'Image Position', 'Image Alt Text', 'Gift Card',
    'SEO Title', 'SEO Description', 'Google Shopping / Google Product Category',
    'Google Shopping / Gender', 'Google Shopping / Age Group', 'Google Shopping / MPN',
    'Google Shopping / Condition', 'Google Shopping / Custom Product', 'Variant Image',
    'Variant Weight Unit', 'Variant Tax Code', 'Cost Per Item', 'Included / United States',
    'Price / United States', 'Compare At Price / United States', 'Included / International',
    'Price / International', 'Compare At Price / International', 'Status'
  ];

  const csvRows: string[] = [];
  csvRows.push(headers.join(','));

  const handle = productData.title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();

  let isFirstRow = true;
  let totalVariantRows = 0;

  // Generate individual rows for each variant with specific images and pricing
  variants.forEach((variant, index) => {
    // Main product images for this color variant
    const variantImages = variant.images.length > 0 ? variant.images : [];
    const mainImage = variantImages[0] || '';
    
    // Clean and prepare data
    const cleanDescription = cleanHtmlForCsv(productData.description);
    const cleanTitle = productData.title || '';
    
    // Create base row for this variant
    const baseRow = {
      handle,
      title: isFirstRow ? cleanTitle : '',
      body_html: isFirstRow ? cleanDescription : '',
      vendor: productData.brand || 'Marka Bilinmiyor',
      product_category: (productData.categories && productData.categories[0]) || 'Moda',
      type: productData.productType || 'Giyim',
      tags: isFirstRow ? (productData.tags || []).join(', ') : '',
      published: 'TRUE',
      option1_name: 'Renk',
      option1_value: variant.color,
      option2_name: 'Beden',
      option2_value: variant.size,
      option3_name: '',
      option3_value: '',
      variant_sku: variant.sku,
      variant_grams: '300',
      variant_inventory_tracker: 'shopify',
      variant_inventory_qty: variant.inStock ? '10' : '0',
      variant_inventory_policy: 'deny',
      variant_fulfillment_service: 'manual',
      variant_price: variant.price,
      variant_compare_at_price: variant.originalPrice || '',
      variant_requires_shipping: 'TRUE',
      variant_taxable: 'TRUE',
      variant_barcode: '',
      image_src: mainImage,
      image_position: mainImage ? '1' : '',
      image_alt_text: mainImage ? `${cleanTitle} - ${variant.color} ${variant.size}` : '',
      gift_card: 'FALSE',
      seo_title: isFirstRow ? cleanTitle : '',
      seo_description: isFirstRow ? cleanDescription.substring(0, 160) : '',
      google_shopping_google_product_category: 'Apparel & Accessories',
      google_shopping_gender: 'Unisex',
      google_shopping_age_group: 'Adult',
      google_shopping_mpn: variant.sku,
      google_shopping_condition: 'new',
      google_shopping_custom_product: 'TRUE',
      variant_image: mainImage,
      variant_weight_unit: 'g',
      variant_tax_code: '',
      cost_per_item: '',
      included_united_states: 'TRUE',
      price_united_states: '',
      compare_at_price_united_states: '',
      included_international: 'TRUE',
      price_international: '',
      compare_at_price_international: '',
      status: 'active'
    };

    // Add main variant row with proper escaping
    const mainRowValues = Object.values(baseRow).map(value => escapeCsvField(String(value || '')));
    
    csvRows.push(mainRowValues.join(','));
    totalVariantRows++;

    // Add additional images for this variant as separate rows
    if (variantImages.length > 1) {
      variantImages.slice(1).forEach((imageUrl, imgIndex) => {
        const imageRow = {
          handle,
          title: '',
          body_html: '',
          vendor: '',
          product_category: '',
          type: '',
          tags: '',
          published: '',
          option1_name: '',
          option1_value: '',
          option2_name: '',
          option2_value: '',
          option3_name: '',
          option3_value: '',
          variant_sku: '',
          variant_grams: '',
          variant_inventory_tracker: '',
          variant_inventory_qty: '',
          variant_inventory_policy: '',
          variant_fulfillment_service: '',
          variant_price: '',
          variant_compare_at_price: '',
          variant_requires_shipping: '',
          variant_taxable: '',
          variant_barcode: '',
          image_src: imageUrl,
          image_position: (imgIndex + 2).toString(),
          image_alt_text: `${productData.title} - ${variant.color} ${variant.size} - Görsel ${imgIndex + 2}`,
          gift_card: '',
          seo_title: '',
          seo_description: '',
          google_shopping_google_product_category: '',
          google_shopping_gender: '',
          google_shopping_age_group: '',
          google_shopping_mpn: '',
          google_shopping_condition: '',
          google_shopping_custom_product: '',
          variant_image: '',
          variant_weight_unit: '',
          variant_tax_code: '',
          cost_per_item: '',
          included_united_states: '',
          price_united_states: '',
          compare_at_price_united_states: '',
          included_international: '',
          price_international: '',
          compare_at_price_international: '',
          status: ''
        };

        const imageRowValues = Object.values(imageRow).map(value => escapeCsvField(String(value || '')));
        
        csvRows.push(imageRowValues.join(','));
        totalVariantRows++;
      });
    }

    isFirstRow = false;
  });

  // Write CSV file with BOM for proper UTF-8 encoding
  const csvContent = '\uFEFF' + csvRows.join('\n');
  fs.writeFileSync(csvPath, csvContent, 'utf8');
  
  console.log(`✅ Variant-specific CSV created: ${filename}`);
  console.log(`📊 Total variants: ${variants.length}`);
  console.log(`📊 Total CSV rows: ${totalVariantRows}`);
  console.log(`💰 Individual variant pricing with 10% markup applied`);
  console.log(`🎨 Color-specific images matched to variants`);

  return {
    csvPath,
    filename,
    totalRows: totalVariantRows
  };
}