#!/usr/bin/env node
/**
 * Canlı Trendyol renk ailesi debug.
 * Kullanım: npm run debug:color-family -- "PRODUCT_URL"
 */
import "dotenv/config";

const url = process.argv[2]?.trim();
if (!url || !url.includes("trendyol.com")) {
  console.error('Kullanım: npm run debug:color-family -- "https://www.trendyol.com/..."');
  process.exit(1);
}

const endpoint = (process.env.BROWSER_WORKER_URL || process.env.BROWSER_WORKER_ENDPOINT || "")
  .replace(/\/$/, "");
const token = process.env.BROWSER_WORKER_TOKEN?.trim();

if (!endpoint || !token) {
  console.error("BROWSER_WORKER_URL/ENDPOINT ve BROWSER_WORKER_TOKEN gerekli");
  process.exit(1);
}

function log(stage, payload) {
  const extra =
    typeof payload === "string"
      ? payload
      : payload == null
        ? ""
        : JSON.stringify(payload);
  console.log(`[ColorFamilyDebug] ${stage}${extra ? " " + extra : ""}`);
}

async function main() {
  log("root", url);

  const res = await fetch(`${endpoint}/scrape/trendyol`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      url,
      includeColorFamily: true,
      includeSiblingHtml: false,
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.ok) {
    console.error("Browser Worker hata:", data.error || res.statusText);
    process.exit(1);
  }

  const candidates = data.colorSiblingCandidates || [];
  log("candidates", candidates.map((c) => `${c.productId}:${c.color || "?"}`).join(", "));

  const members = data.colorFamilyMembers || [];
  const rows = [];

  for (const m of members) {
    const snap = m.hydratedSnapshot || {};
    const sizes = (snap.sizes || []).map((s) => s.name || s).filter(Boolean);
    const images = m.images || snap.images || [];
    const variants = snap.variants || m.variants?.allVariants || [];
    const status = !m.ok
      ? "failed"
      : images.length === 0 || sizes.length === 0
        ? "partial"
        : "ok";

    log("member.start", m.productId);
    log("member.navigation", m.finalUrl || m.url);
    log("member.productId", {
      requested: snap.requestedProductId,
      resolved: snap.resolvedProductId || m.productId,
      matched: snap.diagnostics?.productIdMatched,
    });
    log("member.color", `${snap.displayColor || m.color} → ${m.color}`);
    log("member.images", {
      count: images.length,
      samples: images.slice(0, 2),
      winner: snap.diagnostics?.imageSourceWinner,
    });
    log("member.sizes", sizes.join(",") || "(none)");
    log("member.variants", variants.length);
    if (snap.diagnostics?.warnings?.length) {
      log("member.warnings", snap.diagnostics.warnings.join(","));
    }

    rows.push({
      color: m.color || "?",
      productId: m.productId,
      images: images.length,
      sizes: sizes.length || (m.variants?.sizes?.length ?? 0),
      variants: variants.length,
      hydrated: Boolean(snap.diagnostics?.hydrationCompleted),
      status,
    });
  }

  log("final", `members=${members.length}`);

  console.log("\ncolor | productId | images | sizes | variants | hydrated | status");
  console.log("-".repeat(72));
  for (const r of rows) {
    console.log(
      `${r.color} | ${r.productId} | ${r.images} | ${r.sizes} | ${r.variants} | ${r.hydrated} | ${r.status}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
