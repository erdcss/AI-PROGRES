import express from 'express';
import fetch from 'node-fetch';

const router = express.Router();

interface ProductData {
  title: string;
  brand: string;
  price: {
    original: number;
    withProfit: number;
  };
  features: Array<{ key: string; value: string }>;
  images: string[];
  variants: Array<any>;
  success: boolean;
}

// Direct Shopify API integration endpoint
router.post('/shopify/add-product', async (req, res) => {
  try {
    const productData: ProductData = req.body.productData || req.body;
    
    if (!productData || !productData.success) {
      return res.status(400).json({ success: false, error: 'Geçerli product data gerekli' });
    }

    // Enhanced product data preparation
    let featuresHtml = '';
    if (productData.features && productData.features.length > 0) {
      featuresHtml = '<h3>Ürün Özellikleri:</h3><ul>';
      productData.features.forEach(feature => {
        featuresHtml += `<li><strong>${feature.key}:</strong> ${feature.value}</li>`;
      });
      featuresHtml += '</ul>';
    }

    const bodyHtml = `${productData.brand || 'Marka'} ${productData.title || 'Ürün'}. ${featuresHtml}<p><em>Trendyol'dan aktarılmıştır. %15 kar marjı eklenmiştir.</em></p>`;

    // Process variants
    const variants = [];
    const optionValues = new Set();
    
    if (productData.variants && productData.variants.length > 0) {
      productData.variants.forEach((variant, index) => {
        const optionValue = variant.size || variant.color || 'Standart';
        optionValues.add(optionValue);
        variants.push({
          option1: optionValue,
          price: productData.price?.withProfit?.toFixed(2) || '100.00',
          sku: `${productData.brand?.toUpperCase().replace(/\s/g, '') || 'BRAND'}-${Date.now()}-${index}`,
          inventory_quantity: variant.stockCount || 20,
          inventory_management: 'shopify',
          inventory_policy: 'deny',
          cost: productData.price?.original?.toFixed(2) || '85.00'
        });
      });
    } else {
      optionValues.add('Standart');
      variants.push({
        option1: 'Standart',
        price: productData.price?.withProfit?.toFixed(2) || '100.00',
        sku: `${productData.brand?.toUpperCase().replace(/\s/g, '') || 'BRAND'}-${Date.now()}`,
        inventory_quantity: 20,
        inventory_management: 'shopify',
        inventory_policy: 'deny',
        cost: productData.price?.original?.toFixed(2) || '85.00'
      });
    }

    const shopifyProduct = {
      title: productData.title || 'Ürün',
      body_html: bodyHtml,
      vendor: productData.brand || 'Genel',
      product_type: 'Çay & Gıda',
      tags: `${productData.brand?.toLowerCase() || 'genel'}, trendyol, import`,
      variants: variants,
      options: [{ name: 'Varyant', values: Array.from(optionValues) }],
      status: 'active',
      images: (productData.images || []).slice(0, 5).map((img, index) => ({ 
        src: img,
        position: index + 1,
        alt: `${productData.title} - Görsel ${index + 1}`
      }))
    };

    console.log('Creating Shopify product:', shopifyProduct.title);
    console.log('Price data:', { original: productData.price?.original, withProfit: productData.price?.withProfit });
    console.log('Images count:', productData.images?.length || 0);
    
    const response = await fetch('https://kr5xdy-x7.myshopify.com/admin/api/2024-01/products.json', {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': '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',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ product: shopifyProduct })
    });

    if (response.ok) {
      const result = await response.json();
      console.log('✅ Shopify product created:', result.product.id);
      
      // Send Telegram notification
      try {
        const TelegramBot = require('node-telegram-bot-api');
        const token = '7687164814:AAGw-Z0yBYuyfbkA-4bIWhJg_WxxWj14hxk';
        const bot = new TelegramBot(token, { polling: false });
        
        const profitAmount = (productData.price?.withProfit || 0) - (productData.price?.original || 0);
        const profitPercentage = productData.price?.original ? ((profitAmount / productData.price.original) * 100).toFixed(1) : '15.0';
        
        const message = 
          `🆕 <b>API YÜKLEMESİ BAŞARILI</b>\n\n` +
          `📦 <b>Ürün:</b> ${productData.title}\n` +
          `🏢 <b>Marka:</b> ${productData.brand}\n` +
          `💰 <b>Alış Fiyatı:</b> ${productData.price?.original?.toFixed(2)} TL\n` +
          `💵 <b>Satış Fiyatı:</b> ${productData.price?.withProfit?.toFixed(2)} TL\n` +
          `📈 <b>Kar Miktarı:</b> ${profitAmount.toFixed(2)} TL\n` +
          `📊 <b>Kar Oranı:</b> %${profitPercentage}\n` +
          `📸 <b>Görsel:</b> ${productData.images?.length || 0} adet\n` +
          `🏷️ <b>Özellik:</b> ${productData.features?.length || 0} adet\n\n` +
          `⚡ <b>Shopify'a başarıyla eklendi</b>\n` +
          `🆔 <b>Product ID:</b> ${result.product.id}`;
        
        await bot.sendMessage(1219880063, message, { parse_mode: 'HTML' });
        console.log('✅ Telegram notification sent successfully');
      } catch (telegramError) {
        console.error('Telegram notification failed:', telegramError.message);
      }
      
      res.json({
        success: true,
        shopifyProductId: result.product.id,
        adminUrl: `https://kr5xdy-x7.myshopify.com/admin/products/${result.product.id}`,
        storeUrl: `https://kr5xdy-x7.myshopify.com/products/${result.product.handle}`,
        message: 'Ürün başarıyla Shopify\'a eklendi',
        productData: {
          title: productData.title,
          brand: productData.brand,
          originalPrice: productData.price?.original,
          sellingPrice: productData.price?.withProfit,
          imagesCount: productData.images?.length || 0,
          featuresCount: productData.features?.length || 0
        }
      });
    } else {
      const errorText = await response.text();
      console.log('❌ Shopify API error:', errorText);
      res.status(response.status).json({
        success: false,
        error: `Shopify API hatası: ${errorText}`,
        status: response.status
      });
    }
  } catch (error) {
    console.error('Shopify integration error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;