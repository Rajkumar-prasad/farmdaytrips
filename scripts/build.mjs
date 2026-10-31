// Static site generator for farmdaytrips.com. Zero dependencies.
// Run: node scripts/build.mjs   ->  writes the site into public/
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { STATES, CATEGORIES, CAT, MONTHS, slugify, esc, listJoin } from "./lib.mjs";

const config = JSON.parse(readFileSync("data/config.json", "utf8"));
const SITE = config.site;
const MIN = config.minListingsPerPage || 3;
const OUT = "public";
const NOW = new Date();
const MONTH = NOW.getMonth() + 1;
const BUILD_DATE = NOW.toISOString().slice(0, 10);

// ---------- data ----------
const listings = [
  ...JSON.parse(readFileSync("data/listings.json", "utf8")),
  ...JSON.parse(readFileSync("data/manual.json", "utf8")).map((l) => ({ source: "Farm Day Trips", ...l })),
].filter((l) => config.states.includes(l.state));

for (const l of listings) {
  l.stateName = STATES[l.state];
  l.stateSlug = slugify(l.stateName);
  l.citySlug = l.city ? slugify(l.city) : null;
  // A full page only when there is enough real information to be useful.
  const extras = l.facilities.length + l.services.length + l.payment.length + (l.directions ? 1 : 0);
  l.hasPage = !!(l.description && (l.description.length >= 100 || (l.description.length >= 50 && extras >= 2)));
  l.url = l.hasPage ? `/farm/${l.slug}/` : null;
  l.mapUrl = l.lat
    ? `https://www.google.com/maps/dir/?api=1&destination=${l.lat},${l.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([l.name, l.street, l.city, l.state, l.zip].filter(Boolean).join(", "))}`;
}

const byState = group(listings, (l) => l.state);
const pages = []; // for sitemap

function group(arr, fn) {
  const m = new Map();
  for (const x of arr) {
    const k = fn(x);
    if (k == null) continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}
const plural = (n, one, many) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many || one + "s"}`;
const dist = (a, b) => {
  const toR = Math.PI / 180, R = 3958.8;
  const dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const centroid = (arr) => {
  const g = arr.filter((x) => x.lat);
  if (!g.length) return null;
  return { lat: g.reduce((s, x) => s + x.lat, 0) / g.length, lng: g.reduce((s, x) => s + x.lng, 0) / g.length };
};
const monthRange = (ms) => (ms.length === 1 ? MONTHS[ms[0] - 1] : `${MONTHS[ms[0] - 1]} to ${MONTHS[ms[ms.length - 1] - 1]}`);
const inSeasonNow = CATEGORIES.filter((c) => c.season.includes(MONTH) && !["farmers-markets", "farm-stands", "u-pick-farms"].includes(c.slug));

// ---------- index structures ----------
const stateData = [];
for (const st of config.states) {
  const items = byState.get(st) || [];
  const stateSlug = slugify(STATES[st]);
  const cats = CATEGORIES.map((c) => ({ c, items: items.filter((l) => l.categories.includes(c.slug)) })).filter((x) => x.items.length >= MIN);
  const cityGroups = [...group(items, (l) => l.citySlug).entries()]
    .map(([slug, arr]) => ({
      slug, name: arr[0].city, items: arr, center: centroid(arr),
      cats: CATEGORIES.map((c) => ({ c, items: arr.filter((l) => l.categories.includes(c.slug)) })).filter((x) => x.items.length >= MIN),
    }))
    .sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name));
  const cities = cityGroups.filter((g) => g.items.length >= MIN);
  stateData.push({ st, name: STATES[st], slug: stateSlug, items, cats, cities, allCities: cityGroups });
}

// ---------- templates ----------
const ICON = `<svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="18" r="11" fill="#c4501f"/><path d="M16 7c0-3 2-5 5-5-1 3-2 4-5 5z" fill="#2f5d34"/><path d="M16 8v4" stroke="#5a3a1a" stroke-width="2" stroke-linecap="round"/></svg>`;

function layout({ path, title, description, body, crumbs = [], schema = [], noindex = false }) {
  const canonical = SITE.url + path;
  const bc = crumbs.length
    ? {
        "@context": "https://schema.org", "@type": "BreadcrumbList",
        itemListElement: [{ name: "Home", path: "/" }, ...crumbs].map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: SITE.url + c.path })),
      }
    : null;
  const ld = [bc, ...schema].filter(Boolean).map((s) => `<script type="application/ld+json">${JSON.stringify(s).replace(/</g, "\\u003c")}</script>`).join("\n");
  const crumbHtml = crumbs.length
    ? `<nav class="crumbs wrap" aria-label="Breadcrumb"><a href="/">Home</a>${crumbs.map((c, i) => `<span>/</span>${i === crumbs.length - 1 ? esc(c.name) : `<a href="${c.path}">${esc(c.name)}</a>`}`).join("")}</nav>`
    : "";
  if (!noindex) pages.push(path);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
${noindex ? '<meta name="robots" content="noindex">' : ""}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(SITE.name)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta name="theme-color" content="#2f5d34">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
${ld}
</head>
<body>
<header class="site-head"><div class="wrap">
<a class="logo" href="/">${ICON}Farm Day <span>Trips</span></a>
<nav class="nav" aria-label="Main">
${stateData.map((s) => `<a href="/${s.slug}/">${esc(s.name)}</a>`).join("\n")}
<a href="/christmas-tree-farms/">Christmas Trees</a>
<a href="/farmers-markets/">Farmers Markets</a>
</nav>
</div></header>
${crumbHtml}
<main>
${body}
</main>
<footer class="site-foot"><div class="wrap">
<div class="cols">
<div style="max-width:340px"><strong>${esc(SITE.name)}</strong><p>${esc(SITE.tagline)}</p><p>Listings start from the public USDA Local Food Directories. Hours and seasons change, so please confirm with the farm before you go.</p></div>
<div><strong>Browse</strong><ul>${stateData.map((s) => `<li><a href="/${s.slug}/">${esc(s.name)}</a></li>`).join("")}<li><a href="/in-season/">What's in season</a></li></ul></div>
<div><strong>Categories</strong><ul>${CATEGORIES.filter((c) => pages.length === 0 || true).slice(0, 6).map((c) => `<li><a href="/${c.slug}/">${esc(c.name)}</a></li>`).join("")}</ul></div>
<div><strong>Site</strong><ul><li><a href="/about/">About</a></li><li><a href="/add-your-farm/">Add or update a farm</a></li><li><a href="/editorial-policy/">Editorial policy</a></li><li><a href="/contact/">Contact</a></li><li><a href="/privacy/">Privacy</a></li><li><a href="/terms/">Terms</a></li></ul></div>
</div>
<p style="margin-top:20px">&copy; ${NOW.getFullYear()} ${esc(SITE.name)}</p>
</div></footer>
</body>
</html>
`;
}

