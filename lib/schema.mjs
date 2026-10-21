// Product JSON-LD check: extract the blocks a page serves and list problem codes for its Product nodes.
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
  if (o.price == null && o.lowPrice == null && !o.priceSpecification) problems.push('no-price');
  if (!o.priceCurrency && !o.priceSpecification) problems.push('no-currency');
  if (!o.availability) problems.push('no-availability');
  if (!o.priceValidUntil) problems.push('no-priceValidUntil');
  if (!o.shippingDetails) problems.push('no-shippingDetails');
  if (!o.hasMerchantReturnPolicy) problems.push('no-hasMerchantReturnPolicy');
  if (!p.aggregateRating) problems.push('no-aggregateRating');
  return problems;
}

