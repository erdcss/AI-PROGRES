export const controlCenterKeys = {
  all: ["control-center"] as const,
  summary: () => [...controlCenterKeys.all, "summary"] as const,
  health: () => [...controlCenterKeys.all, "health"] as const,
  jobs: (page: number, status?: string) =>
    [...controlCenterKeys.all, "jobs", page, status ?? "all"] as const,
  importJob: (jobId: string) => [...controlCenterKeys.all, "import-job", jobId] as const,
  changes: (status?: string) => [...controlCenterKeys.all, "changes", status ?? "all"] as const,
  shopifyHealth: () => [...controlCenterKeys.all, "shopify-health"] as const,
  auditLogs: (page: number) => [...controlCenterKeys.all, "audit-logs", page] as const,
};

export const queryKeys = controlCenterKeys;
