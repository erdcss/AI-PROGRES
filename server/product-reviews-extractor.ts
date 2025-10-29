/**
 * Product Reviews Extractor - Real Customer Reviews from Trendyol
 */

import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';

export interface ProductReview {
  id: string;
  customerName: string;
  rating: number;
  date: string;
  comment: string;
  verified: boolean;
  helpful: number;
  variant?: {
    color?: string;
    size?: string;
  };
  images?: string[];
}

export interface ReviewsResult {
  success: boolean;
  reviews: ProductReview[];
  averageRating: number;
  totalReviews: number;
  ratingDistribution: {
    5: number;
    4: number;
    3: number;
    2: number;
    1: number;
  };
  extractedAt: string;
}

export async function extractProductReviews(trendyolUrl: string): Promise<ReviewsResult> {
  console.log(`⭐ Extracting reviews for: ${trendyolUrl}`);
  
  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // Set user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    // Navigate to product page
    await page.goto(trendyolUrl, { waitUntil: 'networkidle0' });
    
    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Try to find and click reviews tab
    try {
      const reviewsTab = await page.$('[data-testid="reviews-tab"], .reviews-tab, a[href*="yorumlar"]');
      if (reviewsTab) {
        await reviewsTab.click();
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (e) {
      console.log('Reviews tab not found, trying direct reviews section');
    }
    
    // Scroll to load more reviews
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Try to click "Show More" buttons
    try {
      const showMoreButtons = await page.$$('button[class*="show-more"], button[class*="load-more"], .load-more-reviews');
      for (const button of showMoreButtons) {
        await button.click();
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (e) {
      console.log('Show more buttons not found');
    }
    
    // Get page content
    const content = await page.content();
    await browser.close();
    
    // Parse reviews from HTML
    const $ = cheerio.load(content);
    const reviews: ProductReview[] = [];
    
    // Try multiple review selectors
    const reviewSelectors = [
      '.review-item',
      '.comment-item',
      '.review-card',
      '[data-testid="review-item"]',
      '.customer-review',
      '.review-container'
    ];
    
    let reviewsFound = false;
    
    for (const selector of reviewSelectors) {
      const reviewElements = $(selector);
      if (reviewElements.length > 0) {
        reviewsFound = true;
        console.log(`Found ${reviewElements.length} reviews with selector: ${selector}`);
        
        reviewElements.each((index, element) => {
          const review = parseReviewElement($, element, index);
          if (review) {
            reviews.push(review);
          }
        });
        break;
      }
    }
    
    // If no reviews found with specific selectors, try generic approach
    if (!reviewsFound) {
      console.log('Trying generic review extraction...');
      
      // Look for star ratings and comments
      const starElements = $('[class*="star"], [class*="rating"], .rating-star');
      const commentElements = $('[class*="comment"], [class*="review"], .user-comment');
      
      if (starElements.length > 0 && commentElements.length > 0) {
        for (let i = 0; i < Math.min(starElements.length, commentElements.length); i++) {
          const rating = extractRatingFromElement($, starElements.eq(i));
          const comment = $(commentElements.eq(i)).text().trim();
          
          if (rating > 0 && comment) {
            reviews.push({
              id: `review-${i}`,
              customerName: 'Müşteri',
              rating,
              date: new Date().toISOString(),
              comment,
              verified: false,
              helpful: 0
            });
          }
        }
      }
    }
    
    console.log(`✅ Reviews extracted: ${reviews.length}`);
    
    // Calculate statistics
    const averageRating = reviews.length > 0 
      ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length 
      : 0;
    
    const ratingDistribution = {
      5: reviews.filter(r => r.rating === 5).length,
      4: reviews.filter(r => r.rating === 4).length,
      3: reviews.filter(r => r.rating === 3).length,
      2: reviews.filter(r => r.rating === 2).length,
      1: reviews.filter(r => r.rating === 1).length
    };
    
    return {
      success: true,
      reviews,
      averageRating: Math.round(averageRating * 10) / 10,
      totalReviews: reviews.length,
      ratingDistribution,
      extractedAt: new Date().toISOString()
    };
    
  } catch (error) {
    console.error(`❌ Reviews extraction failed:`, error);
    
    return {
      success: false,
      reviews: [],
      averageRating: 0,
      totalReviews: 0,
      ratingDistribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
      extractedAt: new Date().toISOString()
    };
  }
}

function parseReviewElement($: any, element: any, index: number): ProductReview | null {
  try {
    const $element = $(element);
    
    // Extract customer name
    const customerName = $element.find('.customer-name, .reviewer-name, .user-name, [class*="name"]').text().trim() || 'Müşteri';
    
    // Extract rating
    const rating = extractRatingFromElement($, $element);
    
    // Extract date
    const dateText = $element.find('.review-date, .date, [class*="date"]').text().trim();
    const date = parseDateString(dateText);
    
    // Extract comment
    const comment = $element.find('.review-text, .comment-text, .review-content, [class*="comment"]').text().trim();
    
    // Extract verified status
    const verified = $element.find('.verified, [class*="verified"]').length > 0;
    
    // Extract helpful count
    const helpfulText = $element.find('.helpful-count, [class*="helpful"]').text();
    const helpful = parseInt(helpfulText.replace(/\D/g, '')) || 0;
    
    // Extract variant info
    const variantInfo = extractVariantInfo($, $element);
    
    // Extract images
    const images = extractReviewImages($, $element);
    
    if (comment && comment.length > 5) {
      return {
        id: `review-${index}`,
        customerName,
        rating,
        date,
        comment,
        verified,
        helpful,
        variant: variantInfo,
        images
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error parsing review element:', error);
    return null;
  }
}

function extractRatingFromElement($: any, element: any): number {
  const $element = $(element);
  
  // Try to find star ratings
  const starElements = $element.find('.star, [class*="star"], .rating-star');
  if (starElements.length > 0) {
    const filledStars = $element.find('.star.filled, .star.active, [class*="star"][class*="filled"]');
    if (filledStars.length > 0) {
      return filledStars.length;
    }
  }
  
  // Try to find rating in text
  const ratingText = $element.find('.rating-value, [class*="rating"]').text();
  const ratingMatch = ratingText.match(/(\d+)/);
  if (ratingMatch) {
    return parseInt(ratingMatch[1]);
  }
  
  // Try to find rating in data attributes
  const ratingAttr = $element.find('[data-rating]').attr('data-rating');
  if (ratingAttr) {
    return parseInt(ratingAttr);
  }
  
  return 5; // Default to 5 stars if not found
}

function extractVariantInfo($: any, element: any): { color?: string; size?: string } | undefined {
  const $element = $(element);
  
  const variantText = $element.find('.variant-info, .product-variant, [class*="variant"]').text();
  
  if (variantText) {
    const variant: { color?: string; size?: string } = {};
    
    // Extract color
    const colorMatch = variantText.match(/renk[:\s]*([^,\s]+)/i);
    if (colorMatch) {
      variant.color = colorMatch[1].trim();
    }
    
    // Extract size
    const sizeMatch = variantText.match(/beden[:\s]*([^,\s]+)/i);
    if (sizeMatch) {
      variant.size = sizeMatch[1].trim();
    }
    
    return Object.keys(variant).length > 0 ? variant : undefined;
  }
  
  return undefined;
}

function extractReviewImages($: any, element: any): string[] {
  const $element = $(element);
  const images: string[] = [];
  
  $element.find('img').each((i, img) => {
    const src = $(img).attr('src') || $(img).attr('data-src');
    if (src && src.includes('review') && !src.includes('avatar')) {
      images.push(src);
    }
  });
  
  return images;
}

function parseDateString(dateText: string): string {
  if (!dateText) return new Date().toISOString();
  
  // Try to parse Turkish date formats
  const turkishMonths = {
    'Ocak': '01', 'Şubat': '02', 'Mart': '03', 'Nisan': '04',
    'Mayıs': '05', 'Haziran': '06', 'Temmuz': '07', 'Ağustos': '08',
    'Eylül': '09', 'Ekim': '10', 'Kasım': '11', 'Aralık': '12'
  };
  
  for (const [turkish, month] of Object.entries(turkishMonths)) {
    if (dateText.includes(turkish)) {
      const parts = dateText.split(' ');
      const day = parts[0];
      const year = parts[2] || new Date().getFullYear();
      return new Date(`${year}-${month}-${day.padStart(2, '0')}`).toISOString();
    }
  }
  
  // Try standard date parsing
  const date = new Date(dateText);
  if (!isNaN(date.getTime())) {
    return date.toISOString();
  }
  
  return new Date().toISOString();
}

// Export already done above