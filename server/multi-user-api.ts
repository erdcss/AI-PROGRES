import { Router, type Request, type Response, type NextFunction } from "express";
import { pool } from "./db";
import { ensureMultiUserSchema } from "./multi-user-schema";
import { ensureBootstrapAdmin, registerMultiUserAuthRoutes, requireAppAuth } from "./multi-user-auth";
import { getTenantWorkerStatus, startTenantScrapeWorker } from "./services/tenant-scrape-worker.service";

const router = Router();

const ipBuckets = new Map<string, { count: number; resetAt: number }>();
function authRateLimit(req: Request, res: Response, next: NextFunction) {
  if (!req.path.startsWith("/auth/")) return next();
  const key = String(req.ip || req.socket.remoteAddress || "unknown");
  const now = Date.now();
  const current = ipBuckets.get(key);
  if (!current || current.resetAt <= now) {
    ipBuckets.set(key, { count: 1, resetAt: now + 60_000 });
    return next();
  }
  current.count += 1;
  if (current.count > 20) {
    res.setHeader("Retry-After", String(Math.ceil((current.resetAt - now) / 1000)));
    return res.status(429).json({ success: false, message: "Çok fazla giriş denemesi. Kısa süre sonra tekrar deneyin." });
  }
  return next();
}

router.use(async (_req, res, next) => {
  try {
    const ready = await ensureMultiUserSchema();
    if (!ready) return res.status(503).json({ success: false, message: "Çok kullanıcılı sistem için DATABASE_URL gerekli" });
    return next();
  } catch {
    return res.status(503).json({ success: false, message: "Çok kullanıcılı veritabanı hazırlanamadı" });
  }
});
router.use(authRateLimit);

registerMultiUserAuthRoutes(router as any);