function tagsFor(l) {
  return l.categories.filter((c) => CAT[c]).slice(0, 4).map((c) => `<span class="tag${["christmas-tree-farms", "pumpkin-patches"].includes(c) ? " alt" : ""}">${esc(CAT[c].short)}</span>`).join("");
}

function card(l, showState = false) {
  const where = [l.street, l.city, showState ? l.state : null].filter(Boolean).join(", ");
  const nameHtml = l.url ? `<a href="${l.url}">${esc(l.name)}</a>` : esc(l.name);
  const blurb = l.description ? `<p style="margin:0;font-size:.93rem">${esc(l.description.length > 150 ? l.description.slice(0, 147).replace(/\s+\S*$/, "") + "..." : l.description)}</p>` : "";
  return `<article class="card">
<h3>${nameHtml}</h3>
<div class="addr">${esc(where || l.stateName)}${l.zip ? " " + esc(l.zip) : ""}</div>
<div class="tags">${tagsFor(l)}</div>
${blurb}
<div class="more">${l.url ? `<a href="${l.url}">View details</a> &middot; ` : ""}<a href="${l.mapUrl}" rel="nofollow noopener" target="_blank">Directions</a></div>
</article>`;
}

function itemList(name, items) {
  return {
    "@context": "https://schema.org", "@type": "ItemList", name,
    numberOfItems: items.length,
    itemListElement: items.slice(0, 50).map((l, i) => ({
      "@type": "ListItem", position: i + 1, name: l.name,
      ...(l.url ? { url: SITE.url + l.url } : {}),
    })),
  };
}

function faqHtml(faqs) {
  if (!faqs.length) return "";
  return `<h2>Common questions</h2>\n${faqs.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("\n")}`;
}

const freshness = (items) => {
  const years = items.map((l) => l.updated && +l.updated.slice(0, 4)).filter(Boolean).sort();
  const recent = years.filter((y) => y >= NOW.getFullYear() - 2).length;
  return `Listing details come from the USDA Local Food Directories, where ${recent ? `${Math.round((recent / items.length) * 100)}% of these listings were updated in the last two years` : "listings are updated by the farms themselves"}. Hours, prices and seasons change from year to year, so call or check the farm's own page before you drive out.`;
};

const sortItems = (arr) => [...arr].sort((a, b) => (b.hasPage - a.hasPage) || a.name.localeCompare(b.name));

