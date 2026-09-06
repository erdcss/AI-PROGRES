import assert from "node:assert/strict";
import { extractTrendyolCategoryProducts } from "../trendyol-category-discovery";

const base = "https://www.trendyol.com/kadin-canta-x-g1-c117";

const html = `
<html><body>
  <a href="/rimense/kadin-aci-kahverengi-suet-aci-kahverengi-suni-deri-fermuarli-astarli-el-ve-omuz-cantasi-p-992046791?boutiqueId=61&merchantId=123" title="Rimense Kadın Çanta">
    <img src="https://cdn.dsmcdn.com/test.jpg" />
  </a>
  <script>
    window.__DATA__ = {"url":"https:\\/\\/www.trendyol.com\\/baglovis\\/kadin-capraz-omuz-cantasi-p-1186733340?boutiqueId=61"};
  </script>
</body></html>`;

const rows = extractTrendyolCategoryProducts(html, base);
assert.equal(rows.length, 2);
assert.equal(rows[0].productId, "992046791");
assert.equal(rows[0].url, "https://www.trendyol.com/rimense/kadin-aci-kahverengi-suet-aci-kahverengi-suni-deri-fermuarli-astarli-el-ve-omuz-cantasi-p-992046791");
assert.equal(rows[0].title, "Rimense Kadın Çanta");
assert.equal(rows[1].productId, "1186733340");
assert.equal(rows[1].url, "https://www.trendyol.com/baglovis/kadin-capraz-omuz-cantasi-p-1186733340");

console.log("trendyol-category-discovery.test: ok");
