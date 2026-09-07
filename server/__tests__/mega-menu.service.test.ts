import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeMegaLabelKey,
  parseMegaMenuSummary,
  publicWebSiteSettingsUrl,
  resolveMegaMenuForTag,
} from "../services/marktgo/mega-menu.service";

describe("mega-menu.service", () => {
  it("builds public web-site-settings URL from external API base", () => {
    assert.equal(
      publicWebSiteSettingsUrl("https://api.turmarkt.com/api/v1/external"),
      "https://api.turmarkt.com/api/public/web-site-settings",
    );
  });

  it("parses desktop mega menu tops and category_list groups", () => {
    const summary = parseMegaMenuSummary({
      megaMenu: {
        desktop: {
          menuItems: [
            {
              label: "Kadın",
              enabled: true,
              categoryId: 305,
              blocks: [
                {
                  type: "category_list",
                  title: "Giyim",
                  visible: true,
                  items: [
                    { label: "Tümünü Gör", categoryId: 316, visible: true },
                    { label: "Elbise", categoryId: 317, visible: true },
                    { label: "Tişört", categoryId: 318, visible: true },
                  ],
                },
                {
                  type: "featured_category",
                  title: "Kampanya",
                  items: [],
                },
              ],
            },
          ],
        },
      },
    });

    assert.equal(summary.tops.length, 1);
    assert.equal(summary.tops[0].label, "Kadın");
    assert.equal(summary.tops[0].groups.length, 1);
    assert.equal(summary.tops[0].groups[0].title, "Giyim");
    assert.deepEqual(
      summary.tops[0].groups[0].items.map((i) => i.label),
      ["Elbise", "Tişört"],
    );
  });

  it("resolves tag to top / group / leaf", () => {
    const tops = parseMegaMenuSummary({
      megaMenu: {
        desktop: {
          menuItems: [
            {
              label: "Kadın",
              enabled: true,
              blocks: [
                {
                  type: "category_list",
                  title: "Giyim",
                  items: [
                    { label: "Elbise", categoryId: 1 },
                    { label: "Pantolon", categoryId: 2 },
                  ],
                },
              ],
            },
            {
              label: "Erkek",
              enabled: true,
              blocks: [
                {
                  type: "category_list",
                  title: "Giyim",
                  items: [{ label: "Gömlek", categoryId: 3 }],
                },
              ],
            },
          ],
        },
      },
    }).tops;

    assert.equal(normalizeMegaLabelKey("Kadın"), "kadın");
    assert.equal(resolveMegaMenuForTag(tops, "kadın").matchType, "top");
    assert.equal(resolveMegaMenuForTag(tops, "giyim").matchType, "group");
    assert.equal(resolveMegaMenuForTag(tops, "giyim").tops.length, 2);
    assert.equal(resolveMegaMenuForTag(tops, "elbise").matchType, "item");
    assert.equal(resolveMegaMenuForTag(tops, "elbise").tops[0].label, "Kadın");
    assert.equal(resolveMegaMenuForTag(tops, "xyz-yok").matchType, "none");
  });
});
