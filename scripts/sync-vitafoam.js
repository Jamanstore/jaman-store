const cheerio = require("cheerio");

const SOURCE = "https://www.vitafoamng.com";
const SHOP_PAGES = Array.from({length: 6}, (_, i) => i === 0 ? `${SOURCE}/shop/` : `${SOURCE}/shop/page/${i+1}/`);
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json"
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const clean = v => String(v || "").replace(/\s+/g, " ").trim();
const slugify = v => clean(v).toLowerCase().replace(/&/g,"and").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");

function parsePrice(text) {
  const m = clean(text).replace(/,/g,"").match(/(?:₦|NGN)\s*([0-9]+(?:\.[0-9]+)?)/i);
  return m ? Number(m[1]) : 0;
}

function categoryName(text) {
  const t = clean(text).toLowerCase();
  if (t.includes("pillow")) return "Pillows";
  if (t.includes("bedding") || t.includes("topper") || t.includes("duvet") || t.includes("bedsheet")) return "Bedding";
  if (t.includes("mother") || t.includes("baby") || t.includes("kid") || t.includes("maternity")) return "Mother & Child";
  if (t.includes("furniture") || t.includes("bedroom") || t.includes("hospital") || t.includes("office") || t.includes("school") || t.includes("living room")) return "Furniture";
  if (t.includes("lifestyle") || t.includes("accessor") || t.includes("leisure")) return "Lifestyle";
  return "Mattresses";
}

async function getJson(path) {
  const r = await fetch(SUPABASE_URL + path, {headers});
  if (!r.ok) throw new Error(`Supabase GET ${path} failed: ${r.status} ${await r.text()}`);
  const text = await r.text();
  return text ? JSON.parse(text) : [];
}

async function patch(path, body, method="PATCH", preferRepresentation=false) {
  const requestHeaders = preferRepresentation ? {...headers, Prefer:"return=representation"} : headers;
  const r = await fetch(SUPABASE_URL + path, {
    method, headers:requestHeaders,
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`Supabase ${method} ${path} failed: ${r.status} ${await r.text()}`);
  const text = await r.text();
  return text ? JSON.parse(text) : [];
}

async function main() {
  const run = await patch("/rest/v1/catalog_sync_runs", {source:"vitafoam", status:"running"}, "POST", true);
  const runId = run[0]?.id;

  try {
    const categories = await getJson("/rest/v1/categories?select=id,name,slug");
    const categoryMap = new Map(categories.map(c => [c.name.toLowerCase(), c.id]));
    const existing = await getJson("/rest/v1/products?select=id,product_code,name,slug,price_naira,source_url,source_updated_at&limit=1000");
    const bySlug = new Map(existing.map(p => [p.slug, p]));
    const bySourceUrl = new Map(existing.filter(p => p.source_url).map(p => [p.source_url.replace(/\/$/,""), p]));

    const products = new Map();

    for (const pageUrl of SHOP_PAGES) {
      const html = await (await fetch(pageUrl, {headers: {"User-Agent":"Jaman-Store-Catalog-Sync/1.0"}})).text();
      const $ = cheerio.load(html);
      $("li.product, .products .product").each((_, el) => {
        const node = $(el);
        const link = node.find("a.woocommerce-LoopProduct-link, a[href*='/product/']").first().attr("href");
        const name = clean(node.find(".woocommerce-loop-product__title, h2, h3").first().text());
        const price = parsePrice(node.find(".price").first().text());
        if (!link || !name) return;
        const absolute = new URL(link, SOURCE).href.split("#")[0];
        const key = absolute.replace(/\/$/,"");
        products.set(key, {name, price, url:absolute, cardCategory: clean(node.text())});
      });
    }

    let created = 0, updated = 0;

    for (const item of products.values()) {
      await sleep(80);
      const html = await (await fetch(item.url, {headers: {"User-Agent":"Jaman-Store-Catalog-Sync/1.0"}})).text();
      const $ = cheerio.load(html);

      const name = clean($("h1.product_title, h1.entry-title").first().text()) || item.name;
      const parsedPrice = parsePrice($(".summary .price, p.price, .price").first().text());
      const price = parsedPrice > 0 ? parsedPrice : item.price;
      const description = clean($(".woocommerce-product-details__short-description, .short-description").first().text());
      const galleryImages = [];
$("figure.woocommerce-product-gallery__wrapper img, .woocommerce-product-gallery img").each((_, img) => {
  const node = $(img);
  const src = node.attr("data-large_image") || node.attr("data-src") || node.attr("src") || "";
  if (src) galleryImages.push(new URL(src, item.url).href);
});
const uniqueImages = [...new Set(galleryImages)].slice(0, 8);
const image = uniqueImages[0] || "";
      const categoryText = clean($(".posted_in").text()) + " " + item.cardCategory;
      const category = categoryName(categoryText);
      const categoryId = categoryMap.get(category.toLowerCase());
      if (!categoryId) continue;

      const slug = slugify(name);
      if (!(price > 0)) {
        console.warn(`Skipping ${name}: no valid price was found.`);
        continue;
      }

      const body = {
        product_code: slug,
        name,
        slug,
        category_id: categoryId,
        description: description || null,
        price_naira: price,
        image_url: image || null,
        source_url: item.url,
        source_updated_at: new Date().toISOString(),
        active: true
      };

      const current = bySourceUrl.get(item.url.replace(/\/$/,"")) || bySlug.get(slug);
      let row = current;
      if (current) {
        await patch("/rest/v1/products?id=eq."+encodeURIComponent(current.id), body);
        updated++;
      } else {
        const inserted = await patch("/rest/v1/products", body, "POST", true);
        row = inserted[0];
        if (row) { bySlug.set(slug, row); bySourceUrl.set(item.url.replace(/\/$/,""), row); }
        created++;
      }
      if (row && uniqueImages.length) {
        await patch("/rest/v1/product_images?product_id=eq."+encodeURIComponent(row.id), {}, "DELETE");
        await patch("/rest/v1/product_images", uniqueImages.map((url, index) => ({
          product_id: row.id,
          image_url: url,
          alt_text: name,
          sort_order: index
        })), "POST");
      }
    }

    await patch("/rest/v1/catalog_sync_runs?id=eq."+encodeURIComponent(runId), {
      status:"success", finished_at:new Date().toISOString(),
      products_seen:products.size, products_created:created, products_updated:updated
    });

    console.log(JSON.stringify({status:"success", productsSeen:products.size, created, updated}, null, 2));
  } catch (e) {
    await patch("/rest/v1/catalog_sync_runs?id=eq."+encodeURIComponent(runId), {
      status:"failed", finished_at:new Date().toISOString(), error_message:String(e.message || e)
    });
    throw e;
  }
}

main().catch(e => { console.error(e); process.exit(1); });