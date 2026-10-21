// Finds the platform of a store and a sample of its product page URLs. Shopify: /products.json. Others: product sitemaps.
export const UA = 'shopify-schema-audit/0.2 (+https://github.com/tlq5l/shopify-schema-audit)';

export async function get(url) {
  const r = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow' });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}

export function detectPlatform(html) {
  if (/cdn\.shopify\.com|Shopify\.theme|myshopify\.com/i.test(html)) return 'shopify';
  if (/woocommerce|wp-content\/plugins\/woocommerce/i.test(html)) return 'woocommerce';
  if (/static1\.squarespace\.com|Static\.SQUARESPACE_CONTEXT/i.test(html)) return 'squarespace';
  if (/cdn\d*\.bigcommerce\.com|bigcommerce\.com\/s-/i.test(html)) return 'bigcommerce';
  if (/static\.parastorage\.com|wixstatic\.com|X-Wix/i.test(html)) return 'wix';
  return 'unknown';
}

const locs = (xml) => [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\s\]]+)\s*(?:\]\]>)?\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, '&'));
const PRODUCT_URL = { woocommerce: /\/(product|produkt|producto|produit|shop)\/[^/]+\/?$/i, squarespace: /\/p\/[^/]+$/, wix: /\/(product-page|product)\//, bigcommerce: /./, unknown: /\/(product|products|p)\// };

// Walk sitemap files (index -> children named like product sitemaps first) and collect page URLs.
async function sitemapUrls(base, platform, limit) {
  const roots = ['/sitemap.xml', '/wp-sitemap.xml', '/sitemap_index.xml'];
  let first;
  for (const r of roots) { try { first = await get(base + r); break; } catch { /* try next */ } }
  if (!first) throw new Error('no sitemap found');
  const children = first.includes('<sitemapindex') ? locs(first) : [];
  const wantsProducts = children.filter((u) => /product|store|shop/i.test(u));
  const files = children.length ? (wantsProducts.length ? wantsProducts : children.slice(0, 3)) : [null];
  const urls = [];
  for (const f of files) {
    const xml = f ? await get(f).catch(() => '') : first;
    for (const u of locs(xml)) if (!/\.(jpg|png|webp)(\?|$)/i.test(u) && PRODUCT_URL[platform].test(new URL(u).pathname)) urls.push(u);
    if (urls.length >= limit * 4) break;
  }
  return urls;
}

export async function discover(store, sample = 12) {
  const base = store.replace(/\/+$/, '');
  const pick = (list) => { const step = Math.max(1, Math.floor(list.length / sample)); return list.filter((_, i) => i % step === 0).slice(0, sample); };
  const home = await get(base).catch(() => '');
  let platform = detectPlatform(home);
  if (platform === 'shopify' || platform === 'unknown') {
    try {
      const list = JSON.parse(await get(`${base}/products.json?limit=250`)).products;
      return { base, platform: 'shopify', catalogSize: list.length, urls: pick(list.map((p) => `${base}/products/${p.handle}`)), products: list };
    } catch { /* not Shopify */ }
  }
  if (platform === 'woocommerce') {
    try {
      const list = JSON.parse(await get(`${base}/wp-json/wc/store/v1/products?per_page=100`)).map((p) => p.permalink);
      if (list.length) return { base, platform, catalogSize: list.length, urls: pick(list) };
    } catch { /* Store API off: use the sitemap */ }
  }
  const all = await sitemapUrls(base, platform, sample);
  return { base, platform, catalogSize: all.length, urls: pick([...new Set(all)]) };
}
