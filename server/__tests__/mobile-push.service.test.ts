/**
 * ORVIAN Monitor mobile push unit tests
 * Run: npx tsx server/__tests__/mobile-push.service.test.ts
 */
import {
  buildPushPayload,
  mapChangeToPushEvent,
  setMobilePushFcmSender,
  dispatchChangePush,
  registerMobilePushDevice,
  unregisterMobilePushDevice,
} from "../services/mobile-push.service";
import type { DetectedChange } from "@shared/schema";

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

function fakeChange(partial: Partial<DetectedChange>): DetectedChange {
  return {
    id: 1,
    trackedProductId: 42,
    trackedVariantId: null,
    changeType: "price_changed",
    fieldName: "price",
    oldValue: 100,
    newValue: 90,
    confidence: "1",
    status: "pending",
    reason: null,
    sourceSnapshotId: null,
    targetSnapshotId: null,
    seenAt: null,
    changeGroupId: null,
    severity: "normal",
    requiresApproval: true,
    applyStatus: null,
    approvedAt: null,
    approvedBy: null,
    rejectedAt: null,
    rejectedBy: null,
    appliedAt: null,
    applyError: null,
    retryCount: 0,
    idempotencyKey: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  };
}

console.log("\n=== Mobile Push Service Tests ===\n");

assert(mapChangeToPushEvent(fakeChange({ changeType: "price_changed" })) === "PRICE_CHANGED", "price_changed → PRICE_CHANGED");
assert(mapChangeToPushEvent(fakeChange({ changeType: "variant_price_changed" })) === "PRICE_CHANGED", "variant_price_changed → PRICE_CHANGED");
assert(mapChangeToPushEvent(fakeChange({ changeType: "title_changed" })) === "TITLE_CHANGED", "title_changed → TITLE_CHANGED");
assert(
  mapChangeToPushEvent(
    fakeChange({
      changeType: "stock_changed",
      oldValue: { stock: 5 },
      newValue: { stock: 0 },
    }),
  ) === "OUT_OF_STOCK",
  "stock 5→0 → OUT_OF_STOCK",
);
assert(
  mapChangeToPushEvent(
    fakeChange({
      changeType: "variant_stock_changed",
      oldValue: { available: false },
      newValue: { available: true },
    }),
  ) === "BACK_IN_STOCK",
  "available false→true → BACK_IN_STOCK",
);
assert(
  mapChangeToPushEvent(fakeChange({ changeType: "variant_stock_changed", oldValue: 3, newValue: 2 })) ===
    "STOCK_CHANGED",
  "stock 3→2 → STOCK_CHANGED",
);

const payload = buildPushPayload(fakeChange({}), "Nike Air Max");
assert(payload.title === "Fiyat değişti", "push title Fiyat değişti");
assert(payload.body.includes("Nike Air Max"), "push body includes product title");
assert(payload.body.includes("100") && payload.body.includes("90"), "push body old→new");
assert(payload.data.type === "PRICE_CHANGED", "payload data.type");
assert(payload.data.productId === "42", "payload data.productId");
assert(payload.data.changeId === "1", "payload data.changeId");

// Dispatch isolation: FCM throw must not reject
setMobilePushFcmSender(async () => {
  throw new Error("simulated FCM down");
});
let threw = false;
try {
  await dispatchChangePush(fakeChange({ id: 999 }));
} catch {
  threw = true;
}
assert(!threw, "dispatchChangePush does not throw when FCM fails");

setMobilePushFcmSender(async () => ({ ok: false, invalidToken: true, error: "bad token" }));
threw = false;
try {
  await dispatchChangePush(fakeChange({ id: 998 }));
} catch {
  threw = true;
}
assert(!threw, "invalid token path does not throw");

// Register validation (no DB required for empty fields)
let regErr = false;
try {
  await registerMobilePushDevice({ deviceId: "", pushToken: "" });
} catch {
  regErr = true;
}
assert(regErr, "register rejects empty deviceId/token");

let unregErr = false;
try {
  await unregisterMobilePushDevice({});
} catch {
  unregErr = true;
}
assert(unregErr, "unregister requires deviceId or pushToken");

setMobilePushFcmSender(null);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
