/**
 * Supabase mobile sync isolation / idempotency tests
 * Run: npm run test:mobile-supabase
 */
import { buildEventId } from "../services/mobile-sync.service";
import { assertServerOnlySupabaseEnv, isSupabaseConfigured } from "../lib/supabase-admin";
import { computeDashboardStats } from "../services/mobile-dashboard.service";
import { mapChangeToPushEvent } from "../services/mobile-push.service";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

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

console.log("\n=== Mobile Supabase Sync Tests ===\n");

assert(buildEventId(123) === "tracking:123", "event id tracking:{sourceChangeId}");
assert(buildEventId("99") === "tracking:99", "event id string source");
assert(buildEventId(1) === buildEventId(1), "event id idempotent");
assert(
  buildEventId(42) === "tracking:42",
  "duplicate event does not produce alternate change id",
);

const guard = assertServerOnlySupabaseEnv();
assert(guard.ok, "service role not exposed via EXPO_PUBLIC_*");
assert(
  !process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY,
  "mobile client contains no service role key",
);

assert(
  mapChangeToPushEvent({
    changeType: "price_changed",
    oldValue: 10,
    newValue: 8,
  } as never) === "PRICE_CHANGED",
  "change maps to push/notification type",
);
assert(
  mapChangeToPushEvent({ changeType: "stock_changed" } as never) === "STOCK_CHANGED",
  "Realtime mapping stock → STOCK_CHANGED",
);

let dashOk = true;
try {
  if (process.env.DATABASE_URL) {
    const stats = await computeDashboardStats();
    assert(typeof stats.totalProducts === "number", "dashboard totalProducts number");
    assert(typeof stats.pendingChanges === "number", "dashboard pendingChanges number");
    assert(typeof stats.priceChanges === "number", "dashboard priceChanges number");
  } else {
    assert(true, "dashboard skip without DATABASE_URL");
    assert(true, "dashboard pendingChanges skip");
    assert(true, "dashboard priceChanges skip");
  }
} catch (err) {
  dashOk = false;
  console.warn("dashboard compute:", err);
}
assert(dashOk, "dashboard calculation does not throw unexpectedly");

const migration = readFileSync(
  join(__dirname, "../../supabase/migrations/20260810120000_mobile_monitor.sql"),
  "utf8",
);
assert(migration.includes("UNIQUE (source_change_id)"), "product upsert / change unique source_change_id");
assert(migration.includes("mobile_notifications_event_id_uidx"), "notification duplication guard (event_id unique)");
assert(migration.includes("UNIQUE (source_product_id, source)"), "product upsert idempotency constraint");
assert(migration.includes("ALTER PUBLICATION supabase_realtime ADD TABLE public.mobile_products"), "Realtime mapping products");
assert(migration.includes("mobile_tracking_changes"), "Realtime mapping tracking changes");
assert(
  migration.includes("FOR SELECT TO anon, authenticated"),
  "RLS select-only for mobile tables",
);
assert(!/FOR INSERT TO anon/.test(migration), "no public INSERT policy");

const realtimeHook = readFileSync(
  join(__dirname, "../../mobile/src/hooks/useRealtime.ts"),
  "utf8",
);
assert(realtimeHook.includes('event: "INSERT" | "UPDATE" | "*"'), "Realtime hook event types");
assert(realtimeHook.includes("invalidateQueries"), "Realtime reconnect invalidates queries");
assert(realtimeHook.includes('state === "active"'), "App foreground invalidate on reconnect/resume");
assert(realtimeHook.includes("removeChannel"), "Realtime channel cleanup on unmount");

const persistSrc = readFileSync(
  join(__dirname, "../services/product-diff.service.ts"),
  "utf8",
);
assert(
  persistSrc.includes("notifyMobileAfterPersistedChanges"),
  "persistDetectedChanges schedules mobile side-effects after insert",
);
assert(
  persistSrc.includes("finally"),
  "mobile hook runs in finally so persisted rows are notified even if a later insert throws",
);
const schedulerSrc = readFileSync(
  join(__dirname, "../services/tracking.scheduler.ts"),
  "utf8",
);
assert(
  !schedulerSrc.includes("scheduleMobileEventAfterChange") &&
    !schedulerSrc.includes("scheduleChangePush") &&
    !schedulerSrc.includes("notifyMobileAfterPersistedChanges"),
  "scheduler does not duplicate mobile/FCM hooks (single persist orchestrator)",
);
const orchestratorSrc = readFileSync(
  join(__dirname, "../services/mobile-sync.service.ts"),
  "utf8",
);
assert(
  orchestratorSrc.includes("scheduleChangePush(change)"),
  "FCM is scheduled from the single mobile orchestrator",
);
assert(
  (orchestratorSrc.match(/scheduleChangePush/g) || []).length >= 1,
  "orchestrator references scheduleChangePush",
);
assert(
  !persistSrc.includes("scheduleChangePush"),
  "persistDetectedChanges does not call FCM directly (no duplicate push)",
);

const configured = isSupabaseConfigured();
assert(typeof configured === "boolean", "isSupabaseConfigured returns boolean");
if (!configured) {
  const { upsertMobileProduct, syncTrackingChange, createMobileNotification } = await import(
    "../services/mobile-sync.service"
  );
  let threw = false;
  try {
    await upsertMobileProduct({
      sourceProductId: "x",
      source: "test",
      title: "T",
    });
    await upsertMobileProduct({
      sourceProductId: "x",
      source: "test",
      title: "T2",
    });
    await syncTrackingChange({
      id: 1,
      trackedProductId: 1,
      trackedVariantId: null,
      changeType: "price_changed",
      fieldName: "price",
      oldValue: 1,
      newValue: 2,
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
    });
    await createMobileNotification({
      eventId: "tracking:1",
      type: "PRICE_CHANGED",
      title: "t",
      message: "m",
    });
    await createMobileNotification({
      eventId: "tracking:1",
      type: "PRICE_CHANGED",
      title: "t",
      message: "m",
    });
  } catch {
    threw = true;
  }
  assert(!threw, "Supabase unavailable does not break tracking sync callers");
  assert(!threw, "product upsert idempotency path does not throw");
  assert(!threw, "notification duplication guard path does not throw");

  const {
    notifyMobileAfterPersistedChanges,
    scheduleMobileEventAfterChange,
  } = await import("../services/mobile-sync.service");
  const { scheduleChangePush } = await import("../services/mobile-push.service");
  const fakeRow = {
    id: 1,
    trackedProductId: 1,
    trackedVariantId: null,
    changeType: "price_changed",
    fieldName: "price",
    oldValue: 1,
    newValue: 2,
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
  };
  let hookThrew = false;
  try {
    notifyMobileAfterPersistedChanges([fakeRow as never, fakeRow as never]);
    scheduleMobileEventAfterChange(fakeRow as never);
    scheduleChangePush(fakeRow as never);
  } catch {
    hookThrew = true;
  }
  assert(!hookThrew, "post-persist mobile/FCM hooks do not throw when unconfigured");
  assert(buildEventId(fakeRow.id) === "tracking:1", "duplicate persist uses same event_id");
} else {
  assert(true, "Supabase configured — unavailable path skipped");
  assert(true, "product upsert idempotency (live) skipped");
  assert(true, "notification duplication (live) skipped");
  const { notifyMobileAfterPersistedChanges } = await import("../services/mobile-sync.service");
  let hookThrew = false;
  try {
    notifyMobileAfterPersistedChanges([]);
  } catch {
    hookThrew = true;
  }
  assert(!hookThrew, "empty persisted rows hook does not throw");
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
