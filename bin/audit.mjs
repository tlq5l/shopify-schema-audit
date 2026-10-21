#!/usr/bin/env node
// shopify-schema-audit: checks the Product JSON-LD that a live Shopify store really serves.
// Usage: node bin/audit.mjs https://store.com [--sample 12] [--json]
import { pathToFileURL } from 'node:url';

const UA = 'shopify-schema-audit/0.1 (+https://github.com/tlq5l/shopify-schema-audit)';

export function extractJsonLd(html) {
  const out = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(re)) {
    try { out.push(JSON.parse(m[1].trim())); } catch { out.push({ '@invalid': true }); }
  }
  return out;
}

function flatten(x, acc = []) {
  if (Array.isArray(x)) x.forEach((i) => flatten(i, acc));
  else if (x && typeof x === 'object') { acc.push(x); if (x['@graph']) flatten(x['@graph'], acc); }
  return acc;
}

const typeOf = (n) => [].concat(n['@type'] || []);
const arr = (v) => (v == null ? [] : [].concat(v));

// Returns a list of problem codes for the Product nodes found on one page.
export function checkPage(blocks) {
  const nodes = flatten(blocks);
  const problems = [];
  if (nodes.some((n) => n['@invalid'])) problems.push('invalid-json-ld');
  const products = nodes.filter((n) => typeOf(n).some((t) => t === 'Product' || t === 'ProductGroup'));
  if (!products.length) return [...problems, 'no-product-schema'];
  if (products.length > 1) problems.push('duplicate-product-nodes');
  const p = products[0];
  const offers = arr(p.offers).flatMap((o) => (o.offers ? arr(o.offers) : [o]));
  const variants = arr(p.hasVariant).flatMap((v) => arr(v.offers));
  const allOffers = [...offers, ...variants];
  if (!allOffers.length) return [...problems, 'no-offers'];
  const o = allOffers[0];
  if (!p.name) problems.push('no-name');
  if (!arr(p.image).length) problems.push('no-image');
  if (!p.description) problems.push('no-description');
  if (!p.brand) problems.push('no-brand');
  const ids = [p, ...variants.length ? arr(p.hasVariant) : []];
  if (!ids.some((i) => i.gtin || i.gtin8 || i.gtin12 || i.gtin13 || i.gtin14 || i.mpn)) problems.push('no-gtin-or-mpn');
  if (!ids.some((i) => i.sku)) problems.push('no-sku');
  if (o.price == null && !o.priceSpecification) problems.push('no-price');
  if (!o.priceCurrency && !o.priceSpecification) problems.push('no-currency');
  if (!o.availability) problems.push('no-availability');
  if (!o.priceValidUntil) problems.push('no-priceValidUntil');
  if (!o.shippingDetails) problems.push('no-shippingDetails');
  if (!o.hasMerchantReturnPolicy) problems.push('no-hasMerchantReturnPolicy');
  if (!p.aggregateRating) problems.push('no-aggregateRating');
  return problems;
}

async function get(url) {
  const r = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow' });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}

export async function audit(store, sample = 12) {
  const base = store.replace(/\/+$/, '');
  const list = JSON.parse(await get(`${base}/products.json?limit=250`)).products;
  const step = Math.max(1, Math.floor(list.length / sample));
  const picked = list.filter((_, i) => i % step === 0).slice(0, sample);
  const pages = [];
  for (const p of picked) {
    const url = `${base}/products/${p.handle}`;
    try { pages.push({ url, problems: checkPage(extractJsonLd(await get(url))) }); }
    catch (e) { pages.push({ url, error: String(e.message) }); }
  }
  const ok = pages.filter((p) => !p.error);
  const counts = {};
  ok.forEach((p) => p.problems.forEach((c) => (counts[c] = (counts[c] || 0) + 1)));
  return { store: base, catalogSampled: list.length, pagesChecked: ok.length, pagesFailed: pages.length - ok.length, counts, pages };
}

const WHY = {
  'no-product-schema': 'No Product structured data at all: no rich results, weak AI/shopping visibility',
  'duplicate-product-nodes': 'More than one Product block (theme + review/SEO app): Google may drop rich results',
  'no-offers': 'Product has no Offer (price/availability)',
  'no-shippingDetails': 'Missing shippingDetails: Search Console "Merchant listings" warning',
  'no-hasMerchantReturnPolicy': 'Missing hasMerchantReturnPolicy: Search Console "Merchant listings" warning',
  'no-priceValidUntil': 'Missing priceValidUntil: Search Console Product snippets warning',
  'no-gtin-or-mpn': 'No GTIN/MPN: lowers Google Shopping eligibility',
  'no-brand': 'No brand', 'no-sku': 'No SKU', 'no-aggregateRating': 'No aggregateRating (needs a review source)',
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const store = args.find((a) => a.startsWith('http'));
  if (!store) { console.error('Usage: audit.mjs https://store.com [--sample 12] [--json]'); process.exit(2); }
  const si = args.indexOf('--sample');
  const res = await audit(store, si > -1 ? Number(args[si + 1]) : 12);
  if (args.includes('--json')) console.log(JSON.stringify(res, null, 2));
  else {
    console.log(`${res.store}: ${res.pagesChecked} of ${res.catalogSampled} products checked (${res.pagesFailed} failed to load)`);
    const rows = Object.entries(res.counts).sort((a, b) => b[1] - a[1]);
    if (!rows.length) console.log('No problems found.');
    for (const [c, n] of rows) console.log(`  ${String(n).padStart(3)}/${res.pagesChecked}  ${c}  ${WHY[c] || ''}`);
  }
  process.exit(Object.keys(res.counts).some((c) => c in WHY && !['no-aggregateRating', 'no-brand', 'no-sku'].includes(c)) ? 1 : 0);
}
