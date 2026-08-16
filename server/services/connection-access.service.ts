import fs from "fs";
import path from "path";

export type ConnectionSchema = {
  protocol: string;
  baseUrl: string;
  auth: string;
  envVars: string[];
  endpoints: string[];
};

export type ConnectionCatalogItem = {
  id: string;
  name: string;
  group: string;
  description: string;
  schema: ConnectionSchema;
};

type StoredKey = {
  id: string;
  connectionId: string;
  envName: string;
  value: string;
  label: string;
  createdAt: string;
};

type CustomConnection = {
  id: string;
  name: string;
  description: string;
  envVars: string[];
};

type StoreFile = {
  disabled: string[];
  keys: StoredKey[];
  displayNames: Record<string, string>;
  custom: CustomConnection[];
};

const STORE_PATH = path.resolve("data/connection-access.json");

export const CONNECTION_CATALOG: ConnectionCatalogItem[] = [
  {
    id: "shopify",
    name: "Shopify Admin API",
    group: "Mağaza",
    description: "Ürün, varyant, envanter ve koleksiyon senkronu",
    schema: {
      protocol: "HTTPS REST",
      baseUrl: "https://{SHOPIFY_SHOP_DOMAIN}/admin/api/{version}",
      auth: "X-Shopify-Access-Token / client_credentials",
      envVars: [
        "SHOPIFY_SHOP_DOMAIN",
        "SHOPIFY_CLIENT_ID",
        "SHOPIFY_CLIENT_SECRET",
        "SHOPIFY_API_KEY",
        "SHOPIFY_ACCESS_TOKEN",
        "SHOPIFY_ADMIN_ACCESS_TOKEN",
      ],
      endpoints: ["/shop.json", "/products.json", "/admin/oauth/access_scopes.json"],
    },
  },
  {
    id: "browser-worker",
    name: "Browser Worker",
    group: "Scrape",
    description: "Playwright ile korumalı sayfa HTML çekimi",
    schema: {
      protocol: "HTTPS JSON",
      baseUrl: "{BROWSER_WORKER_URL}",
      auth: "Bearer / x-worker-token (BROWSER_WORKER_TOKEN)",
      envVars: ["BROWSER_WORKER_URL", "BROWSER_WORKER_ENDPOINT", "BROWSER_WORKER_TOKEN"],
      endpoints: ["GET /health", "POST /scrape/html", "POST /scrape/trendyol"],
    },
  },
  {
    id: "local-agent",
    name: "Local Scrape Agent",
    group: "Scrape",
    description: "Yerel ağdan Trendyol ürün çekimi",
    schema: {
      protocol: "HTTPS JSON",
      baseUrl: "{INTERNAL_LOCAL_AGENT_ENDPOINT}",
      auth: "x-agent-token (INTERNAL_LOCAL_AGENT_TOKEN)",
      envVars: [
        "INTERNAL_LOCAL_AGENT_ENDPOINT",
        "INTERNAL_LOCAL_AGENT_TOKEN",
        "LOCAL_AGENT_TOKEN",
        "LOCAL_AGENT_PORT",
      ],
      endpoints: ["GET /health", "POST /scrape"],
    },
  },
  {
    id: "telegram",
    name: "Telegram Bot",
    group: "Bildirim",
    description: "Fiyat/stok bildirim yedek kanalı",
    schema: {
      protocol: "HTTPS Bot API",
      baseUrl: "https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}",
      auth: "Bot token path parametresi",
      envVars: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "TELEGRAM_IMAGE_BOT_TOKEN"],
      endpoints: ["GET /getMe", "POST /sendMessage"],
    },
  },
  {
    id: "openai",
    name: "OpenAI",
    group: "AI",
    description: "Başlık, fiyat ve ürün analizi",
    schema: {
      protocol: "HTTPS REST",
      baseUrl: "https://api.openai.com/v1",
      auth: "Authorization: Bearer {OPENAI_API_KEY}",
      envVars: ["OPENAI_API_KEY", "OPENAI_API_KEY_NEW"],
      endpoints: ["POST /chat/completions"],
    },
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    group: "AI",
    description: "Özellik çıkarma ve kod asistanı",
    schema: {
      protocol: "HTTPS REST",
      baseUrl: "https://api.anthropic.com/v1",
      auth: "x-api-key: {ANTHROPIC_API_KEY}",
      envVars: ["ANTHROPIC_API_KEY"],
      endpoints: ["POST /messages"],
    },
  },
  {
    id: "gemini",
    name: "Google Gemini",
    group: "AI",
    description: "Çift doğrulamalı ürün analizi",
    schema: {
      protocol: "HTTPS REST",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      auth: "key={GOOGLE_API_KEY}",
      envVars: ["GOOGLE_API_KEY"],
      endpoints: ["POST /models/{model}:generateContent"],
    },
  },
  {
    id: "canva",
    name: "Canva",
    group: "Tasarım",
    description: "Görsel tasarım OAuth bağlantısı",
    schema: {
      protocol: "OAuth 2.0",
      baseUrl: "https://api.canva.com",
      auth: "Bearer access_token",
      envVars: ["CANVA_CLIENT_ID", "CANVA_CLIENT_SECRET"],
      endpoints: ["GET /rest/v1/oauth/token"],
    },
  },
  {
    id: "supabase",
    name: "Supabase (mobil)",
    group: "Mobil",
    description: "Mobil ürün aynası ve okuma API’si",
    schema: {
      protocol: "HTTPS REST",
      baseUrl: "{SUPABASE_URL}/rest/v1",
      auth: "apikey / Authorization Bearer",
      envVars: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "EXPO_PUBLIC_SUPABASE_URL"],
      endpoints: ["/mobile_products"],
    },
  },
  {
    id: "fcm",
    name: "Mobil Push (FCM / Expo)",
    group: "Mobil",
    description: "ORVIAN Android bildirimleri",
    schema: {
      protocol: "HTTPS",
      baseUrl: "https://fcm.googleapis.com | https://exp.host/--/api/v2/push/send",
      auth: "Google service account / Expo token",
      envVars: ["FCM_PROJECT_ID", "FCM_CLIENT_EMAIL", "FCM_PRIVATE_KEY", "EXPO_ACCESS_TOKEN"],
      endpoints: ["POST /v1/projects/{id}/messages:send"],
    },
  },
  {
    id: "proxy",
    name: "İç proxy / scraping API",
    group: "Scrape",
    description: "Kaynak erişim yedek sağlayıcıları",
    schema: {
      protocol: "HTTP(S) proxy / REST",
      baseUrl: "{INTERNAL_PROXY_URL} | {INTERNAL_SCRAPING_API_ENDPOINT}",
      auth: "proxy user:pass / API key",
      envVars: [
        "INTERNAL_PROXY_URL",
        "INTERNAL_SCRAPING_API_ENDPOINT",
        "INTERNAL_SCRAPING_API_KEY",
      ],
      endpoints: ["GET {url}", "POST /scrape"],
    },
  },
  {
    id: "database",
    name: "PostgreSQL",
    group: "Altyapı",
    description: "Takip, havuz ve Shopify kayıtları",
    schema: {
      protocol: "PostgreSQL",
      baseUrl: "{DATABASE_URL}",
      auth: "connection string",
      envVars: ["DATABASE_URL"],
      endpoints: ["drizzle queries"],
    },
  },
];

