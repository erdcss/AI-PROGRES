import fs from "fs";

const files = [
  "server/shopify-export.ts",
  "server/shopify-export-new.ts",
  "shared/server/shopify-export.ts",
  "shared/server/shopify-export-new.ts",
];

for (const file of files) {
  if (!fs.existsSync(file)) continue;
  let c = fs.readFileSync(file, "utf8");
  c = c.replace(/row\.variant_inventory_policy:\s*"continue",\s*continue/g, 'row.variant_inventory_policy = "continue";');
  c = c.replace(/newRow\.variant_inventory_policy:\s*"continue",\s*continue/g, 'newRow.variant_inventory_policy = "continue";');
  c = c.replace(/row\.variant_inventory_policy:\s*"continue"';/g, 'row.variant_inventory_policy = "continue";');
  c = c.replace(/row\.variant_inventory_policy = "continue"(?!;)/g, 'row.variant_inventory_policy = "continue";');
  c = c.replace(/newRow\.variant_inventory_policy = "continue"(?!;)/g, 'newRow.variant_inventory_policy = "continue";');
  c = c.replace(/variant_inventory_policy:\s*"continue"',/g, 'variant_inventory_policy: "continue",');
  c = c.replace(/'variant_inventory_policy:\s*"continue"',/g, 'variant_inventory_policy: "continue",');
  c = c.replace(/'variant_inventory_policy:\s*"continue",/g, 'variant_inventory_policy: "continue",');
  c = c.replace(/'variant_inventory_policy: "continue",/g, 'variant_inventory_policy: "continue",');
  fs.writeFileSync(file, c);
  console.log("fixed", file);
}
