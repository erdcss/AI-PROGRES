/**
 * Control center unit tests
 * Run: npm run test:control-center
 */
import { CONTROL_CENTER_TABLES } from "../migrations/run-control-center-migration";
import { IMPORT_JOB_STATUSES } from "@shared/import-job-types";
import { canTransition } from "../services/change-approval.service";

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

console.log("\n=== Control Center Tests ===\n");

assert(CONTROL_CENTER_TABLES.includes("import_jobs"), "import_jobs table defined");
assert(CONTROL_CENTER_TABLES.includes("audit_logs"), "audit_logs table defined");
assert(IMPORT_JOB_STATUSES.includes("awaiting_approval"), "awaiting_approval status");
assert(IMPORT_JOB_STATUSES.includes("completed_with_warning"), "completed_with_warning status");
assert(canTransition("pending", "approved"), "change state machine pending→approved");

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
