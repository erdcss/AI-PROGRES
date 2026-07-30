import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getShopifyClientCredentials,
  isShopifyAppSharedSecret,
  normalizeShopDomain,
  resolveTokenGrantClientSecret,
  hasUsableClientSecretForRefresh,
} from "../shopify-credentials.ts";

describe("shopify credentials — shared secret vs client secret", () => {
  const keys = [
    "SHOPIFY_SHOP_DOMAIN",
    "SHOPIFY_CLIENT_ID",
    "SHOPIFY_CLIENT_SECRET",
    "SHOPIFY_CLIENT_SECRET_KEY",
    "secret_key",
    "SHOPIFY_APP_SHARED_SECRET",
    "SHOPIFY_API_KEY",
  ] as const;
  const backup: Record<string, string | undefined> = {};

  function snapshot() {
    for (const k of keys) backup[k] = process.env[k];
  }
  function restore() {
    for (const k of keys) {
      if (backup[k] === undefined) delete process.env[k];
      else process.env[k] = backup[k];
    }
  }

  it("rejects shpss_ as client_credentials secret", () => {
    snapshot();
    try {
      process.env.SHOPIFY_SHOP_DOMAIN = "demo.myshopify.com";
      process.env.SHOPIFY_CLIENT_ID = "cid";
      process.env.SHOPIFY_CLIENT_SECRET = "shpss_shared_only";
      delete process.env.SHOPIFY_CLIENT_SECRET_KEY;
      delete process.env.secret_key;
      delete process.env.SHOPIFY_APP_SHARED_SECRET;
      assert.equal(isShopifyAppSharedSecret("shpss_shared_only"), true);
      assert.equal(resolveTokenGrantClientSecret(), "");
      assert.equal(getShopifyClientCredentials(), null);
      assert.equal(hasUsableClientSecretForRefresh(), false);
    } finally {
      restore();
    }
  });

  it("accepts shpsec_ client secret", () => {
    snapshot();
    try {
      process.env.SHOPIFY_SHOP_DOMAIN = "demo.myshopify.com";
      process.env.SHOPIFY_CLIENT_ID = "cid";
      process.env.SHOPIFY_CLIENT_SECRET = "shpsec_dashboard_secret";
      assert.ok(getShopifyClientCredentials());
      assert.equal(hasUsableClientSecretForRefresh(), true);
    } finally {
      restore();
    }
  });

  it("normalizes shop domain", () => {
    assert.equal(
      normalizeShopDomain("https://Demo.myshopify.com/admin/"),
      "Demo.myshopify.com",
    );
    assert.equal(
      normalizeShopDomain("https://store.myshopify.com/"),
      "store.myshopify.com",
    );
  });
});
