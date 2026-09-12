import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const target = path.join(root, "client/src/components/AppRoutes.tsx");
let src = fs.readFileSync(target, "utf8");

if (!src.includes('import BlackMainDashboard from "@/pages/black-main-dashboard";')) {
  src = src.replace(
    'import MarketplaceSelection from "@/pages/marketplace-selection";',
    'import MarketplaceSelection from "@/pages/marketplace-selection";\nimport BlackMainDashboard from "@/pages/black-main-dashboard";',
  );
}

src = src.replace(
  /<Route path="\/">\s*<PageTransition>\s*<(?:MarketplaceSelection|MainDashboard|BlackMainDashboard) \/>\s*<\/PageTransition>\s*<\/Route>/,
  '<Route path="/">\n        <PageTransition>\n          <BlackMainDashboard />\n        </PageTransition>\n      </Route>',
);

if (!src.includes('<BlackMainDashboard />')) {
  throw new Error('[legacy-home] ana rota BlackMainDashboard olarak ayarlanamadi');
}

fs.writeFileSync(target, src);
console.log('[legacy-home] / rotasi siyah ORVIAN dashboard olarak ayarlandi');
