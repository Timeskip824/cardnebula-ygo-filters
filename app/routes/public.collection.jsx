import { unauthenticated } from "../shopify.server";

const SHOP_DOMAIN = "cardnebula-dev.myshopify.com";
const PUBLIC_SECRET = process.env.PUBLIC_COLLECTION_SECRET || "";

const COLLECTION_QUERY = `#graphql
  query CollectionProductsPage($handle: String!, $cursor: String) {
    collectionByIdentifier(identifier: { handle: $handle }) {
      id
      handle
      title
      products(first: 100, after: $cursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          title
          handle
          featuredImage {
            url
            altText
          }
          priceRangeV2 {
            minVariantPrice {
              amount
              currencyCode
            }
          }
          setCode: metafield(namespace: "custom", key: "set_code") { value }
          releaseDate: metafield(namespace: "custom", key: "release_date") { value }
          rarity: metafield(namespace: "custom", key: "rarity") { value }
          status: metafield(namespace: "custom", key: "status") { value }
          rank: metafield(namespace: "custom", key: "rank") { value }
          pendulumScale: metafield(namespace: "custom", key: "pendulum_scale") { value }
          atk: metafield(namespace: "custom", key: "atk") { value }
          def: metafield(namespace: "custom", key: "def") { value }
          level: metafield(namespace: "custom", key: "level") { value }
          type: metafield(namespace: "custom", key: "type") { value }
          attribute: metafield(namespace: "custom", key: "attribute") { value }
          subtype: metafield(namespace: "custom", key: "subtype") { value }
          cardType: metafield(namespace: "custom", key: "card_type") { value }
        }
      }
    }
  }
`;

const RARITY_ORDER = [
  "Common",
  "Rare",
  "Super Rare",
  "Ultra Rare",
  "Silver Ultra Rare",
  "Blue Ultra Rare",
  "Red Ultra Rare",
  "Purple Ultra Rare",
  "Green Ultra Rare",
  "Ultra Parallel Rare",
  "Starfoil Rare",
  "Gold Rare",
  "Premium Gold Rare",
  "Gold Secret Rare",
  "Secret Rare",
  "Platinum Secret Rare",
  "Quarter Century Secret Rare",
  "Ultimate Rare",
  "Ghost Rare",
  "Gold Ghost Rare",
  "Special"
];

const rarityRankMap = Object.fromEntries(
  RARITY_ORDER.map((value, index) => [value.toLowerCase(), index])
);

function s(value) {
  return String(value ?? "").trim();
}

function n(value) {
  const v = s(value).replace(",", ".");
  if (!v || v === "?") return null;
  const num = Number(v);
  return Number.isFinite(num) ? num : null;
}

function d(value) {
  const v = s(value);
  if (!v) return null;

  const parts = v.split(".");
  if (parts.length !== 3) return null;

  const day = Number(parts[0]);
  const month = Number(parts[1]);
  const year = Number(parts[2]);

  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;

  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date.getTime();
}

function rarityRank(value) {
  const key = s(value).toLowerCase();
  return key in rarityRankMap ? rarityRankMap[key] : 9999;
}

function uniqueValues(products, key) {
  const map = new Map();

  for (const product of products) {
    const value = s(product[key]);
    if (!value) continue;
    const compare = value.toLowerCase();
    if (!map.has(compare)) map.set(compare, value);
  }

  const values = [...map.values()];

  if (key === "rarity") {
    values.sort((a, b) => {
      return rarityRank(a) - rarityRank(b) || a.localeCompare(b, "de", { sensitivity: "base" });
    });
  } else {
    values.sort((a, b) => a.localeCompare(b, "de", { sensitivity: "base" }));
  }

  return values;
}

