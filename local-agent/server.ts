import "dotenv/config";
import express from "express";
import { scrapeTrendyolForLocalAgent } from "./scrape-handler";

const PORT = Number(process.env.LOCAL_AGENT_PORT ?? 3847);
const TOKEN = process.env.LOCAL_AGENT_TOKEN?.trim();

if (!TOKEN) {
  console.error("❌ LOCAL_AGENT_TOKEN tanımlı değil — agent başlatılamıyor.");
  console.error("   Örnek: $env:LOCAL_AGENT_TOKEN=\"gizli-token\"");
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "local-scrape-agent",
    version: "1.0.0",
    port: PORT,
  });
});

function extractToken(req: express.Request): string | null {
  const header = req.headers["x-agent-token"];
  if (typeof header === "string" && header.trim()) return header.trim();
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    return auth.slice(7).trim();
  }
  return null;
}

app.post("/scrape", async (req, res) => {
  const token = extractToken(req);
  if (!token || token !== TOKEN) {
    return res.status(401).json({
      success: false,
      source: "local_agent",
      error: "unauthorized",
      userMessage: "Geçersiz agent token.",
    });
  }

  const url = String(req.body?.url ?? "").trim();
  if (!url || !url.includes("trendyol.com")) {
    return res.status(400).json({
      success: false,
      source: "local_agent",
      error: "invalid-url",
      userMessage: "Geçerli bir Trendyol ürün URL'si gerekli.",
    });
  }

  console.log(`📥 [Agent] Scrape isteği: ${url.slice(0, 80)}...`);
  const result = await scrapeTrendyolForLocalAgent(url);

  if (result.success) {
    console.log(
      `✅ [Agent] Başarılı: "${result.title}" — ${result.price.original} TL, ${result.images.length} görsel (${result.rawDiagnostics.durationMs}ms)`,
    );
    return res.json(result);
  }

  console.warn(`⚠️ [Agent] Başarısız: ${result.error} (${result.rawDiagnostics?.durationMs ?? 0}ms)`);
  return res.status(422).json(result);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Local Scrape Agent running on http://localhost:${PORT}`);
  console.log(`   GET  /health`);
  console.log(`   POST /scrape  (header: x-agent-token)`);
});
