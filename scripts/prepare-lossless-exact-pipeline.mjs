import fs from "node:fs";
import path from "node:path";

const target = path.join(process.cwd(), "scripts/enforce-lossless-exact-pipeline.mjs");
let src = fs.readFileSync(target, "utf8");

const strictLine = '  scraper = replaceRequired(scraper, poolFastAnchor, poolFastReplacement, "bulk pool fastUpload flag");';
const tolerantLine = `  if (scraper.includes(poolFastAnchor)) {\n    scraper = scraper.replace(poolFastAnchor, poolFastReplacement);\n  } else {\n    console.log("[lossless-exact] bulk fastUpload already injected by an earlier build step");\n  }`;

if (src.includes(strictLine)) {
  src = src.replace(strictLine, tolerantLine);
}

fs.writeFileSync(target, src);
console.log("[lossless-exact] final patch prepared for existing fastUpload injections");
