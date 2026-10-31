// Adds contact details, websites, seasons, hours, products and photos to
// USDA listings for the live states. Runs in GitHub Actions (the build
// workspace cannot reach the USDA site). Output: data/enrich/<ST>.json and
// src/photos/*.webp
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import sharp from "sharp";
import { STATES } from "./lib.mjs";

const API = "https://www.usdalocalfoodportal.com/api/";
const H = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  "Accept": "application/json,text/html,*/*",
  "Referer": "https://www.usdalocalfoodportal.com/",
};
const DIRS = ["agritourism", "onfarmmarket", "farmersmarket"];
const config = JSON.parse(readFileSync("data/config.json", "utf8"));
const onlyStates = (process.env.STATES || config.states.join(",")).split(",").map((s) => s.trim()).filter(Boolean);
const MAX_PHOTOS = +(process.env.MAX_PHOTOS || 4000);

mkdirSync("data/enrich", { recursive: true });
mkdirSync("src/photos", { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url, asJson = true, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: H });
      if (r.ok) return asJson ? JSON.parse(await r.text()) : Buffer.from(await r.arrayBuffer());
      if (r.status === 404) return null;
    } catch {}
    await sleep(800 * (i + 1));
  }
  return null;
}
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const it = items[i++]; await fn(it); await sleep(120); }
  }));
}
const clean = (s) => String(s || "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#039;|&#39;/g, "'").replace(/\s+/g, " ").trim();
const lines = (html) => String(html || "")
  .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(div|li|span|p|ul)>/gi, "\n").replace(/<[^>]+>/g, "")
  .split("\n").map(clean).filter(Boolean);
const okUrl = (u) => {
  u = clean(u);
  if (!u || u.length < 6 || /^n\/?a$/i.test(u)) return null;
  if (!/^https?:\/\//i.test(u)) u = "https://" + u.replace(/^\/+/, "");
  try { return new URL(u).toString(); } catch { return null; }
};
const okPhone = (p) => {
  const d = String(p || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : null;
};

// Where USDA serves listing photos.
let imagePath = null;
{
  const js = await get("https://www.usdalocalfoodportal.com/listings/jsmy/js_utilities.js", false);
  const m = js && js.toString().match(/image_path\s*=\s*["']([^"']+)["']/);
  imagePath = m ? m[1].replace(/\/$/, "") : null;
  if (imagePath && imagePath.startsWith("/")) imagePath = "https://www.usdalocalfoodportal.com" + imagePath;
  console.log("image path:", imagePath);
}

const bulk = JSON.parse(readFileSync("data/usda.json", "utf8"));
let photos = 0;

for (const st of onlyStates) {
  const name = STATES[st];
  const out = {};
  const prevFile = `data/enrich/${st}.json`;
  const prev = existsSync(prevFile) ? JSON.parse(readFileSync(prevFile, "utf8")) : {};

  // 1) Contact details from the search endpoint (plain text there).
  for (const dir of DIRS) {
    for (const q of [name, st]) {
      const url = `${API}get_searchresult_list/?mydata[directory]=${dir}&mydata[location_state]=${encodeURIComponent(q)}`;
      const res = await get(url);
      for (const r of res?.data || []) {
        const key = `${r.directory_type}-${r.listing_id}`;
        const e = (out[key] ||= { key });
        e.phone ||= okPhone(r.contact_phone);
        e.website ||= okUrl(r.media_website);
        e.facebook ||= okUrl(r.media_facebook);
        e.instagram ||= okUrl(r.media_instagram);
        if (r.listing_image && !/^default-/.test(r.listing_image)) e.image ||= r.listing_image;
      }
      await sleep(300);
    }
  }

  // 2) Seasons, hours, products from the detail endpoint, for every listing in this state.
  const ids = new Set(Object.keys(out));
  for (const r of bulk) {
    const a = r.location_address || "";
    if (new RegExp(`(,|\\s)(${st}|${name})\\.?,?\\s*\\d{5}|(,|\\s)(${st}|${name})\\s*$`, "i").test(a)) ids.add(`${r.directory}-${r.listing_id}`);
  }
  const todo = [...ids];
  console.log(st, "listings to enrich:", todo.length);
  await pool(todo, 4, async (key) => {
    const [dir, id] = key.split("-");
    const d = await get(`${API}listinginfo/?lid=${id}&directory_type=${dir}`);
    const e = (out[key] ||= { key });
    if (!d) return;
    if (d.image && !/^default-/.test(d.image)) e.image ||= d.image;
    const links = [...String(d.soical_media || "").matchAll(/href='([^']+)'/g)].map((m) => okUrl(m[1].replace(/\\\//g, "/"))).filter(Boolean);
    for (const u of links) {
      if (/facebook\.com/i.test(u)) e.facebook ||= u;
      else if (/instagram\.com/i.test(u)) e.instagram ||= u;
      else if (!/twitter\.com|x\.com|pinterest|youtube/i.test(u)) e.website ||= u;
    }
    const season = lines(d.seasonproducts).filter((l) => !/^Season\(s\)$/i.test(l));
    if (season.length) e.season = season.slice(0, 120);
    const profile = lines(d.profile);
    if (profile.length) e.profile = profile.slice(0, 40);
    const fnap = lines(d.fnap).filter((l) => !/Accepted Food and Nutrition/i.test(l));
    if (fnap.length) e.fnap = fnap;
    const sales = lines(d.saleschannel);
    if (sales.length) e.sales = sales;
  });

  // 3) Photos: download, resize and store as small WebP files.
  if (imagePath) {
    const withImg = Object.values(out).filter((e) => e.image);
    await pool(withImg, 3, async (e) => {
      const file = `src/photos/${e.key}.webp`;
      if (existsSync(file) && prev[e.key]?.image === e.image) { e.photo = `/photos/${e.key}.webp`; return; }
      if (photos >= MAX_PHOTOS) return;
      const buf = await get(`${imagePath}/${encodeURIComponent(e.image)}`, false, 2);
      if (!buf || buf.length < 2000) return;
      try {
        const img = sharp(buf).rotate();
        const meta = await img.metadata();
        if ((meta.width || 0) < 240) return;
        await img.resize({ width: 720, height: 480, fit: "cover", withoutEnlargement: true }).webp({ quality: 68 }).toFile(file);
        e.photo = `/photos/${e.key}.webp`;
        photos++;
      } catch {}
    });
  }

  const enriched = Object.values(out).filter((e) => Object.keys(e).length > 1);
  writeFileSync(prevFile, JSON.stringify(Object.fromEntries(enriched.map((e) => [e.key, e]))) + "\n");
  console.log(st, "enriched:", enriched.length,
    "phone:", enriched.filter((e) => e.phone).length,
    "web:", enriched.filter((e) => e.website || e.facebook).length,
    "season:", enriched.filter((e) => e.season).length,
    "photo:", enriched.filter((e) => e.photo).length);
}
