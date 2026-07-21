/**
 * Shopify client_credentials token yaşam döngüsü testleri.
 *
 * Gerçek network/DB olmadan, dependency-injection seam'i (__setShopifyTokenManagerTestDeps)
 * üzerinden çalışır. Kapsanan senaryolar (A-I):
 *   A. Cache'te 2 saat kalan token yeni token almamalı.
 *   B. Cache'te 59 dk kalan client_credentials token yenilenmeli.
 *   C. DB'de geçerli eski geçici token olsa bile proactive refresh onu kullanmamalı.
 *   D. forceRefresh ENV/DB tokenını atlayıp yeni token almalı.
 *   E. Paralel 10 çağrı tek exchange yapmalı.
 *   F. İlk 401'de bir kez yeni token alıp isteği tekrar etmeli.
 *   G. İkinci 401'de sonsuz tekrar olmamalı.
 *   H. expires_in yoksa güvenli fallback uygulanmalı.
 *   I. Token/secret hiçbir logda açık görünmemeli.
 */
import {
  __setShopifyTokenManagerTestDeps,
  __resetShopifyTokenManagerTestDeps,
  getValidShopifyAccessToken,
  proactiveRefreshShopifyToken,
  setShopifyTokenCache,
  invalidateShopifyTokenCache,
  getTokenCacheStatus,
  shopifyAdminFetch,
} from '../shopify-token-manager';
import {
  resolveTokenGrantClientSecret,
  getShopifyClientCredentials,
  hasUsableClientSecretForRefresh,
} from '../shopify-credentials';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

const DOMAIN = 'test-shop.myshopify.com';
const CREDS = {
  clientId: 'cid_test_123',
  clientSecret: 'shpsec_super_secret_full_value_do_not_log',
  shopDomain: DOMAIN,
};
const NEW_TOKEN = 'shpat_new_full_token_value_ABCDEFGHIJ_1234567890';
const SEED_TOKEN = 'shpat_seed_cached_full_token_value_9876543210';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

interface FetchConfig {
  accessToken?: string;
  /** null → expires_in alanı hiç dönmez */
  expiresIn?: number | null;
  probeStatus?: number;
  adminStatus?: number | ((callIndex: number) => number);
}

