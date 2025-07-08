/**
 * Scenario-Based Product Extraction Manager
 * Organizes the entire system around different extraction scenarios
 */

export enum ExtractionScenario {
  SINGLE_VARIANT = 'single-variant',           // Products with no size/color variants
  MULTI_SIZE = 'multi-size',                   // Products with multiple sizes, single color
  MULTI_COLOR = 'multi-color',                 // Products with multiple colors, single size
  FULL_MATRIX = 'full-matrix',                 // Products with both size and color variants
  OUT_OF_STOCK = 'out-of-stock',              // Products with stock issues
  COMPLEX_VARIANTS = 'complex-variants'        // Products with unusual variant structures
}

export interface ScenarioDetectionResult {
  scenario: ExtractionScenario;
  confidence: number;
  evidence: string[];
  suggestedStrategy: string;
}

export interface ScenarioExtractionConfig {
  sizeSelectors: string[];
  colorSelectors: string[];
  stockSelectors: string[];
  priceSelectors: string[];
  imageSelectors: string[];
  specialHandling: boolean;
}

export class ScenarioManager {
  private scenarios: Map<ExtractionScenario, ScenarioExtractionConfig> = new Map();

  constructor() {
    this.initializeScenarios();
  }

  private initializeScenarios() {
    // Scenario 1: Single Variant Products
    this.scenarios.set(ExtractionScenario.SINGLE_VARIANT, {
      sizeSelectors: [
        '.single-size',
        '[data-single-variant]',
        '.no-variants'
      ],
      colorSelectors: [
        '.product-color-single'
      ],
      stockSelectors: [
        '.single-stock-status',
        '.product-availability'
      ],
      priceSelectors: [
        '.price-single',
        '.current-price'
      ],
      imageSelectors: [
        '.product-image',
        '.main-image'
      ],
      specialHandling: false
    });

    // Scenario 2: Multi-Size Products
    this.scenarios.set(ExtractionScenario.MULTI_SIZE, {
      sizeSelectors: [
        'button[data-testid*="size"]',
        'button[class*="size"]',
        '.size-selector button',
        '.variant-size-option',
        'button[aria-label*="beden"]',
        'button[title*="beden"]',
        'button[aria-label*="S"]',
        'button[aria-label*="M"]',
        'button[aria-label*="L"]',
        'button[title*="S"]',
        'button[title*="M"]',
        'button[title*="L"]',
        '[data-size]',
        '.size-item',
        '.size-option',
        'div[data-testid*="variant"]',
        'button[data-testid*="variant"]',
        '.variant-item',
        '.product-variant button'
      ],
      colorSelectors: [
        '.single-color-display'
      ],
      stockSelectors: [
        '.size-stock-status',
        'button[disabled]',
        '.out-of-stock-size',
        '.size-unavailable'
      ],
      priceSelectors: [
        '.size-price',
        '.variant-price'
      ],
      imageSelectors: [
        '.size-image',
        '.variant-image'
      ],
      specialHandling: true
    });

    // Scenario 3: Multi-Color Products
    this.scenarios.set(ExtractionScenario.MULTI_COLOR, {
      sizeSelectors: [
        '.single-size-display'
      ],
      colorSelectors: [
        'button[data-testid*="color"]',
        'button[class*="color"]',
        '.color-selector button',
        '.variant-color-option',
        'button[aria-label*="renk"]',
        '[data-color]',
        '.color-item',
        '.color-option',
        '.color-swatch'
      ],
      stockSelectors: [
        '.color-stock-status',
        '.out-of-stock-color'
      ],
      priceSelectors: [
        '.color-price',
        '.variant-price'
      ],
      imageSelectors: [
        '.color-image',
        '.variant-image',
        '.color-gallery'
      ],
      specialHandling: true
    });

    // Scenario 4: Full Matrix (Size + Color)
    this.scenarios.set(ExtractionScenario.FULL_MATRIX, {
      sizeSelectors: [
        'button[data-testid*="size"]',
        'button[class*="size"]',
        '.size-selector button',
        '.variant-size-option',
        'button[aria-label*="beden"]',
        '[data-size]',
        '.size-item'
      ],
      colorSelectors: [
        'button[data-testid*="color"]',
        'button[class*="color"]',
        '.color-selector button',
        '.variant-color-option',
        'button[aria-label*="renk"]',
        '[data-color]',
        '.color-item',
        '.color-swatch'
      ],
      stockSelectors: [
        '.variant-stock-status',
        '.matrix-stock',
        'button[disabled]',
        '.out-of-stock',
        '.unavailable-variant'
      ],
      priceSelectors: [
        '.variant-price',
        '.matrix-price'
      ],
      imageSelectors: [
        '.variant-image',
        '.matrix-gallery',
        '.variant-gallery'
      ],
      specialHandling: true
    });

    // Scenario 5: Out of Stock Products
    this.scenarios.set(ExtractionScenario.OUT_OF_STOCK, {
      sizeSelectors: [
        'button[disabled]',
        '.size-disabled',
        '.size-unavailable'
      ],
      colorSelectors: [
        'button[disabled]',
        '.color-disabled',
        '.color-unavailable'
      ],
      stockSelectors: [
        '.out-of-stock',
        '.stock-empty',
        '.unavailable',
        '.sold-out',
        '.tükendi',
        '.stokta-yok'
      ],
      priceSelectors: [
        '.original-price',
        '.unavailable-price'
      ],
      imageSelectors: [
        '.product-image',
        '.unavailable-image'
      ],
      specialHandling: true
    });

    // Scenario 6: Complex Variants
    this.scenarios.set(ExtractionScenario.COMPLEX_VARIANTS, {
      sizeSelectors: [
        '[data-variant]',
        '.custom-variant',
        '.special-size'
      ],
      colorSelectors: [
        '[data-variant]',
        '.custom-color',
        '.special-color'
      ],
      stockSelectors: [
        '.complex-stock',
        '.variant-availability'
      ],
      priceSelectors: [
        '.complex-price',
        '.variant-pricing'
      ],
      imageSelectors: [
        '.complex-gallery',
        '.variant-images'
      ],
      specialHandling: true
    });
  }

