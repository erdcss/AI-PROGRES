process.env.NODE_ENV = "production";

console.log("");
console.log("========================================");
console.log("  Turmarkt — Kararlı mod (Vite kapalı)");
console.log("========================================");
console.log("  Veri çekme / scraper için önerilen başlatma.");
console.log("  Kod geliştirme için: npm run dev");
console.log("========================================");
console.log("");

await import("../dist/index.js");
