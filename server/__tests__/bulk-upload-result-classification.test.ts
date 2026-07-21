import { classifyUploadHttpResult } from "../bulk-upload-validator";
import {
  applyTagsToShopifyCsv,
  parseShopifyCsvRow,
} from "../../shared/shopify-csv-tags";

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

{
  const csv = [
    "Handle,Title,Tags,Description",
    'urun,Ürün,"eski, yaz","Açıklama ""alıntı"", devam"',
    "urun,,,",
  ].join("\n");
  const once = applyTagsToShopifyCsv(csv, ["yeni", '"tırnaksız"']);
  const twice = applyTagsToShopifyCsv(once, ["yeni", '"tırnaksız"']);
  const firstProductRow = parseShopifyCsvRow(twice.split("\n")[1]!);

  assert(
    firstProductRow[2] === "eski, yaz, yeni, tırnaksız",
    "bulk tags are decoded, sanitized and merged once",
  );
  assert(
    !firstProductRow[2]?.includes('"'),
    "bulk tags do not contain automatic quote characters",
  );
  assert(
    parseShopifyCsvRow(twice.split("\n")[2]!)[2] === "",
    "tags are only written to the product row",
  );
}

console.log(`\n=== Sonuç: ${passed} geçti, ${failed} başarısız ===\n`);
if (failed > 0) process.exit(1);
