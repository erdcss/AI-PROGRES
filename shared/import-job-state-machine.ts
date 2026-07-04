import type { ImportJobStatus } from "./import-job-types";

export const IMPORT_JOB_STATUSES = [
  "queued",
  "scraping",
  "normalizing",
  "validating",
  "awaiting_approval",
  "approved",
  "dry_run_ready",
  "uploading_to_shopify",
  "registering_tracking",
  "completed",
  "completed_with_warning",
  "partial",
  "failed",
  "cancelled",
] as const;

export type ImportJobStatus = (typeof IMPORT_JOB_STATUSES)[number];

/** Valid status transitions */
const TRANSITIONS: Record<string, ImportJobStatus[]> = {
  queued: ["scraping", "cancelled", "failed"],
  scraping: ["normalizing", "failed", "cancelled"],
  normalizing: ["validating", "failed", "cancelled"],
  validating: ["awaiting_approval", "failed", "cancelled"],
  awaiting_approval: ["approved", "cancelled", "failed"],
  approved: ["dry_run_ready", "uploading_to_shopify", "cancelled"],
  dry_run_ready: ["uploading_to_shopify", "approved", "cancelled"],
  uploading_to_shopify: ["registering_tracking", "failed", "partial"],
  registering_tracking: ["completed", "completed_with_warning", "failed"],
  partial: ["registering_tracking", "failed"],
  completed: [],
  completed_with_warning: ["registering_tracking"],
  failed: ["queued"],
  cancelled: [],
};

export class InvalidJobTransitionError extends Error {
  readonly code = "invalid_job_transition";
  readonly statusCode = 409;

  constructor(from: string, to: string) {
    super(`Geçersiz iş durumu geçişi: ${from} → ${to}`);
    this.name = "InvalidJobTransitionError";
  }
}

export function canTransitionJob(from: string, to: ImportJobStatus): boolean {
  const allowed = TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

export function assertJobTransition(from: string, to: ImportJobStatus): void {
  if (!canTransitionJob(from, to)) {
    throw new InvalidJobTransitionError(from, to);
  }
}

export function isTerminalJobStatus(status: string): boolean {
  return ["completed", "completed_with_warning", "failed", "cancelled"].includes(status);
}

export function isCancellableJobStatus(status: string): boolean {
  return !isTerminalJobStatus(status) && status !== "uploading_to_shopify" && status !== "registering_tracking";
}

/** Retry only re-runs tracking registration */
export function isTrackingOnlyRetry(status: string, errorCode: string | null): boolean {
  return (
    status === "completed_with_warning" &&
    (errorCode === "tracking_registration_failed" || errorCode === "tracking_registration_failed")
  );
}
