export {
  IMPORT_JOB_STATUSES,
  type ImportJobStatus,
  canTransitionJob,
  assertJobTransition,
  InvalidJobTransitionError,
  isTerminalJobStatus,
  isCancellableJobStatus,
  isTrackingOnlyRetry,
} from "./import-job-state-machine";

export type UploadMode = "manual_approval" | "auto_approve" | "scrape_only";

export type CreateImportJobRequest = {
  sourceUrl: string;
  sourcePlatform?: string;
  scrapeMode?: string;
  profitRuleId?: number | null;
  uploadMode?: UploadMode;
  requestedBy?: string;
};

export type ImportJobSummary = {
  jobId: string;
  sourceUrl: string;
  sourcePlatform: string;
  sourceProductId: string | null;
  status: ImportJobStatus;
  currentStage: string | null;
  progressPercentage: number;
  qualityScore: number | null;
  qualityStatus: string | null;
  variantCount: number;
  imageCount: number;
  shopifyProductId: string | null;
  trackingRegistered: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  retryCount: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PaginatedResponse<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};
