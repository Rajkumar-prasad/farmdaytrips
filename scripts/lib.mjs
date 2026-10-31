// Shared helpers for import and build scripts.

export const STATES = {
  AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",CT:"Connecticut",
  DE:"Delaware",FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",
  KS:"Kansas",KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",
  MN:"Minnesota",MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",
  NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",
  OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",
  TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming",
  DC:"District of Columbia",
};
export const STATE_BY_NAME = Object.fromEntries(Object.entries(STATES).map(([a, n]) => [n.toLowerCase(), a]));

// Categories: order matters for display. `test` runs on lowercase name + description + products.
export const CATEGORIES = [
  { slug: "christmas-tree-farms", one: "Christmas tree farm", many: "Christmas tree farms", name: "Christmas Tree Farms", short: "Christmas trees", season: [11, 12],
    test: (t) => /christmas tree|xmas tree|choose[\s-]*(and|&|n)[\s-]*cut|cut[\s-]your[\s-]own tree|fraser fir|douglas fir/.test(t) },
  { slug: "pumpkin-patches", one: "pumpkin patch", many: "pumpkin patches", name: "Pumpkin Patches", short: "Pumpkins", season: [9, 10],
    test: (t) => /pumpkin/.test(t) },
  { slug: "apple-orchards", one: "apple orchard", many: "apple orchards", name: "Apple Orchards", short: "Apples", season: [8, 9, 10],
    test: (t) => /\bapples?\b|apple orchard|cider/.test(t) },
  { slug: "strawberry-picking", one: "strawberry farm", many: "strawberry farms", name: "Strawberry Picking", short: "Strawberries", season: [4, 5, 6],
    test: (t) => /strawberr/.test(t) },
  { slug: "berry-picking", one: "berry farm", many: "berry farms", name: "Blueberry & Berry Picking", short: "Berries", season: [6, 7, 8],
    test: (t) => /blueberr|blackberr|raspberr/.test(t) },
  { slug: "u-pick-farms", one: "u-pick farm", many: "u-pick farms", name: "U-Pick Farms", short: "U-pick", season: [5, 6, 7, 8, 9, 10],
    test: (t) => /u-?pick|pick[\s-]your[\s-]own|you[\s-]pick|\bpyo\b/.test(t) },
  { slug: "corn-mazes", one: "corn maze", many: "corn mazes", name: "Corn Mazes", short: "Corn maze", season: [9, 10],
    test: (t) => /corn maze|corn maize|crop maze/.test(t) },
  { slug: "farmers-markets", one: "farmers market", many: "farmers markets", name: "Farmers Markets", short: "Farmers market", season: [5, 6, 7, 8, 9, 10],
    test: () => false },
  { slug: "farm-stands", one: "farm stand", many: "farm stands", name: "Farm Stands & Farm Stores", short: "Farm stand", season: [6, 7, 8, 9, 10],
    test: () => false },
];
export const CAT = Object.fromEntries(CATEGORIES.map((c) => [c.slug, c]));

export const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function titleCase(s) {
  return String(s || "").toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\bMc([a-z])/g, (m, c) => "Mc" + c.toUpperCase())
    .replace(/\b(Us|Nc|Sr|Pa|Rt|Cr|Nw|Ne|Sw|Se|Ii|Iii)\b/g, (m) => m.toUpperCase());
}

export function cleanText(s) {
  return String(s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function listJoin(arr) {
  if (arr.length <= 1) return arr.join("");
  if (arr.length === 2) return arr.join(" and ");
  return arr.slice(0, -1).join(", ") + ", and " + arr[arr.length - 1];
}

export function countOf(n, c) {
  return `${n.toLocaleString("en-US")} ${n === 1 ? c.one : c.many}`;
}
