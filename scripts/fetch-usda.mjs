// Downloads the public USDA Local Food Directories (public domain data) and
// saves a slim copy (only the fields the site uses) to data/usda.json.
// Runs inside GitHub Actions (see .github/workflows/fetch-data.yml),
// because the build workspace cannot reach the USDA site directly.
import { writeFile } from "node:fs/promises";

const DIRECTORIES = ["agritourism", "onfarmmarket", "farmersmarket"];
const BASES = [
  "https://www.usdalocalfoodportal.com/api/download_by_directory/?directory=",
  "https://www.usdalocalfoodportal.com/api/download_by_directory?directory=",
];
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  "Accept": "application/json,text/plain,*/*",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://www.usdalocalfoodportal.com/fe/datasharing/",
};
const KEEP = [
  "listing_id", "update_time", "listing_name", "location_address", "listing_desc",
  "location_x", "location_y", "location_desc", "facilities", "services",
  "acceptedpayment", "specialproductionmethods", "location_indoor", "FNAP",
];

const out = [];
const report = {};
for (const dir of DIRECTORIES) {
  let res;
  for (const base of BASES) {
    res = await fetch(base + dir, { headers: HEADERS });
    if (res.ok) break;
  }
  if (!res.ok) throw new Error(`${dir}: HTTP ${res.status}`);
  const rows = JSON.parse(await res.text());
  for (const r of rows) {
    const slim = { directory: dir };
    for (const k of KEEP) if (r[k] != null && r[k] !== "") slim[k] = r[k];
    out.push(slim);
  }
  report[dir] = rows.length;
  console.log(dir, rows.length);
}
if (out.length < 10000) throw new Error("Suspiciously few rows, not overwriting data");

out.sort((a, b) => (a.directory + a.listing_id).localeCompare(b.directory + b.listing_id));
await writeFile("data/usda.json", JSON.stringify(out));
await writeFile("data/usda-report.json", JSON.stringify({ fetched_at: new Date().toISOString(), report }, null, 2) + "\n");