function makeFetch(cfg: FetchConfig = {}) {
  const calls = { oauth: 0, probe: 0, admin: 0 };
  const impl = (async (input: unknown, _init?: unknown): Promise<Response> => {
    const url = String(input);
    if (url.includes('/admin/oauth/access_token')) {
      calls.oauth++;
      const body: Record<string, unknown> = { access_token: cfg.accessToken ?? NEW_TOKEN };
      if (cfg.expiresIn !== null) body.expires_in = cfg.expiresIn ?? 86400;
      return json(200, body);
    }
    if (url.includes('/shop.json')) {
      calls.probe++;
      const st = cfg.probeStatus ?? 200;
      return json(st, st === 200 ? { shop: { name: 'Test' } } : { errors: 'invalid' });
    }
    calls.admin++;
    const st =
      typeof cfg.adminStatus === 'function' ? cfg.adminStatus(calls.admin) : cfg.adminStatus ?? 200;
    return json(st, st === 200 ? { count: 7 } : { errors: 'unauthorized' });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

function baseDeps(over: Partial<Parameters<typeof __setShopifyTokenManagerTestDeps>[0]> = {}) {
  return {
    getShopDomain: () => DOMAIN,
    getClientCredentials: () => ({ ...CREDS }),
    getEnvAdminTokens: () => [],
    clearEnvAdminTokens: () => undefined,
    readDbToken: async () => null,
    saveDbToken: async () => undefined,
    invalidateDbToken: async () => undefined,
    ...over,
  };
}

async function run() {
  console.log('\n=== Shopify Token Lifecycle ===\n');

  // A. Cache'te 2 saat kalan token yeni token almamalı.
  {
    const { impl, calls } = makeFetch();
    __setShopifyTokenManagerTestDeps(baseDeps({ fetchImpl: impl }));
    setShopifyTokenCache({
      accessToken: SEED_TOKEN,
      shopDomain: DOMAIN,
      source: 'client_credentials',
      expiresInSeconds: 2 * 3600,
    });
    const t = await getValidShopifyAccessToken();
    assert(t.source === 'cache', 'A: 2 saat kalan token cache olarak döner');
    assert(calls.oauth === 0, 'A: yeni token exchange yapılmaz');
  }

  // B. Cache'te 59 dk kalan client_credentials token yenilenmeli.
  {
    const { impl, calls } = makeFetch();
    __setShopifyTokenManagerTestDeps(baseDeps({ fetchImpl: impl }));
    setShopifyTokenCache({
      accessToken: SEED_TOKEN,
      shopDomain: DOMAIN,
      source: 'client_credentials',
      expiresInSeconds: 59 * 60,
    });
    const t = await getValidShopifyAccessToken();
    assert(calls.oauth === 1, 'B: 59 dk kalan token gerçek exchange ile yenilenir');
    assert(t.source === 'client_credentials', 'B: yenilenen token client_credentials kaynaklı');
  }

  // C. DB'de geçerli eski geçici token olsa bile proactive refresh onu kullanmamalı.
  {
    const { impl, calls } = makeFetch();
    let dbReads = 0;
    __setShopifyTokenManagerTestDeps(
      baseDeps({
        fetchImpl: impl,
        readDbToken: async () => {
          dbReads++;
          return 'shpat_old_stale_but_still_valid_db_token';
        },
      }),
    );
    setShopifyTokenCache({
      accessToken: SEED_TOKEN,
      shopDomain: DOMAIN,
      source: 'client_credentials',
      expiresInSeconds: 10 * 60,
    });
    const res = await proactiveRefreshShopifyToken(false);
    assert(res.success && res.source === 'client_credentials', 'C: proactive refresh client_credentials ile yeniler');
    assert(dbReads === 0, 'C: geçici DB token okunmaz/yeniden seçilmez');
    assert(calls.oauth === 1, 'C: gerçek client_credentials exchange yapılır');
  }

  // D. forceRefresh ENV/DB tokenını atlayıp yeni token almalı.
  {
    const { impl, calls } = makeFetch();
    let envRequested = false;
    let dbReads = 0;
    __setShopifyTokenManagerTestDeps(
      baseDeps({
        fetchImpl: impl,
        getEnvAdminTokens: () => {
          envRequested = true;
          return [{ token: 'shpat_env_admin_still_valid_token', source: 'env' as const }];
        },
        readDbToken: async () => {
          dbReads++;
          return 'shpat_db_admin_still_valid_token';
        },
      }),
    );
    setShopifyTokenCache({
      accessToken: SEED_TOKEN,
      shopDomain: DOMAIN,
      source: 'client_credentials',
      expiresInSeconds: 5 * 3600,
    });
    const t = await getValidShopifyAccessToken({ forceRefresh: true });
    assert(t.source === 'client_credentials', 'D: forceRefresh yeni client_credentials token alır');
    assert(calls.oauth === 1, 'D: gerçek exchange yapılır');
    assert(!envRequested, 'D: ENV access token adayı kullanılmaz');
    assert(dbReads === 0, 'D: DB access token adayı kullanılmaz');
  }

  // E. Paralel 10 çağrı tek exchange yapmalı.
  {
    const { impl, calls } = makeFetch();
    __setShopifyTokenManagerTestDeps(baseDeps({ fetchImpl: impl }));
    invalidateShopifyTokenCache();
    const results = await Promise.all(
      Array.from({ length: 10 }, () => getValidShopifyAccessToken()),
    );
    assert(calls.oauth === 1, 'E: 10 paralel çağrı yalnızca tek exchange yapar');
    assert(results.every((r) => r.source === 'client_credentials'), 'E: tüm çağrılar aynı yeni tokenı alır');
  }

  // F. İlk 401'de bir kez yeni token alıp isteği tekrar etmeli.
  {
    const { impl, calls } = makeFetch({ adminStatus: (n) => (n === 1 ? 401 : 200) });
    __setShopifyTokenManagerTestDeps(baseDeps({ fetchImpl: impl }));
    setShopifyTokenCache({
      accessToken: SEED_TOKEN,
      shopDomain: DOMAIN,
      source: 'client_credentials',
      expiresInSeconds: 5 * 3600,
    });
    const { response } = await shopifyAdminFetch('/products/count.json');
    assert(response.status === 200, 'F: 401 sonrası retry başarılı olur');
    assert(calls.admin === 2, 'F: istek yalnızca bir kez tekrar edilir');
    assert(calls.oauth === 1, 'F: yalnızca bir kez yeni token alınır');
  }

  // G. İkinci 401'de sonsuz tekrar olmamalı.
  {
    const { impl, calls } = makeFetch({ adminStatus: 401 });
    __setShopifyTokenManagerTestDeps(baseDeps({ fetchImpl: impl }));
    setShopifyTokenCache({
      accessToken: SEED_TOKEN,
      shopDomain: DOMAIN,
      source: 'client_credentials',
      expiresInSeconds: 5 * 3600,
    });
    const { response } = await shopifyAdminFetch('/products/count.json');
    assert(response.status === 401, 'G: sürekli 401 ise 401 döner');
    assert(calls.admin === 2, 'G: en fazla bir kez tekrar edilir (sonsuz döngü yok)');
    assert(calls.oauth === 1, 'G: yalnızca bir yenileme denenir');
  }

  // H. expires_in yoksa güvenli fallback uygulanmalı.
  {
    const { impl } = makeFetch({ expiresIn: null });
    __setShopifyTokenManagerTestDeps(baseDeps({ fetchImpl: impl }));
    invalidateShopifyTokenCache();
    const t = await getValidShopifyAccessToken();
    const status = getTokenCacheStatus();
    assert(t.source === 'client_credentials', 'H: expires_in yoksa token yine de alınır');
    assert(
      status.expiresInMs !== null && status.expiresInMs > 60 * 60 * 1000,
      'H: fallback ömür 1 saat buffer’ından uzun (cache geçerli sayılır)',
    );
    assert(
      status.expiresInMs !== null && status.expiresInMs <= 2 * 60 * 60 * 1000 + 1000,
      'H: fallback ömür güvenli biçimde 2 saati aşmaz',
    );
  }

  // I. Token/secret hiçbir logda açık görünmemeli.
  {
    const logs: string[] = [];
    const capture = (...args: unknown[]) => {
      logs.push(
        args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '),
      );
    };
    const origLog = console.log;
    const origWarn = console.warn;
    const origError = console.error;
    console.log = capture as typeof console.log;
    console.warn = capture as typeof console.warn;
    console.error = capture as typeof console.error;
    try {
      const { impl } = makeFetch({ adminStatus: (n) => (n === 1 ? 401 : 200) });
      __setShopifyTokenManagerTestDeps(baseDeps({ fetchImpl: impl }));
      invalidateShopifyTokenCache();
      await getValidShopifyAccessToken();
      await proactiveRefreshShopifyToken(true);
      setShopifyTokenCache({
        accessToken: SEED_TOKEN,
        shopDomain: DOMAIN,
        source: 'client_credentials',
        expiresInSeconds: 5 * 3600,
      });
      await shopifyAdminFetch('/products/count.json');
    } finally {
      console.log = origLog;
      console.warn = origWarn;
      console.error = origError;
    }
    const blob = logs.join('\n');
    assert(!blob.includes(NEW_TOKEN), 'I: access token tamamı loglara yazılmaz');
    assert(!blob.includes(SEED_TOKEN), 'I: cache tokenı tamamı loglara yazılmaz');
    assert(!blob.includes(CREDS.clientSecret), 'I: client secret loglara yazılmaz');
  }

  __resetShopifyTokenManagerTestDeps();

  // J. Client Secret prefix kabul testleri — gerçek env okuyan fonksiyonlar.
  //    Prefix (shpss_/shpsec_/prefixsiz) fark etmez; yalnızca boş secret reddedilir.
  {
    const backup = {
      SHOPIFY_SHOP_DOMAIN: process.env.SHOPIFY_SHOP_DOMAIN,
      SHOPIFY_CLIENT_ID: process.env.SHOPIFY_CLIENT_ID,
      SHOPIFY_CLIENT_SECRET: process.env.SHOPIFY_CLIENT_SECRET,
      SHOPIFY_CLIENT_SECRET_KEY: process.env.SHOPIFY_CLIENT_SECRET_KEY,
      secret_key: process.env.secret_key,
      SHOPIFY_APP_SHARED_SECRET: process.env.SHOPIFY_APP_SHARED_SECRET,
    };
    const setSecretEnv = (secret: string | undefined) => {
      process.env.SHOPIFY_SHOP_DOMAIN = DOMAIN;
      process.env.SHOPIFY_CLIENT_ID = 'cid_prefix_test';
      delete process.env.SHOPIFY_CLIENT_SECRET_KEY;
      delete process.env.secret_key;
      delete process.env.SHOPIFY_APP_SHARED_SECRET;
      if (secret === undefined) delete process.env.SHOPIFY_CLIENT_SECRET;
      else process.env.SHOPIFY_CLIENT_SECRET = secret;
    };

    const shpssSecret = 'shpss_real_dev_dashboard_secret_value';
    setSecretEnv(shpssSecret);
    assert(resolveTokenGrantClientSecret() === shpssSecret, 'J: shpss_ ile başlayan gerçek secret kabul edilir');
    assert(getShopifyClientCredentials() !== null, 'J: shpss_ secret ile credentials null dönmez');
    assert(hasUsableClientSecretForRefresh(), 'J: shpss_ secret yenileme için kullanılabilir');

    setSecretEnv('shpsec_dashboard_client_secret_value');
    assert(getShopifyClientCredentials() !== null, 'J: shpsec_ secret kabul edilir');

    setSecretEnv('plain_secret_without_prefix_1234567890');
    assert(getShopifyClientCredentials() !== null, 'J: prefixsiz secret token endpoint için kabul edilir');

    setSecretEnv(undefined);
    assert(getShopifyClientCredentials() === null, 'J: boş secret reddedilir');
    assert(!hasUsableClientSecretForRefresh(), 'J: boş secret yenileme için kullanılamaz');

    // Env'i geri yükle
    for (const [key, value] of Object.entries(backup)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  console.log(`\n=== Sonuç: ${passed} geçti, ${failed} başarısız ===\n`);
  // db Pool açık handle bıraktığından süreç kendiliğinden kapanmaz — açıkça çık.
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Test çalıştırma hatası:', err);
  process.exit(1);
});
