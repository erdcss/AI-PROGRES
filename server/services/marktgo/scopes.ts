import { MARKTGO_REQUIRED_SCOPES } from "@shared/integration-provider";

export function parseScopeList(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((s) => String(s).trim()).filter(Boolean);
  }
  if (typeof raw === "string") {
    return raw
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

/** `*` veya `*.*` = tüm harici API yetkileri (MARKT-GO Full Access). */
export function hasWildcardScope(granted: string[]): boolean {
  return granted.some((s) => {
    const n = s.toLowerCase();
    return n === "*" || n === "*.*" || n === "all" || n === "full";
  });
}

export function missingRequiredScopes(granted: string[]): string[] {
  if (hasWildcardScope(granted)) return [];
  const set = new Set(granted.map((s) => s.toLowerCase()));
  return MARKTGO_REQUIRED_SCOPES.filter((s) => !set.has(s.toLowerCase()));
}
