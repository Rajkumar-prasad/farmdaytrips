// One-off probe of USDA endpoints; saves raw responses to data/samples/.
import { writeFile, mkdir } from "node:fs/promises";
const H = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36", "Accept": "application/json,text/html,*/*", "Referer": "https://www.usdalocalfoodportal.com/fe/fdirectory_farmersmarket/" };
await mkdir("data/samples", { recursive: true });
const tries = {
  search_state: "https://www.usdalocalfoodportal.com/api/get_searchresult_list/?mydata[directory]=agritourism&mydata[location_state]=Pennsylvania",
  search_state_abbr: "https://www.usdalocalfoodportal.com/api/get_searchresult_list/?mydata[directory]=agritourism&mydata[location_state]=PA",
  search_zip: "https://www.usdalocalfoodportal.com/api/get_searchresult_list/?mydata[directory]=onfarmmarket&mydata[location]=27565&mydata[radius]=100",
  detail_15142: "https://www.usdalocalfoodportal.com/api/listinginfo/?lid=15142&directory_type=agritourism",
  detail_700266: "https://www.usdalocalfoodportal.com/api/listinginfo/?lid=700266&directory_type=onfarmmarket",
  page_15142: "https://www.usdalocalfoodportal.com/fe/flisting/?lid=15142&directory_type=agritourism",
};
for (const [k, u] of Object.entries(tries)) {
  try {
    const r = await fetch(u, { headers: H });
    const t = await r.text();
    await writeFile(`data/samples/${k}.txt`, `STATUS ${r.status} ${r.headers.get("content-type")}\n` + t.slice(0, 400000));
    console.log(k, r.status, t.length);
  } catch (e) { console.log(k, String(e)); }
}
