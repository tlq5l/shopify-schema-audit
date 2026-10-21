// Page checks. Each takes { html, url } and returns problem codes. Add a check here; --checks picks which run.
import { extractJsonLd, checkPage } from './schema.mjs';

const CDN_IMG = /cdn\.shopify|\/products\/|wp-content\/uploads|squarespace-cdn|bigcommerce\.com|wixstatic|\/files\//i;

// Product images with no alt attribute or an empty one (alt="" is fine for decoration, not for product photos).
export function imageAlt(html) {
  const main = html.match(/<main\b[\s\S]*?<\/main>/i)?.[0] ?? html;   // header/footer banners are not product photos
  const imgs = [...main.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const product = imgs.filter((t) => CDN_IMG.test(t) && !/role=["']?(presentation|none)|aria-hidden=["']?true/i.test(t) && !/\b(width|height)=["']?(1|2|16|24|32)["'\s>]/i.test(t) && !/logo|icon|pixel|spacer/i.test(t));
  const missing = product.filter((t) => { const a = t.match(/\balt=(?:"([^"]*)"|'([^']*)')/i); return !a || !(a[1] ?? a[2]).trim(); });
  return { total: product.length, missing: missing.length };
}

const EU_CURRENCY = /"(?:priceCurrency|currency)"\s*:\s*"(EUR|GBP|SEK|DKK|PLN|CZK|HUF|RON|BGN)"|itemprop=["']priceCurrency["'][^>]*content=["'](EUR|GBP|SEK|DKK|PLN|CZK|HUF|RON|BGN)/i;
const EU_LANG = /<html[^>]*\blang=["'](de|fr|it|es|nl|pt|pl|sv|da|fi|cs|ro|hu|el|bg|sk|sl|hr|lt|lv|et|en-(gb|ie))/i;
const GPSR_WORDS = /responsible person|authori[sz]ed representative|eu representative|verantwortliche[rn]? person|hersteller|fabricant|fabbricante|fabricante|importer|importeur|manufacturer|product safety|gpsr|produktsicherheit|sécurité des produits|sicurezza del prodotto|seguridad del producto/i;

export const CHECKS = {
  // Product structured data (Shopify, WooCommerce, Squarespace, BigCommerce, Wix: it reads the served HTML)
  schema: ({ html }) => checkPage(extractJsonLd(html)),
  // Missing alt text on product photos
  alt: ({ html }) => { const r = imageAlt(html); return r.missing ? ['img-missing-alt'] : []; },
  // EU/UK General Product Safety Regulation: manufacturer / responsible-person details on the product page (only flagged when the page looks EU/UK-facing)
  gpsr: ({ html }) => {
    const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ');
    const euFacing = EU_CURRENCY.test(html) || EU_LANG.test(html);
    return euFacing && !GPSR_WORDS.test(text) ? ['no-gpsr-info'] : [];
  },
};

export const WHY = {
  'no-product-schema': 'No Product structured data at all: no rich results, weak AI/shopping visibility',
  'invalid-json-ld': 'A JSON-LD block does not parse: Google ignores it',
  'duplicate-product-nodes': 'More than one Product block (theme + review/SEO app): Google may drop rich results',
  'no-offers': 'Product has no Offer (price/availability)',
  'no-shippingDetails': 'Missing shippingDetails: Search Console "Merchant listings" warning',
  'no-hasMerchantReturnPolicy': 'Missing hasMerchantReturnPolicy: Search Console "Merchant listings" warning',
  'no-priceValidUntil': 'Missing priceValidUntil: Search Console Product snippets warning',
  'no-gtin-or-mpn': 'No GTIN/MPN: lowers Google Shopping eligibility',
  'no-brand': 'No brand', 'no-sku': 'No SKU', 'no-aggregateRating': 'No aggregateRating (needs a review source)',
  'img-missing-alt': 'Product photos with no alt text: accessibility (EAA / ADA) and image-search loss',
  'no-gpsr-info': 'EU/UK-facing product page shows no manufacturer or responsible-person details (EU GPSR, in force since Dec 2024)',
};
// Problems that make the CLI exit 1 (the rest are advice only)
export const BLOCKING = new Set(['no-product-schema', 'invalid-json-ld', 'duplicate-product-nodes', 'no-offers', 'no-shippingDetails', 'no-hasMerchantReturnPolicy', 'no-priceValidUntil', 'no-gtin-or-mpn', 'img-missing-alt', 'no-gpsr-info']);
