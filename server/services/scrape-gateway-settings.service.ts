import { db } from "../db";
import { scrapeGatewaySettings } from "@shared/schema";
import { eq } from "drizzle-orm";

export type ScrapeGatewaySettingsDto = {
  id: number;
  gatewayEnabled: boolean;
  proxyFallbackEnabled: boolean;
  providerType: string;
  providerEndpoint: string | null;
  providerApiKeyEncrypted: string | null;
  proxyUrlEncrypted: string | null;
  timeoutMs: number;
  retryCount: number;
  retryDelayMs: number;
  useProxyForHtml: boolean;
  useProxyForImages: boolean;
  useProxyForApi: boolean;
  lastTestAt: Date | null;
  lastTestSuccess: boolean | null;
  lastTestMessage: string | null;
};

export type ScrapeGatewaySettingsPublic = Omit<
  ScrapeGatewaySettingsDto,
  "providerApiKeyEncrypted" | "proxyUrlEncrypted"
> & {
  hasApiKey: boolean;
  apiKeyMasked: string | null;
  hasProxyUrl: boolean;
  proxyUrlMasked: string | null;
};

const DEFAULTS = {
  gatewayEnabled: true,
  proxyFallbackEnabled: false,
  providerType: "none",
  timeoutMs: 20000,
  retryCount: 2,
  retryDelayMs: 1500,
  useProxyForHtml: true,
  useProxyForImages: true,
  useProxyForApi: false,
};

function maskSecret(value: string | null): { has: boolean; masked: string | null } {
  if (!value || value.length < 4) return { has: Boolean(value), masked: value ? "****" : null };
  return { has: true, masked: `****${value.slice(-4)}` };
}

export function toPublicSettings(row: ScrapeGatewaySettingsDto): ScrapeGatewaySettingsPublic {
  const api = maskSecret(row.providerApiKeyEncrypted);
  const proxy = maskSecret(row.proxyUrlEncrypted);
  const { providerApiKeyEncrypted: _a, proxyUrlEncrypted: _p, ...rest } = row;
  return {
    ...rest,
    hasApiKey: api.has,
    apiKeyMasked: api.masked,
    hasProxyUrl: proxy.has,
    proxyUrlMasked: proxy.masked,
  };
}

export async function ensureScrapeGatewaySettings(): Promise<ScrapeGatewaySettingsDto> {
  const rows = await db.select().from(scrapeGatewaySettings).limit(1);
  if (rows[0]) return rows[0] as ScrapeGatewaySettingsDto;

  const [created] = await db.insert(scrapeGatewaySettings).values(DEFAULTS).returning();
  console.log("✅ scrape_gateway_settings varsayılan kayıt oluşturuldu");
  return created as ScrapeGatewaySettingsDto;
}

export async function getScrapeGatewaySettings(): Promise<ScrapeGatewaySettingsPublic> {
  const row = await ensureScrapeGatewaySettings();
  return toPublicSettings(row);
}

export async function getScrapeGatewaySettingsRaw(): Promise<ScrapeGatewaySettingsDto> {
  return ensureScrapeGatewaySettings();
}

export async function updateScrapeGatewaySettings(
  patch: Partial<{
    gatewayEnabled: boolean;
    proxyFallbackEnabled: boolean;
    providerType: string;
    providerEndpoint: string | null;
    providerApiKey: string | null;
    proxyUrl: string | null;
    timeoutMs: number;
    retryCount: number;
    retryDelayMs: number;
    useProxyForHtml: boolean;
    useProxyForImages: boolean;
    useProxyForApi: boolean;
  }>,
): Promise<ScrapeGatewaySettingsPublic> {
  const current = await ensureScrapeGatewaySettings();
  const update: Record<string, unknown> = { updatedAt: new Date() };

  if (patch.gatewayEnabled !== undefined) update.gatewayEnabled = patch.gatewayEnabled;
  if (patch.proxyFallbackEnabled !== undefined) update.proxyFallbackEnabled = patch.proxyFallbackEnabled;
  if (patch.providerType !== undefined) update.providerType = patch.providerType;
  if (patch.providerEndpoint !== undefined) update.providerEndpoint = patch.providerEndpoint;
  if (patch.timeoutMs !== undefined) update.timeoutMs = patch.timeoutMs;
  if (patch.retryCount !== undefined) update.retryCount = patch.retryCount;
  if (patch.retryDelayMs !== undefined) update.retryDelayMs = patch.retryDelayMs;
  if (patch.useProxyForHtml !== undefined) update.useProxyForHtml = patch.useProxyForHtml;
  if (patch.useProxyForImages !== undefined) update.useProxyForImages = patch.useProxyForImages;
  if (patch.useProxyForApi !== undefined) update.useProxyForApi = patch.useProxyForApi;
  if (patch.providerApiKey !== undefined && patch.providerApiKey !== "") {
    update.providerApiKeyEncrypted = patch.providerApiKey;
  }
  if (patch.proxyUrl !== undefined && patch.proxyUrl !== "") {
    update.proxyUrlEncrypted = patch.proxyUrl;
  }

  const [updated] = await db
    .update(scrapeGatewaySettings)
    .set(update)
    .where(eq(scrapeGatewaySettings.id, current.id))
    .returning();
  return toPublicSettings(updated as ScrapeGatewaySettingsDto);
}

export async function recordGatewayTest(success: boolean, message: string) {
  const current = await ensureScrapeGatewaySettings();
  await db
    .update(scrapeGatewaySettings)
    .set({
      lastTestAt: new Date(),
      lastTestSuccess: success,
      lastTestMessage: message,
      updatedAt: new Date(),
    })
    .where(eq(scrapeGatewaySettings.id, current.id));
}
