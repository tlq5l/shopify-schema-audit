# shopify-schema-audit

Checks what a live store actually serves and tells you what Google Search Console (and EU/accessibility rules) will complain about. Works on Shopify, WooCommerce, Squarespace, BigCommerce and Wix (Shopify via /products.json, the others via the product sitemap). Zero dependencies, Node 18+.

```
node bin/audit.mjs https://your-store.com --sample 12 --checks schema,alt,gpsr
```

Checks (`--checks`, default `schema`): `schema` = Product structured data; `alt` = product photos with no alt text; `gpsr` = EU/UK-facing product pages with no manufacturer / responsible-person details (EU GPSR). Checks live in `lib/checks.mjs`; add one there.

Example, run 2026-10-22 on a real store (6 product pages sampled):

```
https://coventrytowelradiator.shop: 6 of 250 products checked (0 failed to load)
    3/6  no-product-schema  No Product structured data at all
    3/6  no-priceValidUntil
    3/6  no-shippingDetails  Search Console "Merchant listings" warning
    3/6  no-hasMerchantReturnPolicy  Search Console "Merchant listings" warning
```

It flags: no Product schema, duplicate Product blocks (theme plus review app), missing offers, shippingDetails, hasMerchantReturnPolicy, priceValidUntil, GTIN/MPN, brand, SKU, image, rating. Exit code 1 if a Search Console-relevant problem is found. `--json` for machine output.

## Fix it: Shopify Product Schema Pro ($29, one time)

The audit tells you what is missing. Shopify's own theme markup does not include your shipping and return details (a Shopify Community answer confirms there is no automatic way to add them), which is why Search Console keeps emailing "Missing field shippingDetails" and "hasMerchantReturnPolicy".

Product Schema Pro is one Liquid snippet you paste into your theme: a complete ProductGroup with a Product and Offer for every variant, shipping details, return policy, price validity, brand, SKU, GTIN/MPN, images and review rating (from the standard review metafields). Edit about ten settings at the top, render it once, remove the old block. Install guide included (10 minutes).

- Same job as the Shopify apps that charge monthly: JSON-LD Express $9.99/month, MageBytes JSON-LD Schema $9.99 to $99.99/month, SA SEO JSON-LD from $2.99/month (prices from their App Store listings, 2026-10-22). $29 once is about 3 months of the middle one, forever.
- Checked on real product data from 3 live stores (24 products, 57 variants): every rendered product passes the audit above. Before, the same stores failed on missing shipping, returns and validity fields (and one had no Product schema on half its pages).
- Not an app: no install permissions, no monthly fee, nothing loaded from a third party, no data leaves your store.
- Honest limits: it does not guarantee rich results or rankings; one shipping/return setting for all products; checked with an offline Liquid engine and this audit, not inside every Shopify theme, so use the theme-copy step in the guide.


## License
Audit tool: MIT. Product Schema Pro is a separate paid file.
