import { pool } from "../db";
import { ensureMultiUserSchema } from "../multi-user-schema";

let started = false;
let active = 0;
let timer: NodeJS.Timeout | null = null;

const concurrency = Math.min(6, Math.max(1, Number(process.env.TENANT_SCRAPE_CONCURRENCY || 2)));
const pollMs = Math.min(10_000, Math.max(500, Number(process.env.TENANT_SCRAPE_POLL_MS || 1500)));

async function claimOne() {
  if (!pool) return null;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT id, workspace_id, user_id, source_url, attempts, max_attempts
         FROM tenant_scrape_jobs
        WHERE status='queued' AND available_at<=NOW()
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1`,
    );
    const job = result.rows[0];
    if (!job) {
      await client.query("COMMIT");
      return null;
    }
    await client.query(
      `UPDATE tenant_scrape_jobs
          SET status='processing', attempts=attempts+1, started_at=COALESCE(started_at,NOW()), updated_at=NOW(), error=NULL
        WHERE id=$1`,
      [job.id],
    );
    await client.query("COMMIT");
    return { ...job, attempts: Number(job.attempts) + 1 };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function runJob(job: any) {
  if (!pool) return;
  try {
    const { scenarioBasedScrape } = await import("../scenario-based-scraper");
    const result = await scenarioBasedScrape(job.source_url);
    await pool.query(
      `UPDATE tenant_scrape_jobs
          SET status='completed', result=$2::jsonb, error=NULL, finished_at=NOW(), updated_at=NOW()
        WHERE id=$1`,
      [job.id, JSON.stringify(result ?? null)],
    );
    await pool.query(
      `INSERT INTO tenant_audit_logs(workspace_id,user_id,action,entity_type,entity_id,metadata)
       VALUES ($1,$2,'scrape.completed','tenant_scrape_job',$3,$4::jsonb)`,
      [job.workspace_id, job.user_id, job.id, JSON.stringify({ sourceUrl: job.source_url })],
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const retry = Number(job.attempts) < Number(job.max_attempts);
    const delaySeconds = Math.min(300, 10 * Math.pow(2, Math.max(0, Number(job.attempts) - 1)));
    await pool.query(
      retry
        ? `UPDATE tenant_scrape_jobs SET status='queued', error=$2, available_at=NOW()+($3 || ' seconds')::interval, updated_at=NOW() WHERE id=$1`
        : `UPDATE tenant_scrape_jobs SET status='failed', error=$2, finished_at=NOW(), updated_at=NOW() WHERE id=$1`,
      retry ? [job.id, message.slice(0, 2000), String(delaySeconds)] : [job.id, message.slice(0, 2000)],
    );
    if (!retry) {
      await pool.query(
        `INSERT INTO tenant_audit_logs(workspace_id,user_id,action,entity_type,entity_id,metadata)
         VALUES ($1,$2,'scrape.failed','tenant_scrape_job',$3,$4::jsonb)`,
        [job.workspace_id, job.user_id, job.id, JSON.stringify({ sourceUrl: job.source_url, error: message.slice(0, 500) })],
      );
    }
  }
}

async function tick() {
  if (!pool || active >= concurrency) return;
  while (active < concurrency) {
    const job = await claimOne().catch((error) => {
      console.error("[tenant-worker] claim hatası", error);
      return null;
    });
    if (!job) break;
    active += 1;
    void runJob(job).finally(() => {
      active -= 1;
      void tick();
    });
  }
}

export async function startTenantScrapeWorker() {
  if (started || process.env.TENANT_SCRAPE_WORKER_ENABLED === "false") return;
  started = true;
  const ready = await ensureMultiUserSchema().catch(() => false);
  if (!ready) {
    started = false;
    return;
  }
  timer = setInterval(() => void tick(), pollMs);
  timer.unref?.();
  void tick();
  console.log(`[tenant-worker] başladı concurrency=${concurrency} pollMs=${pollMs}`);
}

export function getTenantWorkerStatus() {
  return { started, active, concurrency, pollMs, enabled: process.env.TENANT_SCRAPE_WORKER_ENABLED !== "false" };
}
