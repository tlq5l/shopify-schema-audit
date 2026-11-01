# Search Console checks: what each schema check reads

`shopify-schema-audit` reads the structured data (JSON-LD) that a page serves. It does not read the visible page. A price that shows on screen but is missing from the Product JSON-LD is reported as missing. A field that is hidden on screen but present in the JSON-LD counts as present.

Each row is one problem code from `checkPage` in `lib/schema.mjs`. The "Google property" column names the Product merchant-listing property the check reads. The "Google status" column says whether that property is required, recommended, or not listed in the property list this page is based on. "Not listed" means the list does not mention the property. It says nothing more.

| Check (problem code) | What it reads from the page (JSON-LD) | Google property | Google status |
| --- | --- | --- | --- |
| `invalid-json-ld` | Every `application/ld+json` block. Fails if a block does not parse. | none (page-level) | not listed |
| `no-product-schema` | All JSON-LD nodes. Fails if no `Product` or `ProductGroup` node exists. | none (page-level) | not listed |
| `duplicate-product-nodes` | All `Product` / `ProductGroup` nodes. Fails if there is more than one. | none (page-level) | not listed |
| `no-offers` | `offers` on the Product, or `offers` on its variants (`hasVariant`). | `offers` | required |
| `no-name` | `name` on the Product. | `name` | required |
| `no-image` | `image` on the Product. | `image` | required |
| `no-price` | `price`, `lowPrice` or `priceSpecification` on the first offer. | `price` | required |
| `no-currency` | `priceCurrency` or `priceSpecification` on the first offer. | `priceCurrency` | required |
| `no-availability` | `availability` on the first offer. | `availability` | recommended |
| `no-priceValidUntil` | `priceValidUntil` on the first offer (price validity). | `priceValidUntil` | not listed |
| `no-shippingDetails` | `shippingDetails` on the first offer. | `shippingDetails` | not listed |
| `no-hasMerchantReturnPolicy` | `hasMerchantReturnPolicy` on the first offer (return policy). | `hasMerchantReturnPolicy` | not listed |
| `no-gtin-or-mpn` | `gtin`, `gtin8`, `gtin12`, `gtin13`, `gtin14` or `mpn` on the Product or any variant. | `gtin` / `mpn` | not listed |
| `no-brand` | `brand` on the Product. | `brand` | not listed |
| `no-sku` | `sku` on the Product or any variant. | `sku` | not listed |
| `no-description` | `description` on the Product. | `description` | not listed |
| `no-aggregateRating` | `aggregateRating` on the Product (rating). | `aggregateRating` | not listed |

## How the checks pick their data

- **First Product only.** The checks read the first `Product` or `ProductGroup` node on the page. Product-level fields (`name`, `image`, `brand`, `description`, `aggregateRating`) come from that node, not from its variants.
- **First offer only.** Offer-level checks (`price`, `priceCurrency`, `availability`, `priceValidUntil`, `shippingDetails`, `hasMerchantReturnPolicy`) read one offer: the first entry in the Product's `offers` (including inside an `AggregateOffer`), or, if there is none, the first variant offer.
- **GTIN, MPN and SKU** pass if any one of the Product or its variants has them.
- **Duplicates.** A page with more than one Product block (for example, a theme block plus a review app block) gets `duplicate-product-nodes`. The other checks still run on the first node.

## Warnings for fields that may already be set in Google Merchant Center

Some warnings in the tool are for fields that may already be set in Google Merchant Center, not in the page. The tool labels `no-shippingDetails` and `no-hasMerchantReturnPolicy` as Search Console "Merchant listings" warnings, and `no-priceValidUntil` as a Product snippets warning. The property list this page is based on does not list those three properties. Before adding a field to the page, check whether it is already set in Google Merchant Center.

## Scope

- This page covers the schema checks only. The `alt` check (product photos without alt text) and the `gpsr` check (EU product safety details) read the HTML, not the JSON-LD, and are not in the table.
- Exit code 1 is set only by the problem codes listed in `BLOCKING` in `lib/checks.mjs`. Other codes are printed as advice.
- The tool reports what the page serves. It does not predict whether a store will pass Search Console or get rich results.
