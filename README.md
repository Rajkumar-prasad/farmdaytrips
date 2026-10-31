# farmdaytrips.com

Static farm directory: u-pick farms, pumpkin patches, Christmas tree farms, farm stands and farmers markets.
No framework, no dependencies. Node builds plain HTML into `public/`, and Vercel serves it.

## How it fits together

| Path | What it is |
|---|---|
| `data/usda.json` | All US listings from the USDA Local Food Directories (refreshed monthly by GitHub Actions) |
| `data/config.json` | Site name, email, **which states are live**, minimum listings per page |
| `data/listings.json` | Listings for the live states, made by `scripts/import.mjs` |
| `data/manual.json` | Farms we add or fix by hand (same fields as listings.json) |
| `scripts/build.mjs` | Generates every page, sitemap, robots.txt and search index |
| `src/styles.css` | Site design |

## Common tasks

- **Add a state:** add its code to `states` in `data/config.json`, then `node scripts/import.mjs && node scripts/build.mjs`.
- **Rebuild locally:** `node scripts/build.mjs` (output in `public/`, not committed; Vercel builds it on every push).
- **Refresh USDA data:** GitHub > Actions > "Fetch USDA farm data" > Run workflow (also runs on the 1st of each month).

## Quality rules

- City, category and city+category pages are only created with 3 or more listings.
- A farm gets its own page only when it has a real description; others appear as cards with a directions link.
- Ad slots (`.ad-slot`) are empty until an ad network is approved.
