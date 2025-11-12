import { db } from './db';
import { pendingChanges } from '../shared/schema';

interface PriceChangePayload {
  productId: number;
  productTitle: string;
  oldPrice: number;
  newPrice: number;
  color?: string;
  size?: string;
  shopifyProductId?: string;
  shopifyVariantId?: string;
}

interface StockChangePayload {
  productId: number;
  productTitle: string;
  inStock: boolean;
  stockQuantity?: number;
  color?: string;
  size?: string;
  shopifyVariantId?: string;
}

interface VariantChangePayload {
  productId: number;
  productTitle: string;
  changeType: 'variant_added' | 'variant_removed';
  color: string;
  size: string;
  inStock?: boolean;
  shopifyProductId?: string;
}

export class PendingChangeBuilder {
  /**
   * Create a pending price change record
   */
  async createPriceChange(payload: PriceChangePayload): Promise<number> {
    const priceChange = payload.newPrice - payload.oldPrice;
    const changeType = priceChange > 0 ? 'price_increase' : 'price_decrease';
    
    const [result] = await db.insert(pendingChanges).values({
      productId: payload.productId,
      productTitle: payload.productTitle,
      changeType,
      oldPrice: payload.oldPrice,
      newPrice: payload.newPrice,
      priceChange,
      color: payload.color || null,
      size: payload.size || null,
      changePayload: {
        shopifyProductId: payload.shopifyProductId,
        shopifyVariantId: payload.shopifyVariantId,
        oldPrice: payload.oldPrice,
        newPrice: payload.newPrice,
        priceChange
      },
      status: 'pending',
      telegramNotified: false
    }).returning();
    
    console.log(`📝 Pending price change created: ID ${result.id} - ${payload.productTitle} (${payload.oldPrice} → ${payload.newPrice} TL)`);
    return result.id;
  }

  /**
   * Create a pending stock change record
   */
  async createStockChange(payload: StockChangePayload): Promise<number> {
    const changeType = payload.inStock ? 'stock_in' : 'stock_out';
    
    const [result] = await db.insert(pendingChanges).values({
      productId: payload.productId,
      productTitle: payload.productTitle,
      changeType,
      oldStock: payload.inStock ? 0 : payload.stockQuantity || 0,
      newStock: payload.inStock ? payload.stockQuantity || 0 : 0,
      color: payload.color || null,
      size: payload.size || null,
      changePayload: {
        shopifyVariantId: payload.shopifyVariantId,
        inStock: payload.inStock,
        stockQuantity: payload.stockQuantity
      },
      status: 'pending',
      telegramNotified: false
    }).returning();
    
    console.log(`📝 Pending stock change created: ID ${result.id} - ${payload.productTitle} (${changeType})`);
    return result.id;
  }

  /**
   * Create a pending variant change record
   */
  async createVariantChange(payload: VariantChangePayload): Promise<number> {
    const [result] = await db.insert(pendingChanges).values({
      productId: payload.productId,
      productTitle: payload.productTitle,
      changeType: payload.changeType,
      color: payload.color,
      size: payload.size,
      changePayload: {
        shopifyProductId: payload.shopifyProductId,
        color: payload.color,
        size: payload.size,
        inStock: payload.inStock
      },
      status: 'pending',
      telegramNotified: false
    }).returning();
    
    console.log(`📝 Pending variant change created: ID ${result.id} - ${payload.productTitle} (${payload.changeType}: ${payload.color} - ${payload.size})`);
    return result.id;
  }
}

export const pendingChangeBuilder = new PendingChangeBuilder();
