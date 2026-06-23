import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction } from 'express';

const HEADER = 'x-request-id';

export function createRequestId(): string {
  return randomUUID().slice(0, 8);
}

export function getRequestId(req?: Request): string {
  const fromHeader = req?.headers?.[HEADER];
  if (typeof fromHeader === 'string' && fromHeader.length > 0) return fromHeader;
  return createRequestId();
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const id = getRequestId(req);
  (req as Request & { requestId?: string }).requestId = id;
  res.setHeader(HEADER, id);
  next();
}

export function logStep(requestId: string, step: string, message: string, extra?: Record<string, unknown>): void {
  const safe = extra ? ` ${JSON.stringify(extra)}` : '';
  console.log(`[${requestId}] [${step}] ${message}${safe}`);
}
