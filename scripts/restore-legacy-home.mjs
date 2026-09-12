import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const target = path.join(root, "client/src/components/AppRoutes.tsx");
let src = fs.readFileSync(target, "utf8");

// Keep the original ORVIAN page; builds must not substitute a second dashboard.
src = src.replace(/^import BlackMainDashboard from "@\/pages\/black-main-dashboard";\r?\n/gm, "");

src = src.replace(
  /<Route path="\/">\s*<PageTransition>\s*<(?:MarketplaceSelection|MainDashboard|BlackMainDashboard) \/>\s*<\/PageTransition>\s*<\/Route>/,
  '<Route path="/">\n        <PageTransition>\n          <MarketplaceSelection />\n        </PageTransition>\n      </Route>',
);

if (!src.includes('<MarketplaceSelection />')) {
  throw new Error('[legacy-home] orijinal ORVIAN ana menusu bulunamadi');
}

fs.writeFileSync(target, src);
console.log('[legacy-home] / rotasi orijinal ORVIAN ana menusu olarak korundu');
