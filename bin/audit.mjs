#!/usr/bin/env node
// shopify-schema-audit: checks what a live store really serves (Shopify, WooCommerce, Squarespace, BigCommerce, Wix).
// Usage: node bin/audit.mjs https://store.com [--sample 12] [--checks schema,alt,gpsr] [--json]
import { pathToFileURL } from 'node:url';
import { discover, get } from '../lib/discover.mjs';
import { CHECKS, WHY, BLOCKING } from '../lib/checks.mjs';

export { extractJsonLd, checkPage } from '../lib/schema.mjs';

// WooCommerce serves some non-product pages under /shop/<slug>/ (e.g. a page); only a page with the single-product body class is a product.
const notProduct = (platform, html) => platform === 'woocommerce' && !/<body[^>]*class=["'][^"']*\bsingle-product\b/i.test(html);

export async function audit(store, sample = 12, checks = ['schema']) {
  const unknown = checks.filter((c) => !CHECKS[c]);
  if (unknown.length) throw new Error(`unknown check: ${unknown.join(', ')} (have: ${Object.keys(CHECKS).join(', ')})`);
  const { base, platform, catalogSize, urls } = await discover(store, sample);
  const pages = [];
  for (const url of urls) {
    try { const html = await get(url); if (notProduct(platform, html)) { pages.push({ url, skipped: 'not a product page' }); continue; } pages.push({ url, problems: checks.flatMap((c) => CHECKS[c]({ html, url })) }); }
    catch (e) { pages.push({ url, error: String(e.message) }); }
  }
  const ok = pages.filter((p) => !p.error && !p.skipped);
  const counts = {};
  ok.forEach((p) => p.problems.forEach((c) => (counts[c] = (counts[c] || 0) + 1)));
  return { store: base, platform, catalogSampled: catalogSize, pagesChecked: ok.length, pagesFailed: pages.filter((p) => p.error).length, pagesSkipped: pages.filter((p) => p.skipped).length, checks, counts, pages };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const store = args.find((a) => a.startsWith('http'));
  if (!store) { console.error('Usage: audit.mjs https://store.com [--sample 12] [--checks schema,alt,gpsr] [--json]'); process.exit(2); }
  const arg = (name, dflt) => { const i = args.indexOf(name); return i > -1 ? args[i + 1] : dflt; };
  const sample = Number(arg('--sample', 12));
  if (!Number.isInteger(sample) || sample < 1) { console.error('--sample needs a whole number of 1 or more'); process.exit(2); }
  const checks = (arg('--checks', 'schema') ?? '').split(',');
  let res;
  try { res = await audit(store, sample, checks); } catch (e) { console.error(`${store}: ${e.message}`); process.exit(2); }
  if (args.includes('--json')) console.log(JSON.stringify(res, null, 2));
  else if (!res.pagesChecked) console.log(`${res.store} (${res.platform}): nothing was checked: ${res.catalogSampled} product pages found, ${res.pagesFailed} failed to load, ${res.pagesSkipped} skipped as not products.`);
  else {
    console.log(`${res.store} (${res.platform}): ${res.pagesChecked} product pages checked of ${res.catalogSampled} found (${res.pagesFailed} failed to load)`);
    const rows = Object.entries(res.counts).sort((a, b) => b[1] - a[1]);
    if (!rows.length) console.log('No problems found.');
    for (const [c, n] of rows) console.log(`  ${String(n).padStart(3)}/${res.pagesChecked}  ${c}  ${WHY[c] || ''}`);
  }
  if (!res.pagesChecked) process.exit(3);
  process.exit(Object.keys(res.counts).some((c) => BLOCKING.has(c)) ? 1 : 0);
}
