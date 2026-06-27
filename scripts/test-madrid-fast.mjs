import { fetchTrendyolDirectHtmlRaw } from '../server/trendyol-direct-html.ts';
import { extractTrendyolProductFromHtml } from '../server/trendyol-html-extractor.ts';

const url =
  'https://www.trendyol.com/neon-shoes/madrid-unisex-ortopedik-tabanli-terlik-cift-bantli-tokali-gunluk-rahat-ev-disari-terligi-p-270541104';

const direct = await fetchTrendyolDirectHtmlRaw(url);
console.log('direct html:', direct?.html.length);

// Simulate extractTrendyolProductFromHtml without re-fetch
import * as cheerio from 'cheerio';
import { parseSlicingAttributesFromHtml, buildVariantsFromSlicing } from '../server/trendyol-slicing-parser.ts';
import { filterValidProductImages } from '../server/trendyol-image-utils.ts';
import { extractProductImagesFromHtmlRegex } from '../shared/trendyol-bot-detection.ts';

if (direct?.html) {
  const slicing = parseSlicingAttributesFromHtml(direct.html);
  const $ = cheerio.load(direct.html);
  const built = buildVariantsFromSlicing($, direct.html);
  console.log('slicing colors:', slicing.colors.length, slicing.sizes.length);
  console.log('built variants:', built.length);
  const regex = extractProductImagesFromHtmlRegex(direct.html);
  console.log('regex imgs:', filterValidProductImages(regex).length);
}

process.exit(0);
