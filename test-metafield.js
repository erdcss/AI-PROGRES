import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

async function testMetafield() {
  const shopifyStore = process.env.SHOPIFY_STORE_DOMAIN;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
  
  if (!shopifyStore || !accessToken) {
    console.error('❌ Shopify credentials not found');
    return;
  }
  
  const trackingId = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  console.log(`🔑 Testing with tracking ID: ${trackingId}`);
  
  const productData = {
    title: "Test Product with Metafield",
    body_html: "<p>Test product to verify metafield functionality</p>",
    vendor: "Test Brand",
    product_type: "Test",
    tags: "test, metafield",
    metafields: [
      {
        namespace: "custom",
        key: "repli_t_id", 
        value: trackingId,
        type: "single_line_text_field"
      }
    ],
    variants: [
      {
        price: "99.99",
        inventory_quantity: 0,
        inventory_management: null,
        inventory_policy: "continue"
      }
    ]
  };
  
  try {
    console.log('📦 Creating product with metafield...');
    const response = await fetch(`https://${shopifyStore}/admin/api/2024-01/products.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ product: productData })
    });
    
    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ Product created successfully!');
      console.log(`Product ID: ${result.product.id}`);
      console.log(`Admin URL: https://${shopifyStore}/admin/products/${result.product.id}`);
      
      // Check if metafield was created
      if (result.product.metafields && result.product.metafields.length > 0) {
        console.log('✅ Metafield was created:', result.product.metafields);
      } else {
        console.log('⚠️ No metafields returned in response');
        console.log('📌 Note: Metafields might be created but not returned in the response');
      }
    } else {
      console.error('❌ Failed to create product:', result.errors || result);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testMetafield();