function validateTrendyolUrl(input: unknown): string | null {
  try {
    const url = new URL(String(input || "").trim());
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:") return null;
    if (host !== "www.trendyol.com" && host !== "trendyol.com") return null;
    if (!/\/[^/?#]+\/[^/?#]+-p-\d+/i.test(url.pathname)) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

async function audit(req: Request, action: string, entityId?: string, metadata?: unknown) {
  if (!pool || !req.appAuth) return;
  await pool.query(
    `INSERT INTO tenant_audit_logs(workspace_id,user_id,action,entity_type,entity_id,request_id,metadata)
     VALUES ($1,$2,$3,'tenant_scrape_job',$4,$5,$6::jsonb)`,
    [
      req.appAuth.workspaceId,
      req.appAuth.userId,
      action,
      entityId || null,
      String((req as any).requestId || req.headers["x-request-id"] || "") || null,
      JSON.stringify(metadata ?? {}),
    ],
  );
}

router.get("/workspace/summary", requireAppAuth, async (req, res) => {
  const auth = req.appAuth!;
  const counts = await pool!.query(
    `SELECT status, COUNT(*)::int AS count FROM tenant_scrape_jobs WHERE workspace_id=$1 GROUP BY status`,
    [auth.workspaceId],
  );
  const workspace = await pool!.query("SELECT id,name,created_at FROM workspaces WHERE id=$1", [auth.workspaceId]);
  const byStatus = Object.fromEntries(counts.rows.map((row) => [row.status, Number(row.count)]));
  return res.json({
    success: true,
    workspace: workspace.rows[0] || null,
    jobs: {
      queued: byStatus.queued || 0,
      processing: byStatus.processing || 0,
      completed: byStatus.completed || 0,
      failed: byStatus.failed || 0,
    },
    worker: getTenantWorkerStatus(),
  });
});

router.get("/workspace/jobs", requireAppAuth, async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
  const result = await pool!.query(
    `SELECT id,source,source_url,status,attempts,max_attempts,result,error,created_at,updated_at,started_at,finished_at
       FROM tenant_scrape_jobs WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT $2`,
    [req.appAuth!.workspaceId, limit],
  );
  return res.json({ success: true, jobs: result.rows });
});

router.get("/workspace/jobs/:id", requireAppAuth, async (req, res) => {
  const result = await pool!.query(
    `SELECT id,source,source_url,status,attempts,max_attempts,result,error,created_at,updated_at,started_at,finished_at
       FROM tenant_scrape_jobs WHERE id=$1 AND workspace_id=$2 LIMIT 1`,
    [req.params.id, req.appAuth!.workspaceId],
  );
  if (!result.rows[0]) return res.status(404).json({ success: false, message: "Görev bulunamadı" });
  return res.json({ success: true, job: result.rows[0] });
});

router.post("/workspace/scrape", requireAppAuth, async (req, res) => {
  const url = validateTrendyolUrl(req.body?.url);
  if (!url) return res.status(400).json({ success: false, message: "Geçerli Trendyol ürün URL'si gerekli" });
  const activeCount = await pool!.query(
    `SELECT COUNT(*)::int AS count FROM tenant_scrape_jobs WHERE workspace_id=$1 AND status IN ('queued','processing')`,
    [req.appAuth!.workspaceId],
  );
  if (Number(activeCount.rows[0]?.count || 0) >= 200) {
    return res.status(429).json({ success: false, message: "Çalışma alanında çok fazla bekleyen görev var" });
  }
  const result = await pool!.query(
    `INSERT INTO tenant_scrape_jobs(workspace_id,user_id,source,source_url)
     VALUES ($1,$2,'trendyol',$3) RETURNING id,status,source_url,created_at`,
    [req.appAuth!.workspaceId, req.appAuth!.userId, url],
  );
  const job = result.rows[0];
  await audit(req, "scrape.queued", job.id, { sourceUrl: url });
  return res.status(202).json({ success: true, job });
});

router.post("/workspace/scrape-bulk", requireAppAuth, async (req, res) => {
  const rawUrls = Array.isArray(req.body?.urls) ? req.body.urls : [];
  if (rawUrls.length < 1 || rawUrls.length > 100) {
    return res.status(400).json({ success: false, message: "Tek istekte 1-100 URL gönderilebilir" });
  }
  const urls = [...new Set(rawUrls.map(validateTrendyolUrl).filter((url): url is string => Boolean(url)))];
  if (!urls.length) return res.status(400).json({ success: false, message: "Geçerli Trendyol ürün URL'si bulunamadı" });
  const activeCount = await pool!.query(
    `SELECT COUNT(*)::int AS count FROM tenant_scrape_jobs WHERE workspace_id=$1 AND status IN ('queued','processing')`,
    [req.appAuth!.workspaceId],
  );
  if (Number(activeCount.rows[0]?.count || 0) + urls.length > 200) {
    return res.status(429).json({ success: false, message: "Çalışma alanı kuyruk limiti 200 görevdir" });
  }
  const client = await pool!.connect();
  try {
    await client.query("BEGIN");
    const jobs: any[] = [];
    for (const url of urls) {
      const inserted = await client.query(
        `INSERT INTO tenant_scrape_jobs(workspace_id,user_id,source,source_url)
         VALUES ($1,$2,'trendyol',$3) RETURNING id,status,source_url,created_at`,
        [req.appAuth!.workspaceId, req.appAuth!.userId, url],
      );
      jobs.push(inserted.rows[0]);
    }
    await client.query("COMMIT");
    await audit(req, "scrape.bulk_queued", undefined, { count: jobs.length });
    return res.status(202).json({ success: true, accepted: jobs.length, rejected: rawUrls.length - urls.length, jobs });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
});

router.post("/workspace/jobs/:id/retry", requireAppAuth, async (req, res) => {
  const result = await pool!.query(
    `UPDATE tenant_scrape_jobs
        SET status='queued', attempts=0, error=NULL, result=NULL, available_at=NOW(), started_at=NULL, finished_at=NULL, updated_at=NOW()
      WHERE id=$1 AND workspace_id=$2 AND status='failed'
      RETURNING id,status,source_url,created_at`,
    [req.params.id, req.appAuth!.workspaceId],
  );
  if (!result.rows[0]) return res.status(409).json({ success: false, message: "Yalnızca başarısız kendi göreviniz tekrar denenebilir" });
  await audit(req, "scrape.retried", req.params.id);
  return res.json({ success: true, job: result.rows[0] });
});

router.delete("/workspace/jobs/:id", requireAppAuth, async (req, res) => {
  const result = await pool!.query(
    `DELETE FROM tenant_scrape_jobs WHERE id=$1 AND workspace_id=$2 AND status IN ('completed','failed') RETURNING id`,
    [req.params.id, req.appAuth!.workspaceId],
  );
  if (!result.rows[0]) return res.status(409).json({ success: false, message: "Aktif görev silinemez veya görev bulunamadı" });
  await audit(req, "scrape.deleted", req.params.id);
  return res.status(204).end();
});

router.get("/workspace/audit", requireAppAuth, async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
  const result = await pool!.query(
    `SELECT id,action,entity_type,entity_id,metadata,created_at
       FROM tenant_audit_logs WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT $2`,
    [req.appAuth!.workspaceId, limit],
  );
  return res.json({ success: true, logs: result.rows });
});

void ensureMultiUserSchema()
  .then(async (ready) => {
    if (!ready) return;
    await ensureBootstrapAdmin();
    await startTenantScrapeWorker();
  })
  .catch((error) => console.error("[multi-user] başlangıç hatası", error));

export { router as multiUserApiRouter };
