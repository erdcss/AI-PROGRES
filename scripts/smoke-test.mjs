const base = process.env.SMOKE_BASE_URL || "http://127.0.0.1:5000";

const checks = [
  { name: "Ana sayfa", path: "/", expectStatus: [200, 304] },
  { name: "Health", path: "/api/health", expectStatus: [200] },
  { name: "URL geçmişi (legacy)", path: "/api/history", expectStatus: [200, 304] },
  { name: "Shopify CSV durumu", path: "/api/shopify/csv-status", expectStatus: [200, 404] },
];

async function runCheck(check) {
  const url = `${base}${check.path}`;
  const response = await fetch(url, { redirect: "manual" });
  const ok = check.expectStatus.includes(response.status);
  let body = "";
  try {
    const text = await response.text();
    body = text.slice(0, 120);
  } catch {
    body = "";
  }
  return { ...check, url, status: response.status, ok, body };
}

async function main() {
  console.log(`\n🧪 Smoke test — ${base}\n`);

  const results = [];
  for (const check of checks) {
    try {
      results.push(await runCheck(check));
    } catch (error) {
      results.push({
        ...check,
        url: `${base}${check.path}`,
        status: 0,
        ok: false,
        body: error instanceof Error ? error.message : String(error),
      });
    }
  }

  let failed = 0;
  for (const result of results) {
    const icon = result.ok ? "✅" : "❌";
    console.log(`${icon} ${result.name} — ${result.status} ${result.path}`);
    if (!result.ok) {
      failed += 1;
      if (result.body) console.log(`   ${result.body}`);
    }
  }

  console.log("");
  if (failed > 0) {
    console.log(`❌ ${failed}/${results.length} test başarısız`);
    process.exit(1);
  }

  console.log(`✅ ${results.length}/${results.length} test geçti`);
}

main();
