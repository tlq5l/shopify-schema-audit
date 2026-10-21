// End-to-end: runs the real CLI against local fixture stores. Run: node test/e2e.mjs
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const page = (head, body = '', cls = 'single-product woocommerce') => `<!doctype html><html ${head}><body class="${cls}">${body}<main><h1>Thing</h1><p>Price 10</p></main></body></html>`;
const sm = (...u) => `<?xml version="1.0"?><urlset>${u.map((x) => `<url><loc>${x}</loc></url>`).join('')}</urlset>`;
const idx = (...u) => `<sitemapindex>${u.map((x) => `<sitemap><loc>${x}</loc></sitemap>`).join('')}</sitemapindex>`;
let B = '';
const eur = '<script type="application/ld+json">{"@type":"Product","offers":{"priceCurrency":"EUR"}}</script>';
const gbp = eur.replace('EUR', 'GBP');
const store = (home, extra) => ({ '/': home, ...extra });
const stores = {
  // 1: GPSR region logic
  '/gpsr-ptbr': store('<html>woocommerce', { '/sitemap.xml': () => sm(`${B}/gpsr-ptbr/product/a/`), '/gpsr-ptbr/product/a/': page('lang="pt-BR"', eur) }),
  '/gpsr-frca': store('<html>woocommerce', { '/sitemap.xml': () => sm(`${B}/gpsr-frca/product/a/`), '/gpsr-frca/product/a/': page('lang="fr-CA"', eur) }),
  '/gpsr-dech': store('<html>woocommerce', { '/sitemap.xml': () => sm(`${B}/gpsr-dech/product/a/`), '/gpsr-dech/product/a/': page('lang="de-CH"', eur) }),
  '/gpsr-engb': store('<html>woocommerce', { '/sitemap.xml': () => sm(`${B}/gpsr-engb/product/a/`), '/gpsr-engb/product/a/': page('lang="en-GB"', gbp) }),
  '/gpsr-gbp': store('<html>woocommerce', { '/sitemap.xml': () => sm(`${B}/gpsr-gbp/product/a/`), '/gpsr-gbp/product/a/': page('', gbp) }),
  '/gpsr-dede': store('<html>woocommerce', { '/sitemap.xml': () => sm(`${B}/gpsr-dede/product/a/`), '/gpsr-dede/product/a/': page('lang="de-DE"', eur) }),
  // 2: BigCommerce must only audit the products sitemap
  '/bc-flat': store('cdn11.bigcommerce.com', { '/sitemap.xml': () => sm(`${B}/bc-flat/contact-us/`, `${B}/bc-flat/blog/post/`), '/bc-flat/contact-us/': page('lang="de-DE"'), '/bc-flat/blog/post/': page('lang="de-DE"') }),
  '/bc-idx': store('cdn11.bigcommerce.com', {
    '/sitemap.xml': () => idx(`${B}/bc-idx/xmlsitemap.php?type=pages&page=1`, `${B}/bc-idx/xmlsitemap.php?type=products&page=1`),
    '/xmlsitemap.php': null,
    '/bc-idx/xmlsitemap.php?type=pages&page=1': () => sm(`${B}/bc-idx/contact-us/`),
    '/bc-idx/xmlsitemap.php?type=products&page=1': () => sm(`${B}/bc-idx/widget/`),
    '/bc-idx/widget/': page('lang="de-DE"', eur), '/bc-idx/contact-us/': page('lang="de-DE"') }),
  // 3: WooCommerce page that is not a product
  '/woo': store('<html>woocommerce', { '/sitemap.xml': () => sm(`${B}/woo/shop/real/`, `${B}/woo/shop/page76/`),
    '/woo/shop/real/': page('lang="de-DE"', eur), '/woo/shop/page76/': page('lang="de-DE"', '', 'page page-id-76') }),
  // 5: Shopify store whose /products.json is closed falls back to the sitemap
  '/shop-nojson': store('cdn.shopify.com', { '/sitemap.xml': () => sm(`${B}/shop-nojson/products/a`), '/shop-nojson/products/a': page('lang="de-DE"', eur, 'product') }),
  // 6: nothing to check
  '/empty': store('<html>woocommerce', { '/sitemap.xml': () => sm() }),
};
const server = http.createServer((req, res) => {
  const u = req.url;
  const [root, ...rest] = u.split('/').filter(Boolean);
  const s = stores['/' + (root || '')]; // first segment picks the store
  const key = u.startsWith('/' + root + '/sitemap.xml') || u === '/' + root ? null : u;
  const path = u === '/' + root || u === '/' + root + '/' ? '/' : u.slice(root.length + 1);
  const hit = s && (path === '/' ? s['/'] : s[path] !== undefined ? s[path] : s[u]);
  const val = typeof hit === 'function' ? hit() : hit;
  if (val == null) { res.writeHead(404).end('nf'); return; }
  res.writeHead(200, { 'content-type': 'text/html' }).end(val);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
B = `http://127.0.0.1:${server.address().port}`;
const cli = fileURLToPath(new URL('../bin/audit.mjs', import.meta.url));
const run = (...a) => new Promise((res) => { // async so the fixture server keeps serving
  import('node:child_process').then(({ spawn }) => { const p = spawn('node', [cli, ...a], { env: { PATH: process.env.PATH } }); let out = ''; p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (out += d)); p.on('close', (code) => res({ code, out })); });
});
let fail = 0;
const t = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${ok ? '' : extra}`); if (!ok) fail++; };
const json = async (path, checks = 'gpsr') => { const r = await run(B + path, '--checks', checks, '--json'); try { return { ...JSON.parse(r.out), code: r.code }; } catch { return { code: r.code, raw: r.out }; } };

for (const s of ['gpsr-ptbr', 'gpsr-frca', 'gpsr-dech', 'gpsr-engb', 'gpsr-gbp']) { const r = await json('/' + s); t(`1 ${s}: not flagged`, r.pagesChecked === 1 && !r.counts?.['no-gpsr-info'], JSON.stringify(r.counts ?? r.raw)); }
{ const r = await json('/gpsr-dede'); t('1 gpsr-dede: flagged (real EU page, no maker info)', r.counts?.['no-gpsr-info'] === 1, JSON.stringify(r.counts ?? r.raw)); }
{ const r = await json('/bc-flat'); t('2 bc-flat: no pages audited when products cannot be told apart', !r.pagesChecked, JSON.stringify(r.pages?.map((p) => p.url) ?? r.raw)); }
{ const r = await json('/bc-idx'); t('2 bc-idx: only the product page audited', r.pagesChecked === 1 && r.pages?.[0]?.url.endsWith('/widget/'), JSON.stringify(r.pages?.map((p) => p.url) ?? r.raw)); }
{ const r = await json('/woo'); t('3 woo: non-product page skipped, product scored', r.pagesChecked === 1 && r.counts?.['no-gpsr-info'] === 1, JSON.stringify(r.counts ?? r.raw)); }
{ const r = await json('/woo', 'schema'); t('3 woo schema: no false no-product-schema on the non-product page', r.pagesChecked === 1 && !r.counts?.['no-product-schema'], JSON.stringify(r.counts ?? r.raw)); }
{ const r = await json('/shop-nojson'); t('5 shopify without products.json: no crash, sitemap used', r.pagesChecked === 1, JSON.stringify(r.raw ?? r.counts)); }
{ const r = await run(B + '/empty'); t('6 zero pages: says nothing checked, exits non-zero', r.code !== 0 && !/No problems found/.test(r.out) && /nothing was checked/i.test(r.out), `${r.code} ${r.out}`); }
{ const r = await run(B + '/woo', '--sample'); t('6 --sample without a number: usage error, exit 2', r.code === 2, `${r.code} ${r.out}`); }
{ const r = await run(B + '/woo', '--sample', 'abc'); t('6 --sample abc: usage error, exit 2', r.code === 2, `${r.code} ${r.out}`); }
server.close();
console.log(fail ? `${fail} FAILED` : 'ALL PASS');
process.exit(fail ? 1 : 0);
