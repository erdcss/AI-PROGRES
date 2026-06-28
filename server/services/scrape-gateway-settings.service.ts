import { db } from "../db";
import { scrapeGatewaySettings } from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  buildGatewayConfigStatus,
  type GatewayConfigStatus,
} from "./scrape-gateway-status";
import {
  ensureProductTrackingTablesReady,
  tableExists,
  isMissingRelationError,
} from "../migrations/run-product-tracking-migration";

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
  lastTestError: string | null;
  lastWorkingProvider: string | null;
  lastTestUrl: string | null;
  lastTestHtmlSize: number | null;
  lastTestTitleFound: boolean | null;
  lastTestPriceFound: boolean | null;
  lastTestImagesFound: number | null;
  localAgentEndpoint: string | null;
  localAgentTokenEncrypted: string | null;
};

export type ScrapeGatewaySettingsPublic = Omit<
  ScrapeGatewaySettingsDto,
  "providerApiKeyEncrypted" | "proxyUrlEncrypted" | "localAgentTokenEncrypted"
> & {
  hasApiKey: boolean;
  apiKeyMasked: string | null;
  hasProxyUrl: boolean;
  proxyUrlMasked: string | null;
  hasLocalAgentToken: boolean;
  localAgentTokenMasked: string | null;
} & GatewayConfigStatus;

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
  const agentToken = maskSecret(row.localAgentTokenEncrypted);
  const status = buildGatewayConfigStatus(row);
  const {
    providerApiKeyEncrypted: _a,
    proxyUrlEncrypted: _p,
    localAgentTokenEncrypted: _t,
    ...rest
  } = row;
  return {
    ...rest,
    ...status,
    hasApiKey: api.has,
    apiKeyMasked: api.masked,
    hasProxyUrl: proxy.has,
    proxyUrlMasked: proxy.masked,
    hasLocalAgentToken: agentToken.has,
    localAgentTokenMasked: agentToken.masked,
  };
}

export async function isScrapeGatewaySettingsTableReady(): Promise<boolean> {
  return tableExists("scrape_gateway_settings");
}

export async function tryGetScrapeGatewaySettingsRaw(): Promise<ScrapeGatewaySettingsDto | null> {
  const ready = await ensureProductTrackingTablesReady();
  if (!ready || !(await tableExists("scrape_gateway_settings"))) {
    return null;
  }

  try {
    const rows = await db.select().from(scrapeGatewaySettings).limit(1);
    if (rows[0]) return rows[0] as ScrapeGatewaySettingsDto;

    const [created] = await db.insert(scrapeGatewaySettings).values(DEFAULTS).returning();
    console.log("✅ scrape_gateway_settings varsayılan kayıt oluşturuldu");
    return created as ScrapeGatewaySettingsDto;
  } catch (err) {
    if (await isMissingRelationError(err, "scrape_gateway_settings")) {
      return null;
    }
    throw err;
  }
}

export async function ensureScrapeGatewaySettings(): Promise<ScrapeGatewaySettingsDto> {
  const row = await tryGetScrapeGatewaySettingsRaw();
  if (!row) {
    throw new Error(
      "scrape_gateway_settings tablosu hazır değil — migration çalışmalı",
    );
  }
  return row;
}

export async function getScrapeGatewaySettings(): Promise<ScrapeGatewaySettingsPublic> {
  const row = await ensureScrapeGatewaySettings();
  return toPublicSettings(row);
}

export async function getScrapeGatewaySettingsRaw(): Promise<ScrapeGatewaySettingsDto> {
  const row = await tryGetScrapeGatewaySettingsRaw();
  if (!row) {
    throw new Error(
      "scrape_gateway_settings tablosu hazır değil — migration çalışmalı",
    );
  }
  return row;
}

export async function updateScrapeGatewaySettings(
  patch: Partial<{
    gatewayEnabled: boolean;
    proxyFallbackEnabled: boolean;
    providerType: string;
    providerEndpoint: string | null;
    providerApiKey: string | null;
    proxyUrl: string | null;
    localAgentEndpoint: string | null;
    localAgentToken: string | null;
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
  if (patch.localAgentEndpoint !== undefined) update.localAgentEndpoint = patch.localAgentEndpoint;
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
  if (patch.localAgentToken !== undefined && patch.localAgentToken !== "") {
    update.localAgentTokenEncrypted = patch.localAgentToken;
  }

  const [updated] = await db
    .update(scrapeGatewaySettings)
    .set(update)
    .where(eq(scrapeGatewaySettings.id, current.id))
    .returning();
  return toPublicSettings(updated as ScrapeGatewaySettingsDto);
}

export async function recordGatewayTest(input: {
  success: boolean;
  message: string;
  error?: string | null;
  url?: string;
  htmlSize?: number;
  titleFound?: boolean;
  priceFound?: boolean;
  imagesFound?: number;
  workingProvider?: string | null;
}) {
  const current = await ensureScrapeGatewaySettings();
  await db
    .update(scrapeGatewaySettings)
    .set({
      lastTestAt: new Date(),
      lastTestSuccess: input.success,
      lastTestMessage: input.message,
      lastTestError: input.success ? null : input.error ?? input.message,
      lastWorkingProvider: input.success
        ? input.workingProvider ?? current.providerType
        : current.lastWorkingProvider,
      lastTestUrl: input.url ?? current.lastTestUrl,
      lastTestHtmlSize: input.htmlSize ?? null,
      lastTestTitleFound: input.titleFound ?? null,
      lastTestPriceFound: input.priceFound ?? null,
      lastTestImagesFound: input.imagesFound ?? null,
      updatedAt: new Date(),
    })
    .where(eq(scrapeGatewaySettings.id, current.id));
}
