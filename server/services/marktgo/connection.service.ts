import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { integrationConnections, shopifyCredentials } from "@shared/schema";
import { DESTINATION_PROVIDER } from "@shared/integration-provider";
import {
  decryptSecret,
  encryptSecret,
  looksLikeMarktGoToken,
  maskToken,
  tokenLast4,
} from "../../lib/secret-crypto";
import { createMarktGoClient } from "./client";
import { MarktGoApiError, userMessageForMarktGoError } from "./errors";
import { missingRequiredScopes, parseScopeList } from "./scopes";
import type { MarktGoMe } from "./types";
import { runMarktGoMigration } from "../../migrations/run-marktgo-migration";

export type PublicMarktGoConnection = {
  id: number;
  name: string;
  provider: typeof DESTINATION_PROVIDER.MARKTGO;
  apiBaseUrl: string;
  environment: string;
  status: string;
  statusLabel: string;
  tokenMasked: string;
  scopes: string[];
  missingScopes: string[];
  lastError: string | null;
  lastHealthAt: string | null;
  webhookUrl: string | null;
  isActive: boolean;
};

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x)) : [];
}

function statusLabel(status: string, missing: string[]): string {
  if (status === "connected_limited" || missing.length) return "Bağlı — Eksik Yetki";
  if (status === "connected") return "Bağlı";
  if (status === "error") return "Hata";
  return "Bağlı değil";
}

function toPublic(row: typeof integrationConnections.$inferSelect): PublicMarktGoConnection {
  const missing = asStringArray(row.missingScopes);
  let tokenMasked = "";
  try {
    const plain = decryptSecret(row.accessTokenEncrypted);
    tokenMasked = maskToken(plain);
  } catch {
    const last4 = row.tokenLast4 || "";
    tokenMasked = last4
      ? `${row.environment === "test" ? "tm_test_" : "tm_live_"}••••••••••${last4}`
      : "";
  }
  return {
    id: row.id,
    name: row.name,
    provider: DESTINATION_PROVIDER.MARKTGO,
    apiBaseUrl: row.apiBaseUrl,
    environment: row.environment,
    status: row.status,
    statusLabel: statusLabel(row.status, missing),
    tokenMasked,
    scopes: asStringArray(row.scopes),
    missingScopes: missing,
    lastError: row.lastError,
    lastHealthAt: row.lastHealthAt ? row.lastHealthAt.toISOString() : null,
    webhookUrl: row.webhookUrl,
    isActive: row.isActive,
  };
}

export function normalizeMarktGoBaseUrl(raw: string): string {
  let u = String(raw || "").trim().replace(/\/+$/, "");
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  if (!/\/api\/v1\/external$/i.test(u)) {
    u = `${u.replace(/\/api\/v1\/external.*$/i, "")}/api/v1/external`;
    u = u.replace(/([^:]\/)\/+/g, "$1");
  }
  return u;
}

export async function listMarktGoConnections(): Promise<PublicMarktGoConnection[]> {
  await runMarktGoMigration(false);
  const rows = await db
    .select()
    .from(integrationConnections)
    .where(eq(integrationConnections.provider, DESTINATION_PROVIDER.MARKTGO))
    .orderBy(desc(integrationConnections.updatedAt));
  return rows.map(toPublic);
}

export async function getActiveMarktGoConnection() {
  await runMarktGoMigration(false);
  const [row] =
    (await db
      .select()
      .from(integrationConnections)
      .where(
        and(
          eq(integrationConnections.provider, DESTINATION_PROVIDER.MARKTGO),
          eq(integrationConnections.isActive, true),
        ),
      )
      .orderBy(desc(integrationConnections.updatedAt))
      .limit(1)) || [];
  return row || null;
}

export async function getMarktGoClientForConnection(connectionId?: number) {
  const row = connectionId
    ? (
        await db
          .select()
          .from(integrationConnections)
          .where(eq(integrationConnections.id, connectionId))
          .limit(1)
      )[0]
    : await getActiveMarktGoConnection();
  if (!row) throw new MarktGoApiError("Aktif MARKT-GO bağlantısı yok.", 0, "not_configured");
  const token = decryptSecret(row.accessTokenEncrypted);
  return {
    connection: row,
    client: createMarktGoClient({ baseUrl: row.apiBaseUrl, accessToken: token }),
  };
}

function extractMe(payload: unknown): { me: MarktGoMe; scopes: string[] } {
  const root = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const data =
    root.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>)
      : root;
  const scopes = parseScopeList(data.scopes ?? data.scope ?? root.scopes);
  return { me: data as MarktGoMe, scopes };
}

export async function probeMarktGoHealth(baseUrl: string, token: string) {
  const client = createMarktGoClient({ baseUrl, accessToken: token, timeoutMs: 15_000 });
  const raw = await client.get<unknown>("/me");
  const { me, scopes } = extractMe(raw);
  const missing = missingRequiredScopes(scopes);
  return { me, scopes, missing };
}

