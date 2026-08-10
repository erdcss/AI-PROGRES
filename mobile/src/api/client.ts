const DEFAULT_TIMEOUT_MS = 25000;

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

export function getApiBaseUrl(): string {
  const raw = process.env.EXPO_PUBLIC_API_URL || "";
  return raw.replace(/\/$/, "");
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const base = getApiBaseUrl();
  if (!base) {
    throw new ApiError("EXPO_PUBLIC_API_URL tanımlı değil", 0);
  }
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...init } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.success === false) {
      throw new ApiError(
        typeof data?.error === "string" ? data.error : `HTTP ${res.status}`,
        res.status,
      );
    }
    return data as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if ((err as Error)?.name === "AbortError") {
      throw new ApiError("İstek zaman aşımı", 0);
    }
    throw new ApiError(
      err instanceof Error ? err.message : "Ağ hatası",
      0,
    );
  } finally {
    clearTimeout(timer);
  }
}
