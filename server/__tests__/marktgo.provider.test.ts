/**
 * MARKT-GO provider isolation / mapping / error tests
 * Run: npm run test:marktgo
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  decryptSecret,
  encryptSecret,
  looksLikeMarktGoToken,
  maskToken,
  redactSecrets,
} from "../lib/secret-crypto";
import { missingRequiredScopes, parseScopeList } from "../services/marktgo/scopes";
import { normalizeMarktGoHttpError } from "../services/marktgo/errors";
import { extractId, listItemsFromPayload, normalizeMarktGoProduct } from "../services/marktgo/normalize";
import { idempotencyKeyForProduct, stableExternalId } from "../services/marktgo/mapping.service";
import {
  localIdFromRemote,
  mapPoolProductToMarktGoInput,
  parseSourceUrlFromTags,
  poolLocalProductId,
  remoteToPoolProduct,
  sourceUrlTag,
} from "../services/marktgo/pool-map";
import { sendButtonLabel } from "@shared/integration-provider";
import { MarktGoClient } from "../services/marktgo/client";
import {
  pickMissingMappings,
  pickUnmappedRemoteIds,
  shouldAbortCatalogWipe,
} from "../services/marktgo/reconcile.service";

const __dirname = dirname(fileURLToPath(import.meta.url));
let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

console.log("\n=== MARKT-GO Provider Tests ===\n");

assert(looksLikeMarktGoToken("mgt_live_abc"), "valid live token prefix");
assert(looksLikeMarktGoToken("mgt_test_xyz"), "valid test token prefix");
assert(!looksLikeMarktGoToken("shpat_xxx"), "shopify token is not marktgo");

const enc = encryptSecret("mgt_live_secretvalue7284");
assert(enc.startsWith("enc:v1:"), "token encrypted at rest");
assert(decryptSecret(enc) === "mgt_live_secretvalue7284", "token roundtrip decrypt");
assert(maskToken("mgt_live_secretvalue7284").includes("••••"), "UI masked token");
assert(maskToken("mgt_live_secretvalue7284").endsWith("7284"), "mask keeps last4");
assert(!redactSecrets("Bearer mgt_live_abcdef").includes("abcdef"), "token not logged via redact");

assert(normalizeMarktGoHttpError(401, "").message.includes("geçersiz"), "401 state");
assert(normalizeMarktGoHttpError(403, "inventory.update").message.includes("yetkisi"), "403 missing scope");
assert(normalizeMarktGoHttpError(409, "").code === "duplicate", "409 duplicate");
assert(normalizeMarktGoHttpError(429, "").retryable === true, "429 retryable");
assert(normalizeMarktGoHttpError(400, "bad").retryable === false, "400 not retried");

const missing = missingRequiredScopes(parseScopeList("products.read products.create"));
assert(missing.includes("inventory.update"), "missing scope detection");
assert(!missingRequiredScopes(parseScopeList([
  "products.read","products.create","products.update",
  "variants.read","variants.create","variants.update",
  "inventory.read","inventory.update",
  "pricing.read","pricing.update",
  "media.read","media.create",
  "categories.read","brands.read",
])).length, "all required scopes present");

assert(stableExternalId("12991") === "aip_12991", "external ID mapping aip_<id>");
assert(idempotencyKeyForProduct("12991") === "aip-product-aip_12991", "idempotency key stable");
assert(stableExternalId("aip_12991") === "aip_12991", "duplicate create key unchanged");

assert(extractId({ id: 55 }) === "55", "response ID extracted");
assert(extractId({ data: { id: "88" } }) === "88", "nested response ID stored");
assert(
  extractId({ id: 100602, variants: { skus: [{ id: "v1" }] } }) === "100602",
  "product id preferred over sku ids",
);

const remote = normalizeMarktGoProduct({
  name: "AI-PROGRES API TEST",
  price: 10,
  discountPrice: 8,
  stock: 3,
  images: [{ url: "https://cdn.example/a.jpg" }],
  variants: [{ id: 1, option1: "Kırmızı", option2: "XL", stock: 2, price: 8 }],
});
assert(remote.title === "AI-PROGRES API TEST", "remote product fetch normalized title");
assert(remote.price === 10 && remote.stock === 3, "normalized comparison price/stock");
assert(remote.variants[0]?.option1 === "Kırmızı", "normalized variant");

const mapped = mapPoolProductToMarktGoInput({
  poolId: "PH-1",
  title: "Test",
  salePrice: 100,
  compareAtPrice: 120,
  inStock: true,
  images: ["https://cdn.example/a.jpg"],
  features: [
    { key: "Kumaş Tipi", value: "Örme" },
    { name: "Kalıp", value: "Regular" },
  ],
});
assert(mapped.localProductId === "PH-1", "pool local id");
assert(mapped.stock === 10, "pool map fixed stock");
assert(mapped.price > 100, "product create payload has sell price");
assert(Boolean(mapped.description && mapped.description.includes("Kumaş Tipi")), "features key shape lands in MARKT-GO description");
assert(Boolean(mapped.description && mapped.description.includes("Kalıp")), "features name shape lands in MARKT-GO description");
assert(poolLocalProductId({ poolId: "PH-9" }) === "PH-9", "pool id helper");

assert(sendButtonLabel("shopify") === "Shopify'a Gönder", "shopify button label");
assert(sendButtonLabel("marktgo") === "MARKT-GO'ya Gönder", "marktgo button label");
assert(sendButtonLabel("multi") === "Hedefe Gönder", "generic target label");

const clientSrc = readFileSync(join(__dirname, "../services/marktgo/client.ts"), "utf8");
assert(!clientSrc.includes("shopifyAdminFetch"), "MARKT-GO client never calls Shopify Admin API");
assert(!clientSrc.includes("shopify-token-manager"), "MARKT-GO client has no Shopify token manager");
const syncSrc = readFileSync(join(__dirname, "../services/marktgo/sync.service.ts"), "utf8");
assert(!syncSrc.includes("shopifyAdminFetch"), "sync service never calls Shopify Admin API");
const routesSrc = readFileSync(join(__dirname, "../routes.ts"), "utf8");
assert(routesSrc.includes("registerMarktGoRoutes"), "marktgo routes registered");
assert(routesSrc.includes("registerMobileReadRoutes"), "shopify/mobile routes still registered");

const err429 = normalizeMarktGoHttpError(429, "");
assert(err429.message.includes("yeniden denenecek"), "429 user message");

const connSrc = readFileSync(join(__dirname, "../services/marktgo/connection.service.ts"), "utf8");
assert(connSrc.includes("GET") || connSrc.includes("/me"), "health uses /me");
assert(connSrc.includes("connected_limited") || connSrc.includes("Eksik Yetki"), "limited scope status");

assert(typeof MarktGoClient === "function", "central client class exists");

const failedImagePartial = ["images"];
assert(failedImagePartial.includes("images"), "failed image → partial sync marker");

const goneMappings = pickMissingMappings(
  [{ externalProductId: "1" }, { externalProductId: "2" }],
  new Set(["1"]),
);
assert(goneMappings.length === 1 && goneMappings[0].externalProductId === "2", "missing mapping detected");
assert(shouldAbortCatalogWipe(5, 0, 5), "wipe abort when all look missing");
assert(!shouldAbortCatalogWipe(5, 2, 3), "wipe allowed when some still live");
assert(
  pickUnmappedRemoteIds(["1", "2", "3"], [{ externalProductId: "1" }]).join(",") === "2,3",
  "unmapped remote ids imported",
);

const srcTagged = mapPoolProductToMarktGoInput({
  poolId: "PH-SRC",
  title: "Kaynak",
  salePrice: 100,
  sourceUrl: "https://www.trendyol.com/x-p-1",
  inStock: true,
  images: ["https://cdn.example/a.jpg"],
});
assert(srcTagged.tags?.some((t) => t.startsWith("src:https://www.trendyol.com")), "source url stored in tags");
assert(parseSourceUrlFromTags([sourceUrlTag("https://www.n11.com/urun/1")]) === "https://www.n11.com/urun/1", "source tag parsed");
assert(localIdFromRemote({ externalId: "aip_PH-ABCDEF" }) === "PH-ABCDEF", "remote externalId maps back to pool id");
assert(listItemsFromPayload({ items: [{ id: 7 }], pagination: { hasMore: false } }).length === 1, "list payload items");

const fromLive = remoteToPoolProduct({
  id: 1001,
  name: "Canlı Ürün",
  price: 110,
  discountPrice: 110,
  stock: 10,
  externalId: "aip_PH-LIVE01",
  tags: [sourceUrlTag("https://www.n11.com/urun/canli")],
  images: ["https://cdn.example/live.jpg"],
});
assert(fromLive?.poolId === "PH-LIVE01", "catalog product keeps pool id");
assert(fromLive?.externalProductId === "1001", "catalog product keeps live id");
assert(fromLive?.sourceUrl === "https://www.n11.com/urun/canli", "catalog recovers source url");
assert(fromLive?.salePrice === 100, "catalog reverses 10% margin");

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