export async function saveMarktGoConnection(input: {
  id?: number;
  name?: string;
  apiBaseUrl: string;
  accessToken?: string;
  environment?: string;
  webhookUrl?: string | null;
}): Promise<PublicMarktGoConnection> {
  await runMarktGoMigration(false);
  const apiBaseUrl = normalizeMarktGoBaseUrl(input.apiBaseUrl);
  if (!apiBaseUrl) throw new Error("API Base URL zorunlu");

  const name = String(input.name || "MARKT-GO").trim() || "MARKT-GO";
  const environment =
    String(input.environment || "").toLowerCase() === "test" ? "test" : "production";

  let existing = input.id
    ? (
        await db
          .select()
          .from(integrationConnections)
          .where(eq(integrationConnections.id, input.id))
          .limit(1)
      )[0]
    : null;

  let token = String(input.accessToken || "").trim();
  if (!token && existing) token = decryptSecret(existing.accessTokenEncrypted);
  if (!token) throw new Error("Access token zorunlu");
  if (token.includes("•")) {
    if (!existing) throw new Error("Yeni bağlantı için tam token girin");
    token = decryptSecret(existing.accessTokenEncrypted);
  }

  let status = "connected";
  let scopes: string[] = [];
  let missing: string[] = [];
  let lastError: string | null = null;
  try {
    const probe = await probeMarktGoHealth(apiBaseUrl, token);
    scopes = probe.scopes;
    missing = probe.missing;
    if (missing.length) status = "connected_limited";
  } catch (err) {
    status = "error";
    lastError = userMessageForMarktGoError(err);
  }

  const payload = {
    name,
    provider: DESTINATION_PROVIDER.MARKTGO,
    apiBaseUrl,
    accessTokenEncrypted: encryptSecret(token),
    tokenLast4: tokenLast4(token),
    environment,
    status,
    scopes,
    missingScopes: missing,
    lastError,
    lastHealthAt: new Date(),
    webhookUrl: input.webhookUrl || null,
    isActive: true,
    updatedAt: new Date(),
  };

  if (existing) {
    const [updated] = await db
      .update(integrationConnections)
      .set(payload)
      .where(eq(integrationConnections.id, existing.id))
      .returning();
    return toPublic(updated);
  }

  await db
    .update(integrationConnections)
    .set({ isActive: false, updatedAt: new Date() })
    .where(
      and(
        eq(integrationConnections.provider, DESTINATION_PROVIDER.MARKTGO),
        eq(integrationConnections.isActive, true),
      ),
    );

  const [created] = await db.insert(integrationConnections).values(payload).returning();
  return toPublic(created);
}

export async function testMarktGoConnection(id?: number): Promise<PublicMarktGoConnection> {
  const row = id
    ? (
        await db
          .select()
          .from(integrationConnections)
          .where(eq(integrationConnections.id, id))
          .limit(1)
      )[0]
    : await getActiveMarktGoConnection();
  if (!row) throw new MarktGoApiError("MARKT-GO bağlantısı bulunamadı.", 0, "not_configured");
  const token = decryptSecret(row.accessTokenEncrypted);
  try {
    const probe = await probeMarktGoHealth(row.apiBaseUrl, token);
    const status = probe.missing.length ? "connected_limited" : "connected";
    const [updated] = await db
      .update(integrationConnections)
      .set({
        status,
        scopes: probe.scopes,
        missingScopes: probe.missing,
        lastError: probe.missing.length
          ? `Eksik: ${probe.missing.join(", ")}`
          : null,
        lastHealthAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(integrationConnections.id, row.id))
      .returning();
    return toPublic(updated);
  } catch (err) {
    const [updated] = await db
      .update(integrationConnections)
      .set({
        status: "error",
        lastError: userMessageForMarktGoError(err),
        lastHealthAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(integrationConnections.id, row.id))
      .returning();
    return toPublic(updated);
  }
}

/** If a MARKT-GO token was pasted into Shopify client secret, move it. */
export async function migrateMisplacedMarktGoTokenFromShopify(): Promise<boolean> {
  await runMarktGoMigration(false);
  const existing = await getActiveMarktGoConnection();
  if (existing) return false;
  const creds = await db.select().from(shopifyCredentials).limit(8);
  for (const c of creds) {
    const secret = String(c.apiSecret || "").trim();
    const access = String(c.accessToken || "").trim();
    const candidate = looksLikeMarktGoToken(secret)
      ? secret
      : looksLikeMarktGoToken(access)
        ? access
        : "";
    if (!candidate) continue;
    const env = candidate.startsWith("mgt_test_") ? "test" : "production";
    await saveMarktGoConnection({
      name: "MARKT-GO",
      apiBaseUrl:
        process.env.MARKTGO_API_BASE_URL || "https://api.turmarkt.com/api/v1/external",
      accessToken: candidate,
      environment: env,
    });
    if (looksLikeMarktGoToken(secret)) {
      await db
        .update(shopifyCredentials)
        .set({ apiSecret: "", updatedAt: new Date() })
        .where(eq(shopifyCredentials.id, c.id));
    }
    console.warn(
      "[marktgo] Shopify credential alanından MARKT-GO token taşındı (değer loglanmadı)",
    );
    return true;
  }
  return false;
}

export function maskMarktGoTokenForUi(token: string): string {
  return maskToken(token);
}

/** Canlı ortamda token env'deyse local ile aynı MARKT-GO bağlantısını kur. */
export async function ensureMarktGoConnectionFromEnv(): Promise<boolean> {
  const token = String(process.env.MARKTGO_ACCESS_TOKEN || "").trim();
  if (!token || !looksLikeMarktGoToken(token)) return false;
  const existing = await getActiveMarktGoConnection();
  if (existing) return false;
  await saveMarktGoConnection({
    name: String(process.env.MARKTGO_CONNECTION_NAME || "MARKT-GO").trim() || "MARKT-GO",
    apiBaseUrl:
      process.env.MARKTGO_API_BASE_URL || "https://api.turmarkt.com/api/v1/external",
    accessToken: token,
    environment: String(process.env.MARKTGO_ENVIRONMENT || "production").toLowerCase() === "test"
      ? "test"
      : "production",
  });
  console.info("[marktgo] bağlantı MARKTGO_ACCESS_TOKEN env ile kuruldu");
  return true;
}
