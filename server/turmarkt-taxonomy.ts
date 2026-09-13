import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { fileURLToPath } from 'url';

export interface TurmarktTaxonomyEntry {
  collection: string;
  category: string;
  subcategory: string;
  productType: string;
  tags: string[];
  keywords: string[];
}

export interface TurmarktClassification {
  category: string;
  subcategory: string;
  productType: string;
  tags: string[];
  collections: string[];
  confidence: number;
  matchedBy: string[];
  source: 'catalog' | 'fallback';
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function trNormalize(value: unknown): string {
  return String(value ?? '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitMulti(value: unknown): string[] {
  return String(value ?? '')
    .split(/[|;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function pick(row: Record<string, unknown>, names: string[]): string {
  const normalized = new Map(
    Object.entries(row).map(([key, value]) => [trNormalize(key).replace(/\s/g, ''), String(value ?? '').trim()])
  );

  for (const name of names) {
    const hit = normalized.get(trNormalize(name).replace(/\s/g, ''));
    if (hit) return hit;
  }
  return '';
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values.map((v) => v.trim()).filter(Boolean)) {
    const key = trNormalize(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function discoverCatalogFiles(): string[] {
  const explicit = process.env.TURMARKT_COLLECTIONS_CSV?.trim();
  const roots = [
    path.resolve(__dirname, '..'),
    path.resolve(__dirname, '../data'),
    path.resolve(__dirname, '../exports'),
    process.cwd(),
  ];

  const results: string[] = [];
  if (explicit && fs.existsSync(explicit)) results.push(path.resolve(explicit));

  const namePattern = /(koleksiyon|collection).*(etiket|tag)|(etiket|tag).*(koleksiyon|collection)/i;
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    let files: string[] = [];
    try {
      files = fs.readdirSync(root);
    } catch {
      continue;
    }
    for (const file of files) {
      if (!/\.(csv|xlsx?)$/i.test(file) || !namePattern.test(file)) continue;
      const full = path.join(root, file);
      if (!results.includes(full)) results.push(full);
    }
  }
  return results;
}

function rowToEntry(row: Record<string, unknown>): TurmarktTaxonomyEntry | null {
  const collection = pick(row, ['koleksiyon', 'collection', 'koleksiyon adi', 'collection name']);
  const category = pick(row, ['kategori', 'category', 'ana kategori', 'main category']);
  const subcategory = pick(row, ['alt kategori', 'subcategory', 'sub category']);
  const productType = pick(row, ['urun tipi', 'ürün tipi', 'product type', 'tip', 'type']);
  const tagsRaw = pick(row, ['etiketler', 'etiket', 'tags', 'tag']);
  const keywordsRaw = pick(row, ['anahtar kelimeler', 'anahtar kelime', 'keywords', 'keyword', 'es anlamlilar', 'eş anlamlılar']);

  const effectiveCollection = collection || subcategory || productType || category;
  if (!effectiveCollection) return null;

  const tags = unique([
    ...splitMulti(tagsRaw),
    category,
    subcategory,
    productType,
  ]);

  const keywords = unique([
    ...splitMulti(keywordsRaw),
    collection,
    category,
    subcategory,
    productType,
    ...tags,
  ]);

  return {
    collection: effectiveCollection,
    category: category || collection || 'Genel',
    subcategory: subcategory || '',
    productType: productType || subcategory || collection || '',
    tags,
    keywords,
  };
}

let cachedEntries: TurmarktTaxonomyEntry[] | null = null;
let cachedFiles: string[] = [];

export function loadTurmarktTaxonomy(force = false): TurmarktTaxonomyEntry[] {
  if (cachedEntries && !force) return cachedEntries;

  const files = discoverCatalogFiles();
  const entries: TurmarktTaxonomyEntry[] = [];

  for (const file of files) {
    try {
      const workbook = XLSX.readFile(file, { raw: false });
      for (const sheetName of workbook.SheetNames) {
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: '' });
        for (const row of rows) {
          const entry = rowToEntry(row);
          if (entry) entries.push(entry);
        }
      }
    } catch (error) {
      console.warn(`[TAXONOMY] Katalog okunamadı: ${file}`, error);
    }
  }

  const deduped = new Map<string, TurmarktTaxonomyEntry>();
  for (const entry of entries) {
    const key = [entry.collection, entry.category, entry.subcategory, entry.productType]
      .map(trNormalize)
      .join('|');
    if (!deduped.has(key)) deduped.set(key, entry);
  }

  cachedFiles = files;
  cachedEntries = [...deduped.values()];
  console.log(`[TAXONOMY] ${cachedEntries.length} Turmarkt koleksiyon kuralı yüklendi (${files.length} dosya)`);
  return cachedEntries;
}

export function getTurmarktTaxonomyStatus() {
  const entries = loadTurmarktTaxonomy();
  return { loaded: entries.length > 0, entries: entries.length, files: cachedFiles };
}

export function classifyWithTurmarktTaxonomy(input: {
  title?: string;
  brand?: string;
  categories?: string[];
  attributes?: Record<string, unknown>;
}): TurmarktClassification | null {
  const entries = loadTurmarktTaxonomy();
  if (!entries.length) return null;

  const categoryText = (input.categories || []).join(' ');
  const attributeText = Object.entries(input.attributes || {})
    .map(([key, value]) => `${key} ${String(value ?? '')}`)
    .join(' ');
  const haystack = trNormalize(`${input.title || ''} ${input.brand || ''} ${categoryText} ${attributeText}`);
  if (!haystack) return null;

  const scored = entries
    .map((entry) => {
      let score = 0;
      const matchedBy: string[] = [];
      const fields: Array<[string, number]> = [
        [entry.productType, 12],
        [entry.subcategory, 10],
        [entry.collection, 9],
        [entry.category, 6],
      ];

      for (const [value, weight] of fields) {
        const needle = trNormalize(value);
        if (needle && haystack.includes(needle)) {
          score += weight;
          matchedBy.push(value);
        }
      }

      for (const keyword of entry.keywords) {
        const needle = trNormalize(keyword);
        if (needle.length < 3) continue;
        if (haystack.includes(needle)) {
          score += needle.includes(' ') ? 5 : 3;
          matchedBy.push(keyword);
        }
      }

      return { entry, score, matchedBy: unique(matchedBy) };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return null;
  const best = scored[0];
  const second = scored[1]?.score || 0;
  const confidence = Math.max(0.2, Math.min(0.99, 0.45 + best.score / 50 + Math.max(0, best.score - second) / 50));

  return {
    category: best.entry.category,
    subcategory: best.entry.subcategory,
    productType: best.entry.productType,
    tags: unique(best.entry.tags).slice(0, 20),
    collections: unique([best.entry.collection, best.entry.category, best.entry.subcategory].filter(Boolean)),
    confidence: Number(confidence.toFixed(2)),
    matchedBy: best.matchedBy,
    source: 'catalog',
  };
}