  /**
   * Detect the most likely scenario for a given product page
   */
  detectScenario(htmlContent: string, $: any): ScenarioDetectionResult {
    const results: Array<{scenario: ExtractionScenario, score: number, evidence: string[]}> = [];

    console.log(`🎯 SCENARIO DETECTION starting...`);

    // Check each scenario
    for (const [scenario, config] of this.scenarios.entries()) {
      const evidence: string[] = [];
      let score = 0;

      // Check size selectors with detailed logging
      const sizeElements = this.countElementsWithDebug($, config.sizeSelectors, 'size');
      if (sizeElements.count > 0) {
        score += sizeElements.count * 3; // Higher weight for size detection
        evidence.push(`${sizeElements.count} size elements found via: ${sizeElements.foundSelectors.join(', ')}`);
        console.log(`🔍 ${scenario}: ${sizeElements.count} size elements found`);
      }

      // Check color selectors
      const colorElements = this.countElementsWithDebug($, config.colorSelectors, 'color');
      if (colorElements.count > 0) {
        score += colorElements.count * 2;
        evidence.push(`${colorElements.count} color elements found via: ${colorElements.foundSelectors.join(', ')}`);
        console.log(`🎨 ${scenario}: ${colorElements.count} color elements found`);
      }

      // Check stock selectors
      const stockElements = this.countElementsWithDebug($, config.stockSelectors, 'stock');
      if (stockElements.count > 0) {
        score += stockElements.count;
        evidence.push(`${stockElements.count} stock indicators found via: ${stockElements.foundSelectors.join(', ')}`);
      }

      // Additional heuristics for better detection
      if (scenario === ExtractionScenario.MULTI_SIZE) {
        // Look for common size patterns in HTML content
        const sizePattern = /\b(XS|S|M|L|XL|XXL|XXXL)\b/gi;
        const sizeMatches = htmlContent.match(sizePattern);
        if (sizeMatches && sizeMatches.length > 2) {
          score += sizeMatches.length;
          evidence.push(`${sizeMatches.length} size references in HTML`);
          console.log(`📏 ${scenario}: Found ${sizeMatches.length} size references in HTML`);
        }
      }

      console.log(`🎯 ${scenario}: Total score = ${score}, Evidence: ${evidence.length} items`);
      results.push({ scenario, score, evidence });
    }

    // Sort by score and return the best match
    results.sort((a, b) => b.score - a.score);
    const best = results[0];
    const second = results[1];

    console.log(`🏆 Top scenarios: 1) ${best.scenario} (${best.score}), 2) ${second?.scenario || 'none'} (${second?.score || 0})`);

    // Calculate confidence based on score difference
    const confidence = best.score > 0 ? Math.min(100, (best.score / (best.score + (second?.score || 1))) * 100) : 0;

    return {
      scenario: best.scenario,
      confidence,
      evidence: best.evidence,
      suggestedStrategy: this.getSuggestedStrategy(best.scenario)
    };
  }

  private countElements($: any, selectors: string[]): number {
    let count = 0;
    selectors.forEach(selector => {
      count += $(selector).length;
    });
    return count;
  }

  private countElementsWithDebug($: any, selectors: string[], type: string): { count: number, foundSelectors: string[] } {
    let count = 0;
    const foundSelectors: string[] = [];
    
    selectors.forEach(selector => {
      const elements = $(selector);
      if (elements.length > 0) {
        count += elements.length;
        foundSelectors.push(`${selector}(${elements.length})`);
        console.log(`🔍 Found ${elements.length} ${type} elements with selector: ${selector}`);
        
        // Log element details for debugging
        elements.each((i: number, el: any) => {
          const text = $(el).text().trim();
          const ariaLabel = $(el).attr('aria-label') || '';
          const title = $(el).attr('title') || '';
          console.log(`  Element ${i}: text="${text}", aria-label="${ariaLabel}", title="${title}"`);
        });
      }
    });
    
    return { count, foundSelectors };
  }

  private getSuggestedStrategy(scenario: ExtractionScenario): string {
    const strategies = {
      [ExtractionScenario.SINGLE_VARIANT]: 'Extract basic product info without variant complexity',
      [ExtractionScenario.MULTI_SIZE]: 'Focus on size extraction with single color',
      [ExtractionScenario.MULTI_COLOR]: 'Focus on color extraction with single size',
      [ExtractionScenario.FULL_MATRIX]: 'Extract complete size-color matrix',
      [ExtractionScenario.OUT_OF_STOCK]: 'Handle stock status and availability',
      [ExtractionScenario.COMPLEX_VARIANTS]: 'Use advanced variant detection methods'
    };
    return strategies[scenario];
  }

  /**
   * Get extraction configuration for a specific scenario
   */
  getScenarioConfig(scenario: ExtractionScenario): ScenarioExtractionConfig | undefined {
    return this.scenarios.get(scenario);
  }

  /**
   * Get all available scenarios
   */
  getAllScenarios(): ExtractionScenario[] {
    return Array.from(this.scenarios.keys());
  }
}