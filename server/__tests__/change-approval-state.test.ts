/**
 * Change approval state machine tests
 * Run: npm run test:shopify-apply
 */
import { canTransition, BULK_ACTION_MAX } from "../services/change-approval.service";

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

console.log("\n=== Change Approval State Tests ===\n");

assert(canTransition("pending", "approved"), "pending → approved");
assert(canTransition("pending", "rejected"), "pending → rejected");
assert(canTransition("manual_review", "approved"), "manual_review → approved");
assert(canTransition("approved", "applying"), "approved → applying");
assert(canTransition("applying", "applied"), "applying → applied");
assert(canTransition("failed", "applying"), "failed → applying (retry path)");
assert(!canTransition("applied", "approved"), "applied cannot re-approve");
assert(!canTransition("rejected", "approved"), "rejected is terminal");
assert(!canTransition("ignored", "approved"), "ignored is terminal");
assert(BULK_ACTION_MAX === 100, "bulk max is 100");

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
