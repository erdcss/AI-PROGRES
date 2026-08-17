import { redactSecrets } from "../../lib/secret-crypto";

export class MarktGoApiError extends Error {
  status: number;
  code: string;
  retryable: boolean;

  constructor(message: string, status = 0, code = "marktgo_error", retryable = false) {
    super(message);
    this.name = "MarktGoApiError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

export function userMessageForMarktGoError(err: unknown): string {
  if (err instanceof MarktGoApiError) return err.message;
  return redactSecrets(err instanceof Error ? err.message : String(err));
}

export function normalizeMarktGoHttpError(status: number, bodyText: string): MarktGoApiError {
  const safe = redactSecrets(bodyText || "").slice(0, 400);
  let apiCode = "";
  try {
    const parsed = JSON.parse(bodyText || "{}") as { code?: string; error?: string };
    if (typeof parsed.code === "string") apiCode = parsed.code;
  } catch {
    /* plain text body */
  }
  const lower = safe.toLowerCase();

  if (status === 401) {
    return new MarktGoApiError(
      "MARKT-GO API tokenı geçersiz veya süresi dolmuş.",
      401,
      "unauthorized",
      false,
    );
  }
  if (status === 403) {
    const scopeMatch = safe.match(/[a-z]+\.[a-z]+/i);
    const extra = scopeMatch ? `: ${scopeMatch[0]}` : "";
    return new MarktGoApiError(
      `MARKT-GO bağlantısında gerekli API yetkisi bulunmuyor${extra}`,
      403,
      "insufficient_scope",
      false,
    );
  }
  if (status === 404) {
    return new MarktGoApiError("MARKT-GO kaydı bulunamadı.", 404, "not_found", false);
  }
  if (
    status === 409 ||
    apiCode === "DUPLICATE_EXTERNAL_ID" ||
    lower.includes("duplicate externalid")
  ) {
    return new MarktGoApiError(
      "Bu ürün MARKT-GO'da daha önce oluşturulmuş.",
      status || 409,
      "duplicate",
      false,
    );
  }
  if (apiCode === "DUPLICATE_VARIANT_ID" || lower.includes("duplicate variant")) {
    return new MarktGoApiError(
      "Varyant kimlikleri çakışıyor — gönderim yeniden denenecek.",
      status || 400,
      "duplicate_variant",
      false,
    );
  }
  if (status === 429) {
    return new MarktGoApiError(
      "MARKT-GO API istek limiti aşıldı. İşlem otomatik olarak yeniden denenecek.",
      429,
      "rate_limited",
      true,
    );
  }
  if (status >= 500) {
    return new MarktGoApiError(
      "MARKT-GO sunucu hatası. İşlem yeniden denenecek.",
      status,
      "server_error",
      true,
    );
  }
  if (status === 0) {
    return new MarktGoApiError("MARKT-GO ağına ulaşılamadı.", 0, "network", true);
  }
  return new MarktGoApiError(
    safe ? `MARKT-GO hatası (${status}): ${safe}` : `MARKT-GO hatası (HTTP ${status})`,
    status,
    "http_error",
    false,
  );
}
