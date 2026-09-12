import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const target = path.join(root, "client/src/components/AppRoutes.tsx");
let src = fs.readFileSync(target, "utf8");

if (!src.includes('import MainDashboard from "@/pages/main-dashboard";')) {
  src = src.replace(
    'import MarketplaceSelection from "@/pages/marketplace-selection";',
    'import MarketplaceSelection from "@/pages/marketplace-selection";\nimport MainDashboard from "@/pages/main-dashboard";',
  );
}

src = src.replace(
  '<Route path="/">\n        <PageTransition>\n          <MarketplaceSelection />\n        </PageTransition>\n      </Route>',
  '<Route path="/">\n        <PageTransition>\n          <MainDashboard />\n        </PageTransition>\n      </Route>',
);

if (!src.includes('<MainDashboard />')) {
  throw new Error('[legacy-home] ana rota MainDashboard olarak ayarlanamadi');
}

fs.writeFileSync(target, src);
console.log('[legacy-home] / rotasi MainDashboard olarak geri yuklendi');
