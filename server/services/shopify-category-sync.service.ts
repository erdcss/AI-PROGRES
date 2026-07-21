import { shopifyAdminGraphql } from "../shopify-token-manager";

type ShopifyCollection = {
  id: string;
  title: string;
  handle: string;
};

type ShopifyProduct = {
  id: string;
  title: string;
  handle: string;
  tags: string[];
  collections: { nodes: ShopifyCollection[] };
};

type ProductsPage = {
  products: {
    nodes: ShopifyProduct[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};

export type ShopifyCategorySyncResult = {
  syncedAt: string;
  totalProducts: number;
  taggedProducts: number;
  untaggedProducts: number;
  tags: Array<{
    tag: string;
    productCount: number;
    collections: Array<{
      id: string | null;
      title: string;
      handle: string | null;
      productCount: number;
    }>;
  }>;
  collections: Array<{
    id: string;
    title: string;
    handle: string;
    taggedProductCount: number;
    tags: string[];
  }>;
};

const PRODUCTS_QUERY = `
  query CategoryProducts($cursor: String) {
    products(first: 100, after: $cursor, query: "status:active") {
      nodes {
        id
        title
        handle
        tags
        collections(first: 50) {
          nodes { id title handle }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export async function syncShopifyCategorySummary(): Promise<ShopifyCategorySyncResult> {
  const products: ShopifyProduct[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < 100; page++) {
    const result = await shopifyAdminGraphql<ProductsPage>(PRODUCTS_QUERY, { cursor });
    if (!result.response.ok || result.errors || !result.data?.products) {
      throw new Error(
        `Shopify kategori verileri alınamadı (HTTP ${result.response.status})`,
      );
    }
    products.push(...result.data.products.nodes);
    const pageInfo = result.data.products.pageInfo;
    if (!pageInfo.hasNextPage) break;
    if (!pageInfo.endCursor || pageInfo.endCursor === cursor) {
      throw new Error("Shopify ürün sayfalaması tamamlanamadı");
    }
    cursor = pageInfo.endCursor;
  }

  const tagMap = new Map<
    string,
    {
      label: string;
      products: Set<string>;
      collections: Map<string, { collection: ShopifyCollection | null; products: Set<string> }>;
    }
  >();
  const collectionMap = new Map<
    string,
    { collection: ShopifyCollection; products: Set<string>; tags: Set<string> }
  >();

  for (const product of products) {
    const tags = [...new Set((product.tags ?? []).map((tag) => tag.trim()).filter(Boolean))];
    for (const tag of tags) {
      const tagKey = tag.toLocaleLowerCase("tr-TR");
      let tagEntry = tagMap.get(tagKey);
      if (!tagEntry) {
        tagEntry = { label: tag, products: new Set(), collections: new Map() };
        tagMap.set(tagKey, tagEntry);
      }
      tagEntry.products.add(product.id);

      const collections = product.collections?.nodes ?? [];
      const targets = collections.length > 0 ? collections : [null];
      for (const collection of targets) {
        const collectionKey = collection?.id ?? "__unassigned__";
        let relation = tagEntry.collections.get(collectionKey);
        if (!relation) {
          relation = { collection, products: new Set() };
          tagEntry.collections.set(collectionKey, relation);
        }
        relation.products.add(product.id);

        if (collection) {
          let collectionEntry = collectionMap.get(collection.id);
          if (!collectionEntry) {
            collectionEntry = {
              collection,
              products: new Set(),
              tags: new Set(),
            };
            collectionMap.set(collection.id, collectionEntry);
          }
          collectionEntry.products.add(product.id);
          collectionEntry.tags.add(tag);
        }
      }
    }
  }

  const taggedProducts = products.filter((product) => product.tags?.length > 0).length;
  return {
    syncedAt: new Date().toISOString(),
    totalProducts: products.length,
    taggedProducts,
    untaggedProducts: products.length - taggedProducts,
    tags: [...tagMap.values()]
      .map((entry) => ({
        tag: entry.label,
        productCount: entry.products.size,
        collections: [...entry.collections.values()]
          .map(({ collection, products: relationProducts }) => ({
            id: collection?.id ?? null,
            title: collection?.title ?? "Koleksiyonsuz",
            handle: collection?.handle ?? null,
            productCount: relationProducts.size,
          }))
          .sort((a, b) => b.productCount - a.productCount || a.title.localeCompare(b.title, "tr")),
      }))
      .sort((a, b) => b.productCount - a.productCount || a.tag.localeCompare(b.tag, "tr")),
    collections: [...collectionMap.values()]
      .map(({ collection, products: collectionProducts, tags }) => ({
        ...collection,
        taggedProductCount: collectionProducts.size,
        tags: [...tags].sort((a, b) => a.localeCompare(b, "tr")),
      }))
      .sort(
        (a, b) =>
          b.taggedProductCount - a.taggedProductCount || a.title.localeCompare(b.title, "tr"),
      ),
  };
}
