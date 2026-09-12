import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const routesPath = path.join(root, "server/routes.ts");
let src = fs.readFileSync(routesPath, "utf8");

// Keep source URL on Trendyol jobs so another client (mobile) can identify the same live scrape.
if (!src.includes("sourceUrl?: string;\n    code?: string;")) {
  src = src.replace(
    "    startedAt: number;\n    code?: string;",
    "    startedAt: number;\n    sourceUrl?: string;\n    code?: string;",
  );
}

src = src.replaceAll(
  "scrapeJobs.set(jobId, { status: 'processing' as const, startedAt: Date.now() });",
  "scrapeJobs.set(jobId, { status: 'processing' as const, startedAt: Date.now(), sourceUrl: url });",
);

// Public-to-app read-only view. It exposes no secrets; just current job state and product metadata.
const anchor = "  // Job status polling endpoint\n  app.get('/api/scrape-job/:jobId', (req, res) => {";
if (src.includes(anchor) && !src.includes("/api/mobile/scrape-jobs/live")) {
  const block = `  // Mobile app: web + mobile Trendyol çekimlerini aynı canlı listede izle.\n  app.get('/api/mobile/scrape-jobs/live', (_req, res) => {\n    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');\n    const now = Date.now();\n    const jobs = [...scrapeJobs.entries()]\n      .filter(([id, job]) => !id.startsWith('pttavm-') && (job.sourceUrl || '').includes('trendyol.com'))\n      .sort((a, b) => b[1].startedAt - a[1].startedAt)\n      .slice(0, 20)\n      .map(([jobId, job]) => {\n        const result = job.result && typeof job.result === 'object' ? job.result : {};\n        const status = job.status === 'done'\n          ? (result.success === false && result.partialSuccess !== true ? 'error' : 'success')\n          : job.status;\n        const elapsedMs = Math.max(0, now - job.startedAt);\n        const progress = status === 'success' ? 100 : status === 'error' ? 100 : Math.min(92, Math.max(8, Math.round(8 + elapsedMs / 1400)));\n        return {\n          jobId,\n          status,\n          progress,\n          startedAt: new Date(job.startedAt).toISOString(),\n          elapsedMs,\n          sourceUrl: job.sourceUrl || '',\n          title: String(result.title || result.productTitle || ''),\n          image: Array.isArray(result.images) ? String(result.images[0] || '') : '',\n          error: status === 'error' ? String(job.userMessage || job.error || result.message || result.error || '') : '',\n        };\n      });\n    return res.json({ success: true, serverTime: new Date(now).toISOString(), jobs });\n  });\n\n`;
  src = src.replace(anchor, block + anchor);
}

if (!src.includes("/api/mobile/scrape-jobs/live")) {
  throw new Error("[mobile-live-scrape] live jobs endpoint eklenemedi");
}
fs.writeFileSync(routesPath, src);
console.log("[mobile-live-scrape] Trendyol scrape jobs are visible to mobile in realtime");
