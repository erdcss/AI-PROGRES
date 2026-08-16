/**
 * Product attribute normalize + Trendyol extraction unit tests.
 * Run: npx tsx server/__tests__/product-attributes.test.ts
 */
import assert from "node:assert/strict";
import {
  normalizeProductAttributes,
  attributesToFeaturePairs,
  isPlausibleAttributePair,
} from "../../shared/product-attributes";
import { extractTrendyolProductAttributes } from "../product-attributes/extract-trendyol-attributes";

function section(title: string) {
  console.log(`\n== ${title} ==`);
}

section("Test 1 — dynamic attributes from DOM");
{
  const html = `
    <html><body>
      <div class="detail-attr-container">
        <li class="detail-attr-item"><span class="attr-key">Kalıp</span><span class="attr-value">Oversize</span></li>
        <li class="detail-attr-item"><span class="attr-key">Kol Boyu</span><span class="attr-value">Uzun</span></li>
        <li class="detail-attr-item"><span class="attr-key">Yaka Tipi</span><span class="attr-value">Bisiklet Yaka</span></li>
      </div>
    </body></html>
  `;
  const attrs = extractTrendyolProductAttributes(html);
  assert.equal(attrs.length, 3);
  assert.equal(attrs[0].name, "Kalıp");
  assert.equal(attrs[0].value, "Oversize");
  assert.equal(attrs[0].source, "trendyol-dom");
  console.log("ok", attrs.length);
}

section("Test 2 — unknown attribute name passes without whitelist");
{
  const html = `
    <html><body>
      <div class="detail-attr-container">
        <li class="detail-attr-item"><span class="attr-key">Test Özelliği XYZ</span><span class="attr-value">Test Değeri 123</span></li>
      </div>
    </body></html>
  `;
  const attrs = extractTrendyolProductAttributes(html);
  assert.equal(attrs.length, 1);
  assert.equal(attrs[0].name, "Test Özelliği XYZ");
  assert.equal(attrs[0].value, "Test Değeri 123");
  console.log("ok unknown attribute");
}

section("Test 3 — duplicate name+value collapsed");
{
  const html = `
    <html><body>
      <div class="detail-attr-container">
        <li class="detail-attr-item"><span class="attr-key">Desen</span><span class="attr-value">Düz</span></li>
        <li class="detail-attr-item"><span class="attr-key">Desen</span><span class="attr-value">Düz</span></li>
      </div>
    </body></html>
  `;
  const attrs = extractTrendyolProductAttributes(html);
  assert.equal(attrs.length, 1);
  console.log("ok dedupe");
}

section("Test 4 — empty value rejected");
{
  assert.equal(isPlausibleAttributePair("Materyal", ""), false);
  const attrs = normalizeProductAttributes([{ key: "Materyal", value: "   " }]);
  assert.equal(attrs.length, 0);
  console.log("ok empty");
}

section("Test 5 — legacy Record still readable");
{
  const attrs = normalizeProductAttributes({
    Kalıp: "Oversize",
    "Kol Boyu": "Uzun",
  });
  assert.equal(attrs.length, 2);
  assert.equal(attrs[0].name, "Kalıp");
  assert.equal(attrs[1].value, "Uzun");
  const pairs = attributesToFeaturePairs(attrs);
  assert.equal(pairs[0].key, "Kalıp");
  console.log("ok legacy");
}

section("Test 6 — no attributes → empty, no crash");
{
  const attrs = extractTrendyolProductAttributes("<html><body><p>no attrs</p></body></html>");
  assert.equal(attrs.length, 0);
  assert.deepEqual(normalizeProductAttributes(undefined), []);
  assert.deepEqual(normalizeProductAttributes(null), []);
  console.log("ok empty product");
}

section("JSON-LD preferred path");
{
  const html = `
    <html><head>
      <script type="application/ld+json">
      {"@type":"Product","additionalProperty":[
        {"@type":"PropertyValue","name":"Koleksiyon","value":"Basic"},
        {"@type":"PropertyValue","name":"Kumaş Tipi","value":"Dokuma"}
      ]}
      </script>
    </head><body></body></html>
  `;
  const attrs = extractTrendyolProductAttributes(html);
  assert.equal(attrs.length, 2);
  assert.equal(attrs[0].source, "trendyol-jsonld");
  console.log("ok jsonld");
}

console.log("\nAll product-attributes tests passed.");
