import { classifyUploadHttpResult } from "../bulk-upload-validator";

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

console.log("\n=== Bulk Upload Result Classification ===\n");

{
  const r = classifyUploadHttpResult(200, { success: true });
  assert(r.status === "success" && r.success, "200 success");
}

{
  const r = classifyUploadHttpResult(422, { success: false, error: "invalid" });
  assert(r.status === "failed" && !r.success, "422 failed");
}

{
  const r = classifyUploadHttpResult(409, { success: false, errorCode: "job_locked", error: "locked" });
  assert(r.status === "failed", "409 job_locked failed");
}

{
  const r = classifyUploadHttpResult(409, { success: true, errorCode: "duplicate_product" });
  assert(r.status === "already_exists" && r.success, "409 duplicate_product already_exists");
}

{
  const r = classifyUploadHttpResult(408, { success: false, errorCode: "timeout" });
  assert(r.status === "unknown", "timeout unknown");
}

console.log(`\n=== Sonuç: ${passed} geçti, ${failed} başarısız ===\n`);
if (failed > 0) process.exit(1);
