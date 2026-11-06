# Run the audit in CI

`bin/audit.mjs` fetches a live store over HTTP, checks a sample of its product pages, and sets an exit code that a CI job can act on. This page covers the command, what each exit code means, the `--json` output, and what a run reads from the store. The workflow YAML below is an example only. This repo does not run it.

## The command

```
node bin/audit.mjs https://your-store.com --sample 12 --checks schema,alt,gpsr
```

The flags, as documented in the README:

- `https://...`: the store URL. It is the first argument that starts with `http`.
- `--sample N`: how many product pages to check. A whole number, 1 or more. Default `12`.
- `--checks a,b`: a comma-separated list from `schema`, `alt`, `gpsr`. Default `schema`. An unknown name stops the run with exit code 2.
- `--json`: print one JSON object instead of the text summary.

There are no dependencies to install. Node 18 or newer is enough.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | At least one page was checked and no blocking problem was found. |
| `1` | At least one blocking problem was found on a checked page. |
| `2` | The run could not start or could not find the store's products. The reason goes to stderr. Examples: no store URL, a bad `--sample`, an unknown check name, or no sitemap found. |
| `3` | Nothing was checked. No product pages were found, or every one failed to load or was skipped as not a product page. |

Exit code 1 comes from these problem codes:

- `no-product-schema`, `invalid-json-ld`, `duplicate-product-nodes`, `no-offers`
- `no-shippingDetails`, `no-hasMerchantReturnPolicy`, `no-priceValidUntil`
- `no-gtin-or-mpn`
- `img-missing-alt` (from `--checks alt`)
- `no-gpsr-info` (from `--checks gpsr`)

Three advice-only codes never change the exit code: `no-brand`, `no-sku`, and `no-aggregateRating`.

A check only counts if it ran. With the default `--checks schema`, an alt-text or GPSR problem cannot make the run exit 1. A page that fails to load is not counted as a problem. It shows up in `pagesFailed` in the JSON output.

Exit code 1 means the audit found one of these problems on a sampled page. It does not predict what Google will show or rank.

## JSON output

`--json` prints one object, pretty-printed with two-space indent. The top-level fields are:

- `store`, `platform`: the base URL and the detected platform.
- `catalogSampled`: the number of product pages found. The text output says "of N found".
- `pagesChecked`, `pagesFailed`, `pagesSkipped`: counts of pages checked, failed to load, and skipped as not products.
- `checks`: the list of checks that ran.
- `counts`: maps each problem code to the number of checked pages that have it.
- `pages`: one entry per URL. Each entry is `{ "url", "problems" }`, or `{ "url", "error" }` if the fetch failed, or `{ "url", "skipped" }` for a non-product page.

The JSON is printed even when the exit code is 1 or 3, so you can save it as a CI artifact and read it there.

## What a run reads from the store

A run only sends GET requests. It reads the HTML the server returns and does not run the page's JavaScript, so markup that a script adds in the browser is not seen.

1. It fetches the store's home page to detect the platform.
2. For Shopify, or when the platform is unknown, it fetches `/products.json?limit=250`. It takes up to 250 products from that list and samples product pages from them. For other platforms it reads the product sitemap, and WooCommerce's Store API first when that is available.
3. It fetches each sampled product page.

Each run makes a fresh set of live requests. The result depends on what the store serves at that moment. A theme change can turn exit 0 into exit 1 with no change to this repo. Requests send the user agent `shopify-schema-audit/0.2 (+https://github.com/tlq5l/shopify-schema-audit)`. A store firewall that blocks it shows up as failed pages, and a run where every page fails exits 3.

For what each `schema` check reads from the page, see [search-console-checks.md](search-console-checks.md?ref=shopify-schema-audit-ci-how-to).

## Example workflow

This is an example. It is not enabled in this repo.

```yaml
name: schema-audit (example)
on:
  schedule:
    - cron: '0 6 * * 1'
  workflow_dispatch:
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          repository: tlq5l/shopify-schema-audit
          path: audit
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Run audit
        run: node audit/bin/audit.mjs https://your-store.com --sample 12 --checks schema,alt,gpsr --json > audit.json
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: schema-audit
          path: audit.json
```

The `if: always()` on the upload keeps `audit.json` when the audit step exits 1 or 3. Without it, the artifact is skipped on exactly the runs you most want to inspect.