const originalEnv = new Map<string, string | undefined>();

function ensureStoreDir() {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readStore(): StoreFile {
  try {
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as StoreFile;
    return {
      disabled: Array.isArray(parsed.disabled) ? parsed.disabled.map(String) : [],
      keys: Array.isArray(parsed.keys) ? parsed.keys : [],
      displayNames:
        parsed.displayNames && typeof parsed.displayNames === "object" ? parsed.displayNames : {},
      custom: Array.isArray(parsed.custom) ? parsed.custom : [],
    };
  } catch {
    return { disabled: [], keys: [], displayNames: {}, custom: [] };
  }
}

function writeStore(store: StoreFile) {
  ensureStoreDir();
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

function maskSecret(value: string | undefined | null): { configured: boolean; masked: string | null } {
  const v = String(value || "").trim();
  if (!v) return { configured: false, masked: null };
  if (v.length <= 6) return { configured: true, masked: "••••" };
  return { configured: true, masked: `${v.slice(0, 3)}…${v.slice(-4)}` };
}

function catalogById(id: string) {
  const fromCatalog = CONNECTION_CATALOG.find((c) => c.id === id);
  if (fromCatalog) return fromCatalog;
  const custom = readStore().custom.find((c) => c.id === id);
  if (!custom) return null;
  return {
    id: custom.id,
    name: custom.name,
    group: "Harici",
    description: custom.description || "Harici uygulama",
    schema: {
      protocol: "HTTPS",
      baseUrl: "özel",
      auth: "API key",
      envVars: custom.envVars,
      endpoints: ["özel"],
    },
  } satisfies ConnectionCatalogItem;
}

function slugifyName(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
  return s || `app-${Date.now().toString(36)}`;
}

export function getDestinationBrand() {
  const store = readStore();
  const shopifyEnabled = !store.disabled.includes("shopify");
  const destinationName = (store.displayNames.shopify || "Shopify").trim() || "Shopify";
  return {
    shopifyEnabled,
    destinationName,
    sendLabel: `${destinationName}'a Gönder`,
    sendLoadingLabel: `${destinationName}'a gidiyor…`,
    transferLabel: `${destinationName}'a Aktar`,
    transferLoadingLabel: `${destinationName}'a aktarılıyor…`,
    bulkLabel: `Tüm ürünleri ${destinationName}'a yükle`,
  };
}

function snapshotEnv(envName: string) {
  if (!originalEnv.has(envName)) {
    originalEnv.set(envName, process.env[envName]);
  }
}

function applyKey(envName: string, value: string) {
  snapshotEnv(envName);
  process.env[envName] = value;
}

function clearEnv(envName: string) {
  snapshotEnv(envName);
  delete process.env[envName];
}

function restoreEnv(envName: string) {
  const orig = originalEnv.get(envName);
  if (orig === undefined) delete process.env[envName];
  else process.env[envName] = orig;
}

export function applyConnectionAccessOnBoot(): void {
  const store = readStore();
  for (const key of store.keys) {
    const item = catalogById(key.connectionId);
    if (!item) continue;
    if (store.disabled.includes(key.connectionId)) continue;
    if (!item.schema.envVars.includes(key.envName)) continue;
    applyKey(key.envName, key.value);
  }
  for (const id of store.disabled) {
    const item = catalogById(id);
    if (!item) continue;
    for (const envName of item.schema.envVars) clearEnv(envName);
  }
}

export function listConnectionAccess() {
  const store = readStore();
  const catalog = [
    ...CONNECTION_CATALOG,
    ...store.custom.map((c) => ({
      id: c.id,
      name: c.name,
      group: "Harici",
      description: c.description || "Harici uygulama",
      schema: {
        protocol: "HTTPS",
        baseUrl: "özel",
        auth: "API key",
        envVars: c.envVars,
        endpoints: ["özel"],
      },
    })),
  ];

  const connections = catalog.map((item) => {
    const enabled = !store.disabled.includes(item.id);
    const displayName = store.displayNames[item.id] || item.name;
    const envStatus = item.schema.envVars.map((name) => {
      const { configured, masked } = maskSecret(process.env[name]);
      return { name, configured, masked };
    });
    const configured = envStatus.some((e) => e.configured);
    const extraKeys = store.keys
      .filter((k) => k.connectionId === item.id)
      .map((k) => ({
        id: k.id,
        envName: k.envName,
        label: k.label,
        masked: maskSecret(k.value).masked,
        createdAt: k.createdAt,
      }));
    return {
      id: item.id,
      name: displayName,
      catalogName: item.name,
      group: item.group,
      description: item.description,
      enabled,
      configured,
      schema: item.schema,
      envStatus,
      extraKeys,
    };
  });

  return { connections, brand: getDestinationBrand() };
}

export function setConnectionEnabled(id: string, enabled: boolean): { ok: boolean; error?: string } {
  const item = catalogById(id);
  if (!item) return { ok: false, error: "Bağlantı bulunamadı" };
  const store = readStore();
  store.disabled = store.disabled.filter((x) => x !== id);
  if (!enabled) store.disabled.push(id);
  writeStore(store);

  if (enabled) {
    for (const envName of item.schema.envVars) restoreEnv(envName);
    for (const key of store.keys.filter((k) => k.connectionId === id)) {
      if (item.schema.envVars.includes(key.envName)) applyKey(key.envName, key.value);
    }
  } else {
    for (const envName of item.schema.envVars) clearEnv(envName);
  }
  return { ok: true };
}

export function addConnectionApiKey(input: {
  connectionId?: string;
  connectionName: string;
  value: string;
  label?: string;
}): { ok: boolean; error?: string; id?: string } {
  const connectionName = String(input.connectionName || "").trim();
  const value = String(input.value || "").trim();
  if (connectionName.length < 2) return { ok: false, error: "Bağlantı adı en az 2 karakter olmalı" };
  if (value.length < 8) return { ok: false, error: "Anahtar en az 8 karakter olmalı" };

  const store = readStore();
  let connectionId = String(input.connectionId || "").trim();

  if (!connectionId || connectionId === "custom") {
    const id = `custom-${slugifyName(connectionName)}`;
    const envName = `CUSTOM_${id.replace(/-/g, "_").toUpperCase()}_KEY`;
    if (!store.custom.some((c) => c.id === id)) {
      store.custom.push({
        id,
        name: connectionName,
        description: "Harici uygulama",
        envVars: [envName],
      });
    }
    connectionId = id;
    store.displayNames[connectionId] = connectionName;
    const keyId = `key_${Date.now().toString(36)}`;
    store.keys.push({
      id: keyId,
      connectionId,
      envName,
      value,
      label: String(input.label || connectionName).trim(),
      createdAt: new Date().toISOString(),
    });
    writeStore(store);
    if (!store.disabled.includes(connectionId)) applyKey(envName, value);
    return { ok: true, id: keyId };
  }

  const item = catalogById(connectionId);
  if (!item) return { ok: false, error: "Bağlantı bulunamadı" };

  store.displayNames[connectionId] = connectionName;
  const envName =
    item.schema.envVars.find((n) => /TOKEN|KEY|SECRET/i.test(n)) || item.schema.envVars[0];
  if (!envName) return { ok: false, error: "Bu bağlantı için kayıt alanı yok" };

  const keyId = `key_${Date.now().toString(36)}`;
  store.keys.push({
    id: keyId,
    connectionId,
    envName,
    value,
    label: String(input.label || connectionName).trim(),
    createdAt: new Date().toISOString(),
  });
  writeStore(store);
  if (!store.disabled.includes(connectionId)) applyKey(envName, value);
  return { ok: true, id: keyId };
}

export function renameConnection(id: string, name: string): { ok: boolean; error?: string } {
  const item = catalogById(id);
  if (!item) return { ok: false, error: "Bağlantı bulunamadı" };
  const clean = String(name || "").trim();
  if (clean.length < 2) return { ok: false, error: "Bağlantı adı en az 2 karakter olmalı" };
  const store = readStore();
  store.displayNames[id] = clean;
  const custom = store.custom.find((c) => c.id === id);
  if (custom) custom.name = clean;
  writeStore(store);
  return { ok: true };
}

export function isConnectionEnabled(id: string): boolean {
  return !readStore().disabled.includes(id);
}
