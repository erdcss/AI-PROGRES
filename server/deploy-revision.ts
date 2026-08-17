/** Git SHA injected by Railway / other hosts. Empty locally unless set. */
export function resolveDeployRevision(): string {
  const raw =
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    process.env.RAILWAY_GIT_COMMIT ||
    process.env.SOURCE_COMMIT ||
    process.env.COMMIT_SHA ||
    process.env.GIT_COMMIT ||
    "";
  return String(raw).trim().slice(0, 12);
}
