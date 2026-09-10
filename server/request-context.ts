import { randomUUID, timingSafeEqual } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { resolveAppAuth } from './multi-user-auth';
import { ensureMultiUserSchema } from './multi-user-schema';

const HEADER = 'x-request-id';

const PROTECTED_ADMIN_PREFIXES = [
  '/api/scrape',
  '/api/shopify',
  '/api/control-center',
  '/api/product-pool',
  '/api/tracking',
  '/api/csv',
  '/api/download',
  '/api/find-price-changes',
  '/api/test-enhanced',
  '/api/analysis',
  '/api/sos',
  '/api/agent',
  '/api/pending',
];

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function hasInternalServiceAccess(req: Request) {
  const candidates = [
    String(req.headers['x-import-key'] || ''),
    String(req.headers['x-agent-token'] || ''),
    String(req.headers['x-browser-worker-token'] || ''),
    String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''),
  ].filter(Boolean);
  const secrets = [
    process.env.IMPORT_KEY,
    process.env.INTERNAL_LOCAL_AGENT_TOKEN,
    process.env.BROWSER_WORKER_TOKEN,
    process.env.INTERNAL_SERVICE_TOKEN,
  ].map((value) => String(value || '').trim()).filter(Boolean);

  return candidates.some((candidate) => secrets.some((secret) => safeEqual(candidate.trim(), secret)));
}

function needsAdminProtection(req: Request) {
  if (process.env.NODE_ENV !== 'production') return false;
  if (!req.path.startsWith('/api/')) return false;
  if (req.path.startsWith('/api/auth/') || req.path.startsWith('/api/workspace/')) return false;
  return PROTECTED_ADMIN_PREFIXES.some((prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`));
}

export function createRequestId(): string {
  return randomUUID().slice(0, 8);
}

export function getRequestId(req?: Request): string {
  const fromHeader = req?.headers?.[HEADER];
  if (typeof fromHeader === 'string' && fromHeader.length > 0) return fromHeader;
  return createRequestId();
}

export async function requestIdMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const id = getRequestId(req);
  (req as Request & { requestId?: string }).requestId = id;
  res.setHeader(HEADER, id);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  if (!needsAdminProtection(req) || hasInternalServiceAccess(req)) {
    next();
    return;
  }

  try {
    const ready = await ensureMultiUserSchema();
    if (!ready) {
      res.status(503).json({ success: false, message: 'Kimlik doğrulama veritabanı hazır değil', requestId: id });
      return;
    }
    const auth = await resolveAppAuth(req);
    if (!auth) {
      res.status(401).json({ success: false, message: 'Yönetici oturumu gerekli', requestId: id });
      return;
    }
    if (auth.systemRole !== 'admin') {
      res.status(403).json({ success: false, message: 'Bu işlem yalnızca yöneticiye açıktır', requestId: id });
      return;
    }
    req.appAuth = auth;
    next();
  } catch (error) {
    console.error(`[${id}] [security] legacy API auth error`, error);
    res.status(503).json({ success: false, message: 'Kimlik doğrulama servisi kullanılamıyor', requestId: id });
  }
}

export function logStep(requestId: string, step: string, message: string, extra?: Record<string, unknown>): void {
  const safe = extra ? ` ${JSON.stringify(extra)}` : '';
  console.log(`[${requestId}] [${step}] ${message}${safe}`);
}