function write(path, html) {
  const file = OUT + (path.endsWith("/") ? path + "index.html" : path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
}

// ---------- reset output ----------
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
copyFileSync("src/styles.css", OUT + "/styles.css");
writeFileSync(OUT + "/favicon.svg", ICON.replace('width="26" height="26" ', 'xmlns="http://www.w3.org/2000/svg" '));

// ---------- page builders ----------
function categoryIntro(c, placeName, items, cities) {
  const top = cities.slice(0, 3).map((g) => g.name);
  const s = [];
  s.push(`We list ${plural(items.length, "place")} for ${c.name.toLowerCase()} in ${placeName}${top.length ? `, with the most around ${listJoin(top)}` : ""}.`);
  if (c.slug === "christmas-tree-farms") s.push("Choose-and-cut season usually starts the weekend after Thanksgiving and runs until the trees sell out, often by mid-December, so earlier weekends have the best selection.");
  else if (c.slug === "pumpkin-patches") s.push("Most pumpkin patches open in late September and stay open through October, and the weekends before Halloween are the busiest.");
  else if (c.slug === "farmers-markets") s.push("Most markets run weekly from late spring through fall, and some larger ones keep a winter schedule.");
  else if (c.slug === "farm-stands") s.push("Farm stands sell straight from the farm, so what's on the table changes week to week with the harvest.");
  else s.push(`The main season is usually ${monthRange(c.season)}, but it shifts with the weather each year.`);
  return s.join(" ");
}

function categoryFaqs(c, placeName, items, cities) {
  const f = [];
  f.push({ q: `How many ${c.name.toLowerCase()} are listed in ${placeName}?`, a: `We currently list ${plural(items.length, "place")} in ${placeName}${cities.length ? `, spread across ${plural(cities.length, "town")}` : ""}.` });
  if (c.slug === "christmas-tree-farms") f.push({ q: "When should I go to cut a Christmas tree?", a: "The first two weekends after Thanksgiving have the widest choice. Many farms close for the season once their trees are tagged or sold, so check the farm's page before you go." });
  else f.push({ q: `When is the best time to visit?`, a: `Most ${c.name.toLowerCase()} are busiest from ${monthRange(c.season)}. Go early in the day on weekends to beat the crowds.` });
  f.push({ q: "Do I need to call ahead?", a: "Yes, it's a good idea. Farms set their hours around the harvest and the weather, and those can change at short notice." });
  return f;
}

function listSection(items, showState = false) {
  return `<div class="grid">\n${sortItems(items).map((l) => card(l, showState)).join("\n")}\n</div>`;
}

// State + category, city, city + category pages
for (const S of stateData) {
  const statePath = `/${S.slug}/`;
  const stateCrumb = { name: S.name, path: statePath };

  // State hub
  {
    const top = S.cities.slice(0, 4).map((g) => g.name);
    const counts = S.cats.map((x) => `${plural(x.items.length, x.c.short.toLowerCase().replace(/s$/, "") === x.c.short.toLowerCase() ? x.c.name.toLowerCase().replace(/s$/, "") : x.c.name.toLowerCase().replace(/s$/, ""))}`);
    const intro = `${S.name} has ${plural(S.items.length, "farm stop")} in our directory, from farmers markets and farm stands to pick-your-own fields and Christmas tree farms.${top.length ? ` The busiest areas are around ${listJoin(top)}.` : ""}`;
    const seasonal = inSeasonNow.map((c) => S.cats.find((x) => x.c.slug === c.slug)).filter(Boolean);
    const body = `<section class="wrap page-head">
<h1>Farm Day Trips in ${esc(S.name)}</h1>
<p>${esc(intro)}</p>
<div class="stats">${S.cats.map((x) => `<span class="stat"><b>${x.items.length}</b> ${esc(x.c.name.toLowerCase())}</span>`).join("")}</div>
</section>
<section class="wrap">
${seasonal.length ? `<h2>In season now (${MONTHS[MONTH - 1]})</h2><div class="tiles">${seasonal.map((x) => `<a class="tile" href="${statePath}${x.c.slug}/"><strong>${esc(x.c.name)}</strong><small>${x.items.length} in ${esc(S.name)}</small></a>`).join("")}</div>` : ""}
<h2>Browse by type</h2>
<div class="tiles">${S.cats.map((x) => `<a class="tile" href="${statePath}${x.c.slug}/"><strong>${esc(x.c.name)}</strong><small>${x.items.length} places</small></a>`).join("")}</div>
<h2>Browse by town</h2>
<div class="tiles">${S.cities.map((g) => `<a class="tile" href="${statePath}${g.slug}/"><strong>${esc(g.name)}</strong><small>${plural(g.items.length, "place")}</small></a>`).join("")}</div>
<div class="ad-slot"></div>
<h2>Farms with full details</h2>
${listSection(S.items.filter((l) => l.hasPage))}
<p class="notice" style="margin-top:18px">${esc(freshness(S.items))}</p>
</section>`;
    write(statePath, layout({
      path: statePath,
      title: `Farm Day Trips in ${S.name}: U-Pick, Pumpkins, Christmas Trees & Markets`,
      description: `Find ${S.items.length.toLocaleString()} farms and farmers markets in ${S.name}: u-pick fields, pumpkin patches, Christmas tree farms and farm stands, with directions.`,
      crumbs: [stateCrumb],
      body,
      schema: [itemList(`Farms in ${S.name}`, S.items.filter((l) => l.hasPage))],
    }));
  }

  // State + category
  for (const { c, items } of S.cats) {
    const path = `${statePath}${c.slug}/`;
    const cities = S.allCities.map((g) => ({ ...g, n: g.items.filter((l) => l.categories.includes(c.slug)).length })).filter((g) => g.n > 0).sort((a, b) => b.n - a.n);
    const cityPages = S.cities.filter((g) => g.cats.some((x) => x.c.slug === c.slug));
    const body = `<section class="wrap page-head">
<h1>${esc(c.name)} in ${esc(S.name)}</h1>
<p>${esc(categoryIntro(c, S.name, items, cities))}</p>
</section>
<section class="wrap">
${cityPages.length ? `<h2>By town</h2><div class="tiles">${cityPages.map((g) => `<a class="tile" href="${statePath}${g.slug}/${c.slug}/"><strong>${esc(g.name)}</strong><small>${g.cats.find((x) => x.c.slug === c.slug).items.length} places</small></a>`).join("")}</div>` : ""}
<h2>All ${esc(c.name.toLowerCase())} in ${esc(S.name)}</h2>
${listSection(items)}
<div class="ad-slot"></div>
<p class="notice" style="margin-top:18px">${esc(freshness(items))}</p>
${faqHtml(categoryFaqs(c, S.name, items, cities))}
<h2>More in ${esc(S.name)}</h2>
<div class="tiles">${S.cats.filter((x) => x.c.slug !== c.slug).map((x) => `<a class="tile" href="${statePath}${x.c.slug}/"><strong>${esc(x.c.name)}</strong><small>${x.items.length} places</small></a>`).join("")}</div>
</section>`;
    write(path, layout({
      path,
      title: `${c.name} in ${S.name} (${items.length} Listed)`,
      description: `${items.length} ${c.name.toLowerCase()} in ${S.name}${cities[0] ? `, including ${listJoin(cities.slice(0, 3).map((g) => g.name))}` : ""}. Addresses, directions and what to know before you go.`,
      crumbs: [stateCrumb, { name: c.name, path }],
      body,
      schema: [itemList(`${c.name} in ${S.name}`, items)],
    }));
  }

  // City pages
  for (const g of S.cities) {
    const path = `${statePath}${g.slug}/`;
    const nearby = g.center
      ? S.cities.filter((o) => o !== g && o.center).map((o) => ({ o, d: dist(g.center, o.center) })).sort((a, b) => a.d - b.d).slice(0, 8)
      : [];
    const typeCounts = CATEGORIES.map((c) => ({ c, n: g.items.filter((l) => l.categories.includes(c.slug)).length })).filter((x) => x.n);
    const intro = `There ${g.items.length === 1 ? "is" : "are"} ${plural(g.items.length, "farm stop")} listed in and around ${g.name}, ${S.name}${typeCounts.length ? `, including ${listJoin(typeCounts.slice(0, 3).map((x) => `${x.n} ${x.c.short.toLowerCase()}`))}` : ""}.${nearby.length ? ` Nearby towns with more options include ${listJoin(nearby.slice(0, 3).map((x) => x.o.name))}.` : ""}`;
    const body = `<section class="wrap page-head">
<h1>Farms &amp; Farmers Markets in ${esc(g.name)}, ${esc(S.st)}</h1>
<p>${esc(intro)}</p>
${g.cats.length ? `<div class="stats">${g.cats.map((x) => `<a class="stat" href="${path}${x.c.slug}/"><b>${x.items.length}</b> ${esc(x.c.name.toLowerCase())}</a>`).join("")}</div>` : ""}
</section>
<section class="wrap">
${listSection(g.items)}
<div class="ad-slot"></div>
<p class="notice" style="margin-top:18px">${esc(freshness(g.items))}</p>
${nearby.length ? `<h2>Nearby towns</h2><div class="tiles">${nearby.map((x) => `<a class="tile" href="${statePath}${x.o.slug}/"><strong>${esc(x.o.name)}</strong><small>${Math.round(x.d)} miles away &middot; ${x.o.items.length} places</small></a>`).join("")}</div>` : ""}
</section>`;
    write(path, layout({
      path,
      title: `Farms, Farm Stands & Farmers Markets in ${g.name}, ${S.st}`,
      description: `${plural(g.items.length, "farm stop")} in ${g.name}, ${S.name}: farm stands, farmers markets and pick-your-own farms, with addresses and directions.`,
      crumbs: [stateCrumb, { name: g.name, path }],
      body,
      schema: [itemList(`Farms in ${g.name}, ${S.st}`, g.items)],
    }));

    for (const { c, items } of g.cats) {
      const cpath = `${path}${c.slug}/`;
      const body2 = `<section class="wrap page-head">
<h1>${esc(c.name)} in ${esc(g.name)}, ${esc(S.st)}</h1>
<p>${esc(categoryIntro(c, `${g.name}, ${S.name}`, items, []))}</p>
</section>
<section class="wrap">
${listSection(items)}
<div class="ad-slot"></div>
<p class="notice" style="margin-top:18px">${esc(freshness(items))}</p>
<h2>More options</h2>
<div class="tiles"><a class="tile" href="${statePath}${c.slug}/"><strong>${esc(c.name)} across ${esc(S.name)}</strong><small>${S.cats.find((x) => x.c.slug === c.slug)?.items.length || ""} places</small></a><a class="tile" href="${path}"><strong>Everything in ${esc(g.name)}</strong><small>${g.items.length} places</small></a></div>
</section>`;
      write(cpath, layout({
        path: cpath,
        title: `${c.name} in ${g.name}, ${S.st}`,
        description: `${plural(items.length, "place")} for ${c.name.toLowerCase()} in and around ${g.name}, ${S.name}, with addresses, directions and seasonal tips.`,
        crumbs: [stateCrumb, { name: g.name, path }, { name: c.name, path: cpath }],
        body: body2,
        schema: [itemList(`${c.name} in ${g.name}, ${S.st}`, items)],
      }));
    }
  }
}

// Listing pages
for (const l of listings.filter((x) => x.hasPage)) {
  const S = stateData.find((s) => s.st === l.state);
  const statePath = `/${S.slug}/`;
  const cityPage = l.citySlug && S.cities.find((g) => g.slug === l.citySlug);
  const near = l.lat ? listings.filter((o) => o !== l && o.lat).map((o) => ({ o, d: dist(l, o) })).sort((a, b) => a.d - b.d).slice(0, 6) : [];
  const facts = [
    ["Address", [l.street, l.city, `${l.state}${l.zip ? " " + l.zip : ""}`].filter(Boolean).join(", ")],
    ["Type", l.categories.filter((c) => CAT[c]).map((c) => CAT[c].short).join(", ") || (l.type === "market" ? "Farmers market" : "Farm")],
    l.facilities.length ? ["Facilities", l.facilities.join(", ")] : null,
    l.services.length ? ["Services", l.services.join(", ")] : null,
    l.payment.length ? ["Payment", l.payment.join(", ")] : null,
    l.practices.length ? ["Growing practices", l.practices.join(", ")] : null,
    l.updated ? ["Listing last updated", l.updated] : null,
  ].filter(Boolean);
  const crumbs = [{ name: S.name, path: statePath }];
  if (cityPage) crumbs.push({ name: cityPage.name, path: `${statePath}${cityPage.slug}/` });
  crumbs.push({ name: l.name, path: l.url });
  const biz = {
    "@context": "https://schema.org", "@type": "LocalBusiness", name: l.name, url: SITE.url + l.url,
    description: l.description,
    address: { "@type": "PostalAddress", streetAddress: l.street || undefined, addressLocality: l.city || undefined, addressRegion: l.state, postalCode: l.zip || undefined, addressCountry: "US" },
    ...(l.lat ? { geo: { "@type": "GeoCoordinates", latitude: l.lat, longitude: l.lng } } : {}),
    ...(l.payment.length ? { paymentAccepted: l.payment.join(", ") } : {}),
  };
  const body = `<section class="wrap page-head">
<h1>${esc(l.name)}</h1>
<p>${esc([l.city, S.name].filter(Boolean).join(", "))}</p>
<div class="tags">${tagsFor(l)}</div>
</section>
<section class="wrap detail">
<div>
<div class="box">
<h2 style="margin-top:0">About ${esc(l.name)}</h2>
<p>${esc(l.description)}</p>
${l.directions ? `<h3>Getting there</h3><p>${esc(l.directions)}</p>` : ""}
<p style="margin-top:16px"><a class="btn" href="${l.mapUrl}" rel="nofollow noopener" target="_blank">Get directions</a></p>
</div>
<div class="ad-slot"></div>
${near.length ? `<h2>Nearby farm stops</h2><div class="grid">${near.map((x) => card(x.o)).join("\n")}</div>` : ""}
</div>
<aside>
<div class="box"><ul class="facts">${facts.map(([k, v]) => `<li><span>${esc(k)}</span><strong>${esc(v)}</strong></li>`).join("")}</ul></div>
<p class="notice" style="margin-top:14px">Details come from the ${esc(l.source)}. Seasons and hours change, so confirm with the farm before visiting. Own this farm? <a href="/add-your-farm/">Update this listing</a>.</p>
</aside>
</section>`;
  write(l.url, layout({
    path: l.url,
    title: `${l.name} - ${[l.city, l.state].filter(Boolean).join(", ")}`,
    description: (l.description.length > 155 ? l.description.slice(0, 152).replace(/\s+\S*$/, "") + "..." : l.description),
    crumbs,
    body,
    schema: [biz],
  }));
}

// National category hubs
for (const c of CATEGORIES) {
  const per = stateData.map((S) => ({ S, x: S.cats.find((x) => x.c.slug === c.slug) })).filter((r) => r.x);
  if (!per.length) continue;
  const path = `/${c.slug}/`;
  const total = per.reduce((s, r) => s + r.x.items.length, 0);
  const featured = sortItems(per.flatMap((r) => r.x.items)).filter((l) => l.hasPage).slice(0, 12);
  const body = `<section class="wrap page-head">
<h1>${esc(c.name)}</h1>
<p>${esc(`We list ${plural(total, "place")} for ${c.name.toLowerCase()} across ${listJoin(per.map((r) => r.S.name))}. Pick a state to see every listing, sorted by town.`)}</p>
</section>
<section class="wrap">
<div class="tiles">${per.map((r) => `<a class="tile" href="/${r.S.slug}/${c.slug}/"><strong>${esc(r.S.name)}</strong><small>${r.x.items.length} places</small></a>`).join("")}</div>
${featured.length ? `<h2>Featured listings</h2>${`<div class="grid">${featured.map((l) => card(l, true)).join("\n")}</div>`}` : ""}
<div class="ad-slot"></div>
<p class="notice" style="margin-top:18px">Typical season: ${esc(monthRange(c.season))}. Every farm sets its own dates, so check before you go.</p>
</section>`;
  write(path, layout({
    path,
    title: `${c.name} Near You: Find ${c.name} by State`,
    description: `Find ${c.name.toLowerCase()} by state and town, with addresses, directions and seasonal tips.`,
    crumbs: [{ name: c.name, path }],
    body,
  }));
}

// In-season page
{
  const path = "/in-season/";
  const rows = MONTHS.map((m, i) => {
    const cats = CATEGORIES.filter((c) => c.season.includes(i + 1) && !["farmers-markets", "farm-stands", "u-pick-farms"].includes(c.slug));
    return `<li><span>${m}</span><strong>${cats.length ? cats.map((c) => `<a href="/${c.slug}/">${esc(c.name)}</a>`).join(", ") : "Farm stores and winter markets"}</strong></li>`;
  }).join("");
  write(path, layout({
    path,
    title: "What's in Season at Farms: A Month-by-Month Guide",
    description: "A month-by-month guide to farm outings: strawberry and berry picking, apple orchards, pumpkin patches, corn mazes and Christmas tree farms.",
    crumbs: [{ name: "What's in season", path }],
    body: `<section class="wrap page-head prose"><h1>What's in season, month by month</h1><p>Seasons in Pennsylvania and North Carolina run a few weeks apart, and every year's weather moves them a little. Use this as a rough guide, then check the farm's own page before you go.</p></section>
<section class="wrap"><div class="box" style="max-width:760px"><ul class="facts">${rows}</ul></div></section>`,
  }));
}

// Home
{
  const total = listings.length;
  const featuredCats = CATEGORIES.map((c) => ({ c, n: listings.filter((l) => l.categories.includes(c.slug)).length })).filter((x) => x.n >= MIN);
  const body = `<section class="wrap hero">
<h1>Plan your next day at the farm</h1>
<p class="lead">${esc(SITE.tagline)} ${total.toLocaleString()} farm stops listed so far.</p>
<form class="search" role="search" onsubmit="return false">
<input id="q" type="search" placeholder="Search a town, state or farm name" aria-label="Search farms" autocomplete="off">
<button type="button" id="go">Search</button>
</form>
<div id="results" class="grid" style="margin-top:16px"></div>
</section>
<section class="wrap">
${inSeasonNow.length ? `<h2>In season now: ${MONTHS[MONTH - 1]}</h2><div class="tiles">${inSeasonNow.filter((c) => featuredCats.some((x) => x.c === c)).map((c) => `<a class="tile" href="/${c.slug}/"><strong>${esc(c.name)}</strong><small>Typical season: ${esc(monthRange(c.season))}</small></a>`).join("")}</div>` : ""}
<h2>Browse by state</h2>
<div class="tiles">${stateData.map((s) => `<a class="tile" href="/${s.slug}/"><strong>${esc(s.name)}</strong><small>${plural(s.items.length, "farm stop")}</small></a>`).join("")}</div>
<h2>Browse by type</h2>
<div class="tiles">${featuredCats.map((x) => `<a class="tile" href="/${x.c.slug}/"><strong>${esc(x.c.name)}</strong><small>${x.n} listed</small></a>`).join("")}</div>
<h2>How we build this directory</h2>
<p class="prose">We start from the USDA Local Food Directories, a public list that farms and markets keep up to date themselves, then organize it by state, town and season so you can plan a day out quickly. We add details as farms send them in. Spotted something out of date? <a href="/add-your-farm/">Let us know</a>.</p>
</section>
<script>
(function(){var idx=null,q=document.getElementById('q'),out=document.getElementById('results');
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function run(){var t=q.value.trim().toLowerCase();if(t.length<2){out.innerHTML='';return}
var go=function(){var r=idx.filter(function(x){return x.k.indexOf(t)>-1}).slice(0,24);
out.innerHTML=r.length?r.map(function(x){return '<a class="tile" href="'+x.u+'"><strong>'+esc(x.n)+'</strong><small>'+esc(x.d)+'</small></a>'}).join(''):'<p>No matches yet. Try a nearby town or the state name.</p>'};
if(idx)return go();fetch('/search-index.json').then(function(r){return r.json()}).then(function(d){idx=d;go()})}
q.addEventListener('input',run);document.getElementById('go').addEventListener('click',run)})();
</script>`;
  write("/", layout({
    path: "/",
    title: "Farm Day Trips: U-Pick Farms, Pumpkin Patches, Christmas Tree Farms & Markets",
    description: `${SITE.tagline} Browse ${total.toLocaleString()} farm stops by state, town and season.`,
    body,
    schema: [{ "@context": "https://schema.org", "@type": "WebSite", name: SITE.name, url: SITE.url + "/" }],
  }));
}

// Search index: towns, state/category pages and full listings
{
  const idx = [];
  for (const S of stateData) {
    idx.push({ n: S.name, d: `${S.items.length} farm stops`, u: `/${S.slug}/`, k: S.name.toLowerCase() + " " + S.st.toLowerCase() });
    for (const g of S.cities) idx.push({ n: `${g.name}, ${S.st}`, d: `${g.items.length} farm stops`, u: `/${S.slug}/${g.slug}/`, k: `${g.name} ${S.name} ${S.st}`.toLowerCase() });
    for (const x of S.cats) idx.push({ n: `${x.c.name} in ${S.name}`, d: `${x.items.length} places`, u: `/${S.slug}/${x.c.slug}/`, k: `${x.c.name} ${x.c.short} ${S.name}`.toLowerCase() });
  }
  for (const l of listings.filter((x) => x.hasPage)) idx.push({ n: l.name, d: [l.city, l.state].filter(Boolean).join(", "), u: l.url, k: `${l.name} ${l.city || ""} ${l.state}`.toLowerCase() });
  writeFileSync(OUT + "/search-index.json", JSON.stringify(idx));
}

// Static content pages
const prose = (path, title, description, html) =>
  write(path, layout({ path, title, description, crumbs: [{ name: title.split(" |")[0], path }], body: `<section class="wrap page-head prose"><h1>${esc(title.split(" |")[0])}</h1>${html}</section>` }));

prose("/about/", "About Farm Day Trips", "Why Farm Day Trips exists and how the directory is put together.", `
<p>Farm Day Trips helps families find a good day out at a farm: picking strawberries in spring, apples and pumpkins in the fall, and a fresh-cut tree in December. It also covers the farmers markets and farm stands where you can buy straight from the people who grow your food.</p>
<h2>Where the listings come from</h2>
<p>Our starting point is the USDA Local Food Directories, a free public list run by the U.S. Department of Agriculture where farms and markets register and update their own details. We organize those listings by state, town and season, add context about what to expect, and fold in corrections that farms and visitors send us.</p>
<h2>What we don't do</h2>
<p>We don't accept payment to rank farms higher, and we don't publish made-up reviews. If a farm pays for an ad on this site, it is clearly marked as an ad.</p>
<p>Questions or corrections: <a href="mailto:${SITE.email}">${SITE.email}</a>.</p>`);

prose("/editorial-policy/", "Editorial Policy", "How Farm Day Trips sources, checks and updates its farm listings.", `
<p>Every listing on this site has a source. Most come from the USDA Local Food Directories, and each listing page shows when its details were last updated there.</p>
<h2>How we decide what gets a full page</h2>
<p>A farm gets its own page only when we have enough real information to help you plan a visit, such as a description of what the farm offers, facilities, or directions. Other farms appear in town and state lists with an address and a directions link, so you can still find them.</p>
<h2>Corrections</h2>
<p>Farm details change. If you run a farm or spot an error, <a href="/add-your-farm/">send us an update</a> and we'll fix it, usually within a week.</p>
<h2>Seasonal information</h2>
<p>Season dates on this site are typical ranges, not promises. Weather moves harvests earlier or later each year, so always check with the farm.</p>`);

prose("/add-your-farm/", "Add or Update a Farm", "Add your farm, farm stand or farmers market to Farm Day Trips, or correct an existing listing.", `
<p>Listing your farm is free. Send us an email with the details below and we'll add or update your listing.</p>
<ul>
<li>Farm or market name and full address</li>
<li>What visitors can do or buy (u-pick crops, pumpkins, Christmas trees, farm store, events)</li>
<li>Season dates and opening hours</li>
<li>Phone number and website or Facebook page</li>
<li>Facilities such as parking, restrooms or a picnic area</li>
</ul>
<p><a class="btn" href="mailto:${SITE.email}?subject=Farm%20listing">Email ${SITE.email}</a></p>
<p>You can also keep your details current in the <a href="https://www.usdalocalfoodportal.com/" rel="noopener" target="_blank">USDA Local Food Directories</a>, which we refresh regularly.</p>`);

prose("/contact/", "Contact Farm Day Trips", "Get in touch with Farm Day Trips.", `
<p>For corrections, new listings, partnerships or anything else, email <a href="mailto:${SITE.email}">${SITE.email}</a>. We read every message.</p>`);

prose("/privacy/", "Privacy Policy", "How Farm Day Trips handles visitor data, cookies and advertising.", `
<p>Last updated: ${BUILD_DATE}</p>
<h2>What we collect</h2>
<p>We don't ask you to create an account. Like most websites, our hosting provider keeps basic server logs (such as IP address, browser type and pages visited) to keep the site secure and running.</p>
<h2>Cookies and advertising</h2>
<p>We may show ads from third-party advertising partners such as Google. These partners may use cookies to show ads based on your visits to this and other websites. Google's use of advertising cookies lets it and its partners serve ads based on your visits to this site and other sites on the internet. You can opt out of personalized advertising by visiting Google's <a href="https://adssettings.google.com" rel="noopener" target="_blank">Ads Settings</a>, or <a href="https://www.aboutads.info/choices/" rel="noopener" target="_blank">aboutads.info</a>.</p>
<h2>Analytics</h2>
<p>We may use privacy-friendly analytics to understand which pages are useful. This data is aggregated and not used to identify you.</p>
<h2>Emails</h2>
<p>If you email us, we use your address only to reply.</p>
<h2>Contact</h2>
<p>Questions about this policy: <a href="mailto:${SITE.email}">${SITE.email}</a>.</p>`);

prose("/terms/", "Terms of Use", "Terms for using the Farm Day Trips website.", `
<p>Last updated: ${BUILD_DATE}</p>
<p>Farm Day Trips is an information directory. We work to keep listings accurate, but farm hours, prices, seasons and availability change and we can't guarantee them. Always confirm with the farm before visiting.</p>
<p>Visiting a farm is at your own risk, and each farm sets its own rules. We aren't responsible for the products, services or safety of any listed business.</p>
<p>Listing data from the USDA Local Food Directories is public information. The site design and original text are owned by Farm Day Trips.</p>
<p>Questions: <a href="mailto:${SITE.email}">${SITE.email}</a>.</p>`);

// 404
write("/404.html", layout({
  path: "/404.html", noindex: true,
  title: "Page not found | Farm Day Trips",
  description: "This page could not be found.",
  body: `<section class="wrap page-head"><h1>We couldn't find that page</h1><p>It may have moved. Try a state below or <a href="/">search from the home page</a>.</p><div class="tiles">${stateData.map((s) => `<a class="tile" href="/${s.slug}/"><strong>${esc(s.name)}</strong></a>`).join("")}</div></section>`,
}));

// robots + sitemap
writeFileSync(OUT + "/robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${SITE.url}/sitemap.xml\n`);
writeFileSync(OUT + "/sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map((p) => `<url><loc>${SITE.url}${p}</loc><lastmod>${BUILD_DATE}</lastmod></url>`).join("\n")}\n</urlset>\n`);
if (existsSync("src/ads.txt")) copyFileSync("src/ads.txt", OUT + "/ads.txt");

const counts = {
  listings: listings.length,
  listingPages: listings.filter((l) => l.hasPage).length,
  totalPages: pages.length,
  cityPages: stateData.reduce((s, S) => s + S.cities.length, 0),
};
console.log("Built", counts);
