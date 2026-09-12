import fs from "node:fs";
import path from "node:path";

const target = path.join(process.cwd(), "client/src/components/TrendyolCategoryBulkDrawer.tsx");
let src = fs.readFileSync(target, "utf8");

src = src.replace(
  'import { ChevronDown, Layers3, Loader2, PackageSearch, Play, X } from "lucide-react";',
  'import { ChevronDown, ClipboardPaste, Layers3, Loader2, PackageSearch, Play, X } from "lucide-react";',
);

const stateAnchor = '  const [lastFound, setLastFound] = useState<number | null>(null);';
if (!src.includes('const pasteCategoryUrl = useCallback(async () =>')) {
  src = src.replace(
    stateAnchor,
    `${stateAnchor}\n\n  const pasteCategoryUrl = useCallback(async () => {\n    if (loading) return;\n    try {\n      const text = (await navigator.clipboard.readText()).trim();\n      if (!text) {\n        toast({ title: "Panoda bağlantı yok", description: "Önce Trendyol kategori veya arama URL'sini kopyalayın." });\n        return;\n      }\n      setUrl(text);\n    } catch {\n      toast({\n        title: "Yapıştırma izni gerekli",\n        description: "Tarayıcı pano erişimini engelledi. URL alanına basılı tutup Yapıştır seçeneğini kullanabilirsiniz.",\n        variant: "destructive",\n      });\n    }\n  }, [loading]);`,
  );
}

const inputBlock = `                  <Input\n                    value={url}\n                    onChange={(event) => setUrl(event.target.value)}\n                    placeholder="https://www.trendyol.com/kadin-canta-x-g1-c117"\n                    className="business-input h-11 border-zinc-800 bg-zinc-900/70 text-sm"\n                    disabled={loading}\n                    data-testid="input-trendyol-category-url"\n                  />`;

const replacement = `                  <div className="relative">\n                    <Input\n                      value={url}\n                      onChange={(event) => setUrl(event.target.value)}\n                      placeholder="https://www.trendyol.com/kadin-canta-x-g1-c117"\n                      className="business-input h-11 border-zinc-800 bg-zinc-900/70 pr-24 text-sm"\n                      disabled={loading}\n                      data-testid="input-trendyol-category-url"\n                    />\n                    <button\n                      type="button"\n                      onClick={() => void pasteCategoryUrl()}\n                      disabled={loading}\n                      className="absolute right-1.5 top-1/2 flex h-8 -translate-y-1/2 items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-800/90 px-2.5 text-xs font-medium text-zinc-200 transition hover:bg-zinc-700 disabled:opacity-50"\n                      data-testid="button-paste-trendyol-category-url"\n                    >\n                      <ClipboardPaste className="h-3.5 w-3.5" />\n                      Yapıştır\n                    </button>\n                  </div>`;

if (!src.includes('data-testid="button-paste-trendyol-category-url"')) {
  if (!src.includes(inputBlock)) throw new Error("[category-paste] URL input anchor not found");
  src = src.replace(inputBlock, replacement);
}

fs.writeFileSync(target, src);
console.log("[category-paste] Trendyol category URL paste button enabled");
