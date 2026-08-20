// Browser Worker hızlı başlangıç profili.
// Railway/yerel env'de açıkça verilen değerler varsa onları ezme.
process.env.BROWSER_NAV_TIMEOUT_MS ||= "20000";

console.log("⚡ Browser Worker hızlı profil", {
  navigationTimeoutMs: process.env.BROWSER_NAV_TIMEOUT_MS,
  scrapeDeadlineMs: process.env.BROWSER_SCRAPE_DEADLINE_MS || "95000(default)",
});

await import("./dist/server.js");
