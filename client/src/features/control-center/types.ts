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
    pendingChanges: number;
    schedulerRunning: boolean;
    lastRunAt: string | null;
  };
};

export type ImportJobRow = {
  jobId: string;
  sourceUrl: string;
  status: string;
  currentStage: string | null;
  progressPercentage: number;
  qualityScore: number | null;
  variantCount?: number;
  imageCount?: number;
  errorMessage?: string | null;
  createdAt: string;
};
