import { LRUCache } from 'lru-cache';

interface CacheEntry {
  data: any;
  timestamp: number;
  ttl?: number;
}

interface CacheStats {
  totalKeys: number;
  memoryUsage: string;
  hitRate: number;
  totalHits: number;
  totalMisses: number;
}

class MemoryManager {
  private cache: LRUCache<string, CacheEntry>;
  private hits = 0;
  private misses = 0;
  private readonly defaultTTL = 30 * 60 * 1000; // 30 minutes

  constructor() {
    this.cache = new LRUCache({
      max: 1000, // Maximum 1000 items
      maxSize: 50 * 1024 * 1024, // 50MB max size
      sizeCalculation: (value) => JSON.stringify(value).length,
      dispose: (value, key) => {
        console.log(`🗑️ Cache entry disposed: ${key}`);
      }
    });

    // Start cleanup interval
    this.startCleanupInterval();
    console.log('✅ MemoryManager initialized with LRU cache');
  }

  // Get item from cache
  get(key: string): any | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.misses++;
      return null;
    }

    // Check TTL expiration
    if (entry.ttl && Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    return entry.data;
  }

  // Set item in cache
  set(key: string, data: any, ttl?: number): void {
    const entry: CacheEntry = {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL
    };

    this.cache.set(key, entry);
    console.log(`💾 Cache set: ${key} (TTL: ${entry.ttl}ms)`);
  }

  // Delete specific key
  delete(key: string): boolean {
    console.log(`🗑️ Cache delete: ${key}`);
    return this.cache.delete(key);
  }

  // Invalidate keys by pattern
  invalidatePattern(pattern: string): number {
    let count = 0;
    const regex = new RegExp(pattern);
    
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }
    
    console.log(`🗑️ Invalidated ${count} keys matching pattern: ${pattern}`);
    return count;
  }

  // Clear all cache
  purgeAll(): void {
    const keysCount = this.cache.size;
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    console.log(`🗑️ All cache purged: ${keysCount} keys removed`);
  }

  // Get cache statistics
  getStats(): CacheStats {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? (this.hits / total) * 100 : 0;
    
    return {
      totalKeys: this.cache.size,
      memoryUsage: `${Math.round(this.cache.calculatedSize! / 1024 / 1024 * 100) / 100} MB`,
      hitRate: Math.round(hitRate * 100) / 100,
      totalHits: this.hits,
      totalMisses: this.misses
    };
  }

  // Check if key exists
  has(key: string): boolean {
    return this.cache.has(key);
  }

  // Get all keys
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  // Cleanup expired entries
  private cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.ttl && now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} expired cache entries`);
    }
  }

  // Start cleanup interval (every 5 minutes)
  private startCleanupInterval(): void {
    setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }
}

// Singleton instance
export const memoryManager = new MemoryManager();

// Export class for testing
export { MemoryManager };