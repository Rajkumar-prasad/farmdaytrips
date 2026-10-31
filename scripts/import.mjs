// Turns data/usda.json (all US) into data/listings.json for the states in data/config.json.
// Run: node scripts/import.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { STATES, STATE_BY_NAME, CATEGORIES, slugify, titleCase, cleanText } from "./lib.mjs";

const config = JSON.parse(readFileSync("data/config.json", "utf8"));
const raw = JSON.parse(readFileSync("data/usda.json", "utf8"));
const wanted = new Set(config.states);

const STATE_TOKEN = new RegExp(`^(${Object.keys(STATES).join("|")}|${Object.values(STATES).join("|")})\\.?$`, "i");

function parseAddress(addr) {
  const a = cleanText(addr).replace(/,?\s*(USA|U\.S\.A?\.?|US|United States|Untied States)\s*(?=,|\s\d{5}|$)/gi, "");
  const zip = (a.match(/\b(\d{5})(?:-\d{4})?\b(?!.*\b\d{5}\b)/) || [])[1] || null;
  const parts = a.split(",").map((s) => s.trim()).filter(Boolean);
  let state = null, stateIdx = -1;
  for (let i = parts.length - 1; i >= 0; i--) {
    const token = parts[i].replace(/\b\d{5}(-\d{4})?\b/, "").trim();
    // "PA 17055" or "Pennsylvania" or "NJ"
    const m = token.match(/^(.*?)\s*\b([A-Za-z]{2}|[A-Za-z ]{4,20})$/);
    if (STATE_TOKEN.test(token)) { state = token; stateIdx = i; break; }
    if (m && STATE_TOKEN.test(m[2]) && !m[1]) { state = m[2]; stateIdx = i; break; }
    if (m && STATE_TOKEN.test(m[2].trim()) && m[1] && i === parts.length - 1) {
      // "Harrisburg PA 17101" (city and state in one part)
      state = m[2].trim(); stateIdx = i; parts.splice(i, 1, m[1].trim(), m[2].trim()); stateIdx = i + 1; break;
    }
  }
  if (!state) return { street: a, city: null, state: null, zip };
  const abbr = state.length === 2 ? state.toUpperCase() : STATE_BY_NAME[state.toLowerCase()];
  const city = stateIdx >= 1 ? parts[stateIdx - 1] : null;
  const street = stateIdx >= 2 ? parts.slice(0, stateIdx - 1).join(", ") : null;
  return { street, city, state: abbr, zip, single: stateIdx < 2 ? parts.slice(0, stateIdx).join(", ") : null };
}

// Pass 1: parse and keep wanted states.
const rows = [];
for (const r of raw) {
  const p = parseAddress(r.location_address || "");
  if (!p.state || !wanted.has(p.state)) continue;
  rows.push({ r, p });
}

// Known cities per state from clean addresses, used to split "123 Main St Townname" strings.
const knownCities = {};
for (const { p } of rows) {
  if (p.city && p.street && !/\d/.test(p.city) && p.city.length < 30) {
    (knownCities[p.state] ||= new Set()).add(titleCase(p.city));
  }
}
const zipCity = {};
for (const { p } of rows) if (p.city && p.street && p.zip && !/\d/.test(p.city)) zipCity[p.zip] ||= titleCase(p.city);
for (const { p } of rows) {
  if (p.city && p.street) continue;
  if (p.zip && zipCity[p.zip]) {
    const c = zipCity[p.zip];
    const text = p.single || p.street || p.city || "";
    p.street = text.toLowerCase().endsWith(" " + c.toLowerCase()) ? text.slice(0, -c.length).trim().replace(/,$/, "") : text;
    p.city = c;
    continue;
  }
  const text = p.single || p.city || p.street || "";
  const cities = [...(knownCities[p.state] || [])].sort((a, b) => b.length - a.length);
  const hit = cities.find((c) => text.toLowerCase().endsWith(" " + c.toLowerCase()));
  if (hit) { p.city = hit; p.street = text.slice(0, -hit.length).trim().replace(/,$/, ""); }
  else if (p.city && /\d/.test(p.city)) { p.street = p.city; p.city = null; }
}

function splitList(s) {
  return String(s || "").split(";").map((x) => cleanText(x)).filter(Boolean);
}

// Enrichment (contacts, seasons, photos) collected by scripts/enrich-usda.mjs.
const enrich = {};
for (const st of wanted) {
  const f = `data/enrich/${st}.json`;
  if (existsSync(f)) Object.assign(enrich, JSON.parse(readFileSync(f, "utf8")));
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MONTHNAMES = "January|February|March|April|May|June|July|August|September|October|November|December";
const RE_DATES = /^(\d{2})\/(\d{2})\/(\d{4}) to (\d{2})\/(\d{2})\/(\d{4})$/;
const RE_MONTHS = new RegExp(`^(${MONTHNAMES})( to (${MONTHNAMES}))?$`);
const RE_DAY = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)s?:\s*(.+)$/;
const HEADINGS = /^(Available products|Hands-on farm activities and experiences|Educational tours\/classes\/exhibits|Agri-entertainment|Food and beverage service|Overnight farm stays|Outdoor recreation|Events|Other activities|Other products)$/i;

// Turns the USDA "seasons" text into structured seasons.
function parseSeasons(lines) {
  if (!lines?.length) return [];
  const seasons = [];
  let cur = null, group = null, pendingLabel = null;
  const start = (label, when) => { cur = { label: label || null, ...when, hours: [], groups: [], notes: [] }; seasons.push(cur); group = null; };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    let m;
    if ((m = l.match(RE_DATES))) { start(pendingLabel, { from: `${m[3]}-${m[1]}-${m[2]}`, to: `${m[6]}-${m[4]}-${m[5]}`, year: +m[3] }); pendingLabel = null; continue; }
    if ((m = l.match(RE_MONTHS))) { start(pendingLabel, { months: m[3] ? `${m[1]} to ${m[3]}` : m[1] }); pendingLabel = null; continue; }
    const next = lines[i + 1] || "";
    if (!HEADINGS.test(l) && !RE_DAY.test(l) && !/closed|open|call|appointment/i.test(l) && (RE_DATES.test(next) || RE_MONTHS.test(next)) && l.length < 60) { pendingLabel = l; continue; }
    if (!cur) start(null, {});
    if ((m = l.match(RE_DAY))) { cur.hours.push({ day: m[1], time: m[2].replace(/\s*-\s*/, " - ") }); group = null; continue; }
    if (HEADINGS.test(l)) { group = { title: l.replace(/^Available products$/i, "Products"), items: [] }; cur.groups.push(group); continue; }
    if (group && l.length <= 60 && !/closed|open |call|appointment|please|www\.|http/i.test(l)) {
      group.items.push(...l.split(/,\s*/).map((x) => x.trim()).filter(Boolean));
      continue;
    }
    if (l.length > 3) cur.notes.push(l);
    group = null;
  }
  for (const s of seasons) for (const g of s.groups) g.items = [...new Set(g.items)];
  return seasons.filter((s) => s.hours.length || s.groups.some((g) => g.items.length) || s.notes.length || s.from || s.months);
}

// Pass 2: normalize.
const out = [];
const seen = new Map();
for (const { r, p } of rows) {
  const name = cleanText(r.listing_name).replace(/\\'/g, "'");
  if (!name) continue;
  const desc = cleanText(r.listing_desc).replace(/\\'/g, "'").replace(/\\"/g, '"');
  const city = p.city && !/\d/.test(p.city) ? titleCase(p.city) : null;
  const lat = parseFloat(r.location_y), lng = parseFloat(r.location_x);
  const type = r.directory === "farmersmarket" ? "market" : "farm";
  const e = enrich[`${r.directory}-${r.listing_id}`] || {};
  const seasons = parseSeasons(e.season);
  const seasonText = seasons.map((x) => [x.label, ...x.groups.flatMap((g) => g.items), ...x.notes].join(" ")).join(" ");
  const text = (name + " " + desc + " " + (r.services || "") + " " + seasonText).toLowerCase();
  const categories = CATEGORIES.filter((c) => c.test(text)).map((c) => c.slug);
  if (r.directory === "farmersmarket") categories.push("farmers-markets");
  if (r.directory === "onfarmmarket") categories.push("farm-stands");

  const listing = {
    id: `usda-${r.directory}-${r.listing_id}`,
    name,
    type,
    categories: [...new Set(categories)],
    street: p.street ? titleCase(p.street).replace(/,\s*[^,]+,\s*[A-Za-z]{2}\.?\s*\d{5}.*$/, "").replace(/,\s*[A-Za-z]{2}\s*\d{5}.*$/, "").trim().replace(/^0+(?=\d)/, "") || null : null,
    city,
    state: p.state,
    zip: p.zip,
    lat: Number.isFinite(lat) && lat !== 0 ? +lat.toFixed(5) : null,
    lng: Number.isFinite(lng) && lng !== 0 ? +lng.toFixed(5) : null,
    description: desc.length >= 40 ? desc : null,
    directions: cleanText(r.location_desc) || null,
    facilities: splitList(r.facilities),
    services: splitList(r.services),
    payment: splitList(r.acceptedpayment),
    practices: splitList(r.specialproductionmethods),
    indoor: r.location_indoor ? cleanText(r.location_indoor) : null,
    phone: e.phone || null,
    website: e.website || null,
    facebook: e.facebook || null,
    instagram: e.instagram || null,
    photo: e.photo || null,
    seasons,
    snap: (e.fnap || []).filter((x) => x.length < 40),
    usdaUrl: `https://www.usdalocalfoodportal.com/fe/flisting/?lid=${r.listing_id}&directory_type=${r.directory}`,
    updated: r.update_time ? r.update_time.slice(0, 10) : null,
    source: "USDA Local Food Directories",
  };

  // De-duplicate the same place listed in more than one USDA directory.
  const key = slugify(name).replace(/-and-|-/g, "") + "|" + (p.zip || city || "");
  if (seen.has(key)) {
    const prev = seen.get(key);
    prev.categories = [...new Set([...prev.categories, ...listing.categories])];
    if (!prev.description && listing.description) prev.description = listing.description;
    for (const f of ["facilities", "services", "payment", "practices", "snap"]) prev[f] = [...new Set([...prev[f], ...listing[f]])];
    for (const f of ["phone", "website", "facebook", "instagram", "photo"]) prev[f] ||= listing[f];
    if (!prev.seasons.length) prev.seasons = listing.seasons;
    continue;
  }
  seen.set(key, listing);
  out.push(listing);
}

// Stable, unique slugs.
const used = new Set();
for (const l of out) {
  let base = slugify(`${l.name} ${l.city || ""} ${l.state}`);
  let s = base, i = 2;
  while (used.has(s)) s = `${base}-${i++}`;
  used.add(s);
  l.slug = s;
}

out.sort((a, b) => a.state.localeCompare(b.state) || (a.city || "~").localeCompare(b.city || "~") || a.name.localeCompare(b.name));
writeFileSync("data/listings.json", JSON.stringify(out, null, 1) + "\n");

const byState = {};
for (const l of out) {
  const s = (byState[l.state] ||= { total: 0, described: 0, phone: 0, web: 0, seasons: 0, photo: 0 });
  s.total++; if (l.description) s.described++; if (l.phone) s.phone++; if (l.website || l.facebook) s.web++; if (l.seasons.length) s.seasons++; if (l.photo) s.photo++;
}
console.log("Imported", out.length, "listings", byState);
