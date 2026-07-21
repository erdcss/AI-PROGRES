import {
  classifyShopifyNode,
  isCompleteShopifyNodeBatch,
  normalizeShopifyProductIdentity,
} from "../services/shopify-tracking-reconciliation.service";
import { isShopifyTrackingReconcileDue } from "../services/tracking.scheduler";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

console.log("\n=== Shopify Tracking Reconciliation ===\n");

{
  const result = normalizeShopifyProductIdentity({
    shopifyProductId: "90071992547409931234",
  });
  assert(
    result.ok && result.gid === "gid://shopify/Product/90071992547409931234",
    "large Shopify IDs stay as lossless strings",
  );
}

{
  const result = normalizeShopifyProductIdentity({
    shopifyProductGid: "gid://shopify/Product/12345",
  });
  assert(result.ok && result.productId === "12345", "numeric ID is derived from Product GID");
}

{
  const result = normalizeShopifyProductIdentity({
    shopifyProductId: "123",
    shopifyProductGid: "gid://shopify/Product/456",
  });
  assert(result.ok === false, "conflicting numeric ID and GID are rejected");
}

{
  const result = normalizeShopifyProductIdentity({
    shopifyProductGid: "gid://shopify/ProductVariant/123",
  });
  assert(result.ok === false, "non-Product GID is rejected");
}

{
  const expected = { productId: "123", gid: "gid://shopify/Product/123" };
  assert(
    classifyShopifyNode(expected, {
      __typename: "Product",
      id: expected.gid,
      legacyResourceId: "123",
    }).state === "live",
    "matching Shopify node is live",
  );
  assert(classifyShopifyNode(expected, null).state === "missing", "only explicit null is missing");
  assert(
    classifyShopifyNode(expected, undefined).state === "identity_conflict",
    "absent batch entry is not classified as missing",
  );
  assert(
    classifyShopifyNode(expected, {
      __typename: "Product",
      id: "gid://shopify/Product/456",
      legacyResourceId: "456",
    }).state === "identity_conflict",
    "mismatched node identity is not archived",
  );
}

{
  assert(
    isCompleteShopifyNodeBatch({
      responseOk: true,
      nodes: [null, null],
      expectedCount: 2,
    }),
    "complete explicit-null batch can classify missing products",
  );
  assert(
    !isCompleteShopifyNodeBatch({
      responseOk: true,
      nodes: [null],
      expectedCount: 2,
    }),
    "partial GraphQL batch fails closed",
  );
  assert(
    !isCompleteShopifyNodeBatch({
      responseOk: true,
      errors: [{ message: "throttled" }],
      nodes: [null],
      expectedCount: 1,
    }),
    "GraphQL errors fail closed even with node data",
  );
}

{
  const now = Date.now();
  assert(
    !isShopifyTrackingReconcileDue(
      { status: "success", created_at: new Date(now - 59 * 60_000) },
      now,
    ),
    "successful reconciliation is not due before one hour",
  );
  assert(
    isShopifyTrackingReconcileDue(
      { status: "success", created_at: new Date(now - 61 * 60_000) },
      now,
    ),
    "successful reconciliation is due after one hour",
  );
  assert(
    isShopifyTrackingReconcileDue(
      { status: "error", created_at: new Date(now - 60_000) },
      now,
    ),
    "failed reconciliation remains due for scheduler retry",
  );
}

console.log(`\n=== Sonuç: ${passed} geçti, ${failed} başarısız ===\n`);
if (failed > 0) process.exit(1);
