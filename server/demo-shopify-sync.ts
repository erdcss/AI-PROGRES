// Demo: Trendyol ürününü Shopify'a senkronize etme
import { ShopifyIntegration } from './shopify-integration';

export async function demoShopifySync() {
  const shopify = new ShopifyIntegration('turmarkt.com', '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');
  
  // Test ürün verisi (Ritnice pantolon örneği)
  const mockProduct = {
    id: 1,
    trendyolUrl: 'https://www.trendyol.com/ritnice/line-kadin-likrali-cirt-kapama-siyah-palazzo-pantolon-p-758917759',
    trendyolProductId: '758917759',
    shopifyProductId: null,
    title: 'Ritnice Line Kadın Likralı Cırt Kapama Siyah Palazzo Pantolon',
    brand: 'Ritnice',
    description: 'Yüksek kaliteli palazzo pantolon',
    category: 'Kadın Giyim',
    images: [
      'https://cdn.dsmcdn.com/ty1596/prod/QC/20241104/13/62c34e5d-7fc2-39b2-84fd-a150aaf20542/1_org_zoom.jpg',
      'https://cdn.dsmcdn.com/ty1671/prod/QC/20250506/00/70ed6000-aca0-364b-adab-15f8bb5ce350/1_org_zoom.jpg'
    ],
    features: {
      'Materyal': 'Dokuma',
      'Renk': 'Siyah',
      'Bel': 'Yüksek Bel'
    },
    colorOptions: ['Siyah'],
    sizeOptions: ['34', '36', '38', '40', '42', '44', '46', '48', '50'],
    isActive: true,
    profitMargin: '15.00',
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSyncAt: null,
    syncStatus: 'pending'
  };

  const mockVariants = [
    {
      id: 1,
      productId: 1,
      shopifyVariantId: null,
      color: 'Siyah',
      size: '36',
      sku: 'ritnice-siyah-36',
      trendyolPrice: '370.00',
      shopifyPrice: '425.50', // %15 kar marjı
      stockCount: 5,
      inStock: true,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: 2,
      productId: 1,
      shopifyVariantId: null,
      color: 'Siyah',
      size: '38',
      sku: 'ritnice-siyah-38',
      trendyolPrice: '370.00',
      shopifyPrice: '425.50',
      stockCount: 0, // Tükendi
      inStock: false,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];

  console.log('🛒 Shopify Demo Sync başlatılıyor...');
  console.log(`📦 Ürün: ${mockProduct.title}`);
  console.log(`💰 Fiyat: ${mockVariants[0].trendyolPrice} TL → ${mockVariants[0].shopifyPrice} TL (%15 kar marjı)`);
  console.log(`👕 Varyantlar: ${mockVariants.length} adet`);
  console.log(`📊 Stok durumu: 36 beden (${mockVariants[0].stockCount} adet), 38 beden (${mockVariants[1].stockCount} adet - TÜKENDI)`);

  try {
    // Shopify'a ürün gönder
    const shopifyProductId = await shopify.createProduct(mockProduct, mockVariants);
    
    if (shopifyProductId) {
      console.log(`✅ Başarılı! Shopify Product ID: ${shopifyProductId}`);
      console.log(`🔗 Ürün URL: https://turmarkt.com/admin/products/${shopifyProductId}`);
      console.log('📋 Senkronize edilen özellikler:');
      console.log('   - Ürün bilgileri ve görseller');
      console.log('   - %15 kar marjı ile fiyatlandırma');
      console.log('   - Varyant bazlı stok kontrolü');
      console.log('   - Otomatik SKU oluşturma');
      return true;
    } else {
      console.log('❌ Senkronizasyon başarısız');
      return false;
    }
  } catch (error) {
    console.error('❌ Demo hata:', error.message);
    return false;
  }
}

// Test çalıştır
if (import.meta.url === `file://${process.argv[1]}`) {
  demoShopifySync();
}