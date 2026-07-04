export type ControlCenterSummary = {
  importJobs: {
    queued: number;
    running: number;
    awaitingApproval: number;
    failed: number;
    completed: number;
  };
  tracking: {
    trackedProducts: number;
    activeTrackedProducts: number;
    pendingChanges: number;
    manualReview: number;
    schedulerRunning: boolean;
    schedulerEnabled: boolean;
    trackingEnabled: boolean;
    lastRunAt: string | null;
    nextRunAt: string | null;
  };
};

export type ImportJobRow = {
  jobId: string;
  sourceUrl: string;
  status: string;
  currentStage: string | null;
  progressPercentage: number;
  qualityScore: number | null;
  qualityResult?: unknown;
  canonicalProduct?: unknown;
  variantCount?: number;
  imageCount?: number;
  errorMessage?: string | null;
  createdAt: string;
};