function numericMeta(products, key) {
  const values = products
    .map((p) => p[key])
    .filter((v) => typeof v === "number" && Number.isFinite(v));

  if (!values.length) return { min: null, max: null };

  return {
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

function splitCsv(value) {
  return s(value)
    .split(",")
    .map((v) => s(v).toLowerCase())
    .filter(Boolean);
}

function matchesMulti(productValue, selected) {
  if (!selected.length) return true;
  return selected.includes(s(productValue).toLowerCase());
}

function matchesRange(value, min, max) {
  if (min === null && max === null) return true;
  if (value === null) return false;
  if (min !== null && value < min) return false;
  if (max !== null && value > max) return false;
  return true;
}

function sortProducts(products, sort) {
  const items = [...products];

  items.sort((a, b) => {
    switch (sort) {
      case "title_desc":
        return b.title.localeCompare(a.title, "de", { sensitivity: "base" });

      case "price_asc":
        return a.price - b.price || a.title.localeCompare(b.title, "de", { sensitivity: "base" });

      case "price_desc":
        return b.price - a.price || a.title.localeCompare(b.title, "de", { sensitivity: "base" });

      case "set_code_asc":
        return a.set_code.localeCompare(b.set_code, "de", { sensitivity: "base" });

      case "set_code_desc":
        return b.set_code.localeCompare(a.set_code, "de", { sensitivity: "base" });

      case "release_date_asc":
        if (a.release_date_value === null && b.release_date_value === null) return a.title.localeCompare(b.title, "de", { sensitivity: "base" });
        if (a.release_date_value === null) return 1;
        if (b.release_date_value === null) return -1;
        return a.release_date_value - b.release_date_value || a.title.localeCompare(b.title, "de", { sensitivity: "base" });

      case "release_date_desc":
        if (a.release_date_value === null && b.release_date_value === null) return a.title.localeCompare(b.title, "de", { sensitivity: "base" });
        if (a.release_date_value === null) return 1;
        if (b.release_date_value === null) return -1;
        return b.release_date_value - a.release_date_value || a.title.localeCompare(b.title, "de", { sensitivity: "base" });

      case "rarity_asc":
        return a.rarity_rank - b.rarity_rank || a.title.localeCompare(b.title, "de", { sensitivity: "base" });

      case "rarity_desc":
        return b.rarity_rank - a.rarity_rank || a.title.localeCompare(b.title, "de", { sensitivity: "base" });

      case "title_asc":
      default:
        return a.title.localeCompare(b.title, "de", { sensitivity: "base" });
    }
  });

  return items;
}

async function loadAllCollectionProducts(admin, handle) {
  let cursor = null;
  let hasNextPage = true;
  let collectionInfo = null;
  const products = [];

  while (hasNextPage) {
    const response = await admin.graphql(COLLECTION_QUERY, {
      variables: { handle, cursor },
    });

    const result = await response.json();
    const collection = result?.data?.collectionByIdentifier;

    if (!collection) {
      return { collection: null, products: [] };
    }

    if (!collectionInfo) {
      collectionInfo = {
        id: collection.id,
        handle: collection.handle,
        title: collection.title,
      };
    }

    const connection = collection.products;
    const nodes = connection?.nodes || [];

    for (const product of nodes) {
      products.push({
        id: product.id,
        title: s(product.title),
        handle: s(product.handle),
        image: product.featuredImage?.url ?? null,
        imageAlt: product.featuredImage?.altText ?? null,
        price: Number(product.priceRangeV2?.minVariantPrice?.amount ?? 0),
        currencyCode: product.priceRangeV2?.minVariantPrice?.currencyCode ?? null,

        set_code: s(product.setCode?.value),
        release_date: s(product.releaseDate?.value),
        release_date_value: d(product.releaseDate?.value),
        rarity: s(product.rarity?.value),
        rarity_rank: rarityRank(product.rarity?.value),
        status: s(product.status?.value),
        rank: n(product.rank?.value),
        pendulum_scale: n(product.pendulumScale?.value),
        atk: n(product.atk?.value),
        def: n(product.def?.value),
        level: n(product.level?.value),
        type: s(product.type?.value),
        attribute: s(product.attribute?.value),
        subtype: s(product.subtype?.value),
        card_type: s(product.cardType?.value),
      });
    }

    hasNextPage = connection?.pageInfo?.hasNextPage ?? false;
    cursor = connection?.pageInfo?.endCursor ?? null;
  }

  return { collection: collectionInfo, products };
}

export async function loader({ request }) {
  try {
    const url = new URL(request.url);

    if (PUBLIC_SECRET) {
      const secret = url.searchParams.get("secret");
      if (secret !== PUBLIC_SECRET) {
        return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }, null, 2), {
          status: 401,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }
    }

    const handle = url.searchParams.get("handle");
    if (!handle) {
      return new Response(JSON.stringify({ ok: false, error: "Missing handle parameter" }, null, 2), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const { admin } = await unauthenticated.admin(SHOP_DOMAIN);
    const { collection, products } = await loadAllCollectionProducts(admin, handle);

    if (!collection) {
      return new Response(JSON.stringify({ ok: false, error: "Collection not found", handle }, null, 2), {
        status: 404,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const filters = {
      status: uniqueValues(products, "status"),
      type: uniqueValues(products, "type"),
      attribute: uniqueValues(products, "attribute"),
      subtype: uniqueValues(products, "subtype"),
      card_type: uniqueValues(products, "card_type"),
      rarity: uniqueValues(products, "rarity"),
      atk: numericMeta(products, "atk"),
      def: numericMeta(products, "def"),
      level: numericMeta(products, "level"),
      rank: numericMeta(products, "rank"),
      pendulum_scale: numericMeta(products, "pendulum_scale"),
    };

    const state = {
      sort: s(url.searchParams.get("sort")) || "title_asc",
      status: splitCsv(url.searchParams.get("status")),
      type: splitCsv(url.searchParams.get("type")),
      attribute: splitCsv(url.searchParams.get("attribute")),
      subtype: splitCsv(url.searchParams.get("subtype")),
      card_type: splitCsv(url.searchParams.get("card_type")),
      rarity: splitCsv(url.searchParams.get("rarity")),
      atk_min: n(url.searchParams.get("atk_min")),
      atk_max: n(url.searchParams.get("atk_max")),
      def_min: n(url.searchParams.get("def_min")),
      def_max: n(url.searchParams.get("def_max")),
      level_min: n(url.searchParams.get("level_min")),
      level_max: n(url.searchParams.get("level_max")),
      rank_min: n(url.searchParams.get("rank_min")),
      rank_max: n(url.searchParams.get("rank_max")),
      pendulum_scale_min: n(url.searchParams.get("pendulum_scale_min")),
      pendulum_scale_max: n(url.searchParams.get("pendulum_scale_max")),
      page: Math.max(1, n(url.searchParams.get("page")) || 1),
      per_page: Math.max(1, n(url.searchParams.get("per_page")) || 24),
    };

    const filtered = products.filter((product) => {
      if (!matchesMulti(product.status, state.status)) return false;
      if (!matchesMulti(product.type, state.type)) return false;
      if (!matchesMulti(product.attribute, state.attribute)) return false;
      if (!matchesMulti(product.subtype, state.subtype)) return false;
      if (!matchesMulti(product.card_type, state.card_type)) return false;
      if (!matchesMulti(product.rarity, state.rarity)) return false;

      if (!matchesRange(product.atk, state.atk_min, state.atk_max)) return false;
      if (!matchesRange(product.def, state.def_min, state.def_max)) return false;
      if (!matchesRange(product.level, state.level_min, state.level_max)) return false;
      if (!matchesRange(product.rank, state.rank_min, state.rank_max)) return false;
      if (!matchesRange(product.pendulum_scale, state.pendulum_scale_min, state.pendulum_scale_max)) return false;

      return true;
    });

    const sorted = sortProducts(filtered, state.sort);

    const totalFiltered = sorted.length;
    const totalPages = Math.max(1, Math.ceil(totalFiltered / state.per_page));
    const safePage = Math.min(state.page, totalPages);
    const start = (safePage - 1) * state.per_page;
    const paginated = sorted.slice(start, start + state.per_page);

    return new Response(
      JSON.stringify(
        {
          ok: true,
          collection,
          filters,
          state: { ...state, page: safePage },
          pagination: {
            page: safePage,
            per_page: state.per_page,
            total_items: totalFiltered,
            total_pages: totalPages,
          },
          products: paginated,
        },
        null,
        2
      ),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify(
        {
          ok: false,
          error: error?.message || String(error),
          stack: error?.stack || null,
        },
        null,
        2
      ),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
}
