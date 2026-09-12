import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function patch(relativePath, edits) {
  const file = path.join(root, relativePath);
  let src = fs.readFileSync(file, "utf8");
  for (const { from, to, label } of edits) {
    if (src.includes(to)) continue;
    if (!src.includes(from)) throw new Error(`[marktgo-health-fix] ${label} pattern not found in ${relativePath}`);
    src = src.replace(from, to);
  }
  fs.writeFileSync(file, src);
}

patch("server/services/marktgo/connection.service.ts", [
  {
    label: "probe fallback",
    from: `export async function probeMarktGoHealth(baseUrl: string, token: string) {\n  const client = createMarktGoClient({ baseUrl, accessToken: token, timeoutMs: 15_000 });\n  const raw = await client.get<unknown>("/me");\n  const { me, scopes } = extractMe(raw);\n  const missing = missingRequiredScopes(scopes);\n  return { me, scopes, missing };\n}`,
    to: `export async function probeMarktGoHealth(baseUrl: string, token: string) {\n  const client = createMarktGoClient({ baseUrl, accessToken: token, timeoutMs: 15_000 });\n  try {\n    const raw = await client.get<unknown>("/me");\n    const { me, scopes } = extractMe(raw);\n    const missing = missingRequiredScopes(scopes);\n    return { me, scopes, missing };\n  } catch (err) {\n    const status = Number((err as any)?.status || 0);\n    // Bazı MARKT-GO sürümlerinde /me endpoint'i bulunmayabilir.\n    // Auth hatalarını asla gizleme; yalnız endpoint-yok durumunda gerçek katalog isteğiyle doğrula.\n    if (status !== 404 && status !== 405) throw err;\n    await client.get<unknown>("/products?limit=1");\n    return { me: {} as MarktGoMe, scopes: [], missing: [] };\n  }\n}`,
  },
  {
    label: "safe env diagnostic",
    from: `  const token = String(process.env.MARKTGO_ACCESS_TOKEN || "").trim();\n  if (!token || !looksLikeMarktGoToken(token)) return false;`,
    to: `  const token = String(process.env.MARKTGO_ACCESS_TOKEN || "").trim();\n  const validTokenFormat = Boolean(token && looksLikeMarktGoToken(token));\n  if (!validTokenFormat) {\n    console.warn("[marktgo] Railway MARKTGO_ACCESS_TOKEN kullanılamıyor", {\n      configured: Boolean(token),\n      validFormat: validTokenFormat,\n      prefix: token ? token.slice(0, Math.min(9, token.length)) : "",\n      length: token.length,\n    });\n    return false;\n  }`,
  },
]);

patch("server/routes/marktgo-routes.ts", [
  {
    label: "health real error",
    from: `      return res.json({\n        success: connection.status === "connected" || connection.status === "connected_limited",\n        provider: DESTINATION_PROVIDER.MARKTGO,\n        connection,\n      });`,
    to: `      const success = connection.status === "connected" || connection.status === "connected_limited";\n      if (!success) {\n        console.error("[marktgo] health verification failed", {\n          connectionId: connection.id,\n          status: connection.status,\n          apiBaseUrl: connection.apiBaseUrl,\n          environment: connection.environment,\n          lastError: connection.lastError,\n        });\n      }\n      return res.json({\n        success,\n        provider: DESTINATION_PROVIDER.MARKTGO,\n        connection,\n        error: success ? undefined : connection.lastError || "MARKT-GO bağlantısı doğrulanamadı.",\n      });`,
  },
]);

console.log("[marktgo-health-fix] health fallback + exact error diagnostics enabled");
