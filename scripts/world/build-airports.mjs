// Builds src/data/usAirports.json: every airport in the lower 48 states with airline service
// (OurAirports "large" airports, and "medium" ones with scheduled service) that has a paved
// runway of 4,500 ft or more, in the game's Airport format. The game keeps its hand-made
// airports (src/data/airports.ts) and adds these. Source: OurAirports (public domain).
// Usage: node scripts/world/build-airports.mjs <airports.csv> <runways.csv>
import fs from "node:fs";

const [apFile, rwFile] = process.argv.slice(2);

/** Minimal CSV parser (quoted fields, commas and doubled quotes inside quotes). */
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else q = false;
      } else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (ch !== "\r") field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return body.filter((r) => r.length === head.length).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

const STATES = { AL: "Alabama", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "Washington, D.C.", FL: "Florida", GA: "Georgia", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming" };

// How people say the big ones (the data's town is often a suburb, or the name is a person's).
const SPOKEN = {
  ATL: "Atlanta", BOS: "Boston Logan", BWI: "Baltimore", CLE: "Cleveland", CVG: "Cincinnati", DCA: "Washington National", IAD: "Washington Dulles",
  DEN: "Denver", DFW: "Dallas Fort Worth", DAL: "Dallas Love Field", DTW: "Detroit", EWR: "Newark", HOU: "Houston Hobby", IAH: "Houston Bush",
  JFK: "New York Kennedy", LGA: "New York LaGuardia", LAS: "Las Vegas", LAX: "Los Angeles", MCO: "Orlando", MDW: "Chicago Midway", ORD: "Chicago O'Hare",
  MIA: "Miami", MSP: "Minneapolis", PHL: "Philadelphia", PHX: "Phoenix", PIT: "Pittsburgh", SAN: "San Diego", SEA: "Seattle", SFO: "San Francisco",
  SJC: "San Jose", OAK: "Oakland", SLC: "Salt Lake City", STL: "St. Louis", TPA: "Tampa", FLL: "Fort Lauderdale", MSY: "New Orleans", BNA: "Nashville",
  AUS: "Austin", SAT: "San Antonio", MCI: "Kansas City", IND: "Indianapolis", CMH: "Columbus", MKE: "Milwaukee", PDX: "Portland", SMF: "Sacramento",
  SNA: "Orange County", BUR: "Burbank", LGB: "Long Beach", ONT: "Ontario", PBI: "West Palm Beach", RSW: "Fort Myers", JAX: "Jacksonville", MEM: "Memphis",
  ABQ: "Albuquerque", TUS: "Tucson", OKC: "Oklahoma City", OMA: "Omaha", BDL: "Hartford", PVD: "Providence", BUF: "Buffalo", ALB: "Albany", SYR: "Syracuse",
  ROC: "Rochester", RIC: "Richmond", ORF: "Norfolk", SDF: "Louisville", BHM: "Birmingham", BOI: "Boise", RNO: "Reno", ELP: "El Paso", HPN: "White Plains",
  ISP: "Long Island MacArthur", SWF: "Stewart", PIE: "St. Pete Clearwater", SFB: "Orlando Sanford", MHT: "Manchester", PWM: "Portland Maine",
  BTV: "Burlington", BFI: "Boeing Field", AGS: "Augusta", AUG: "Augusta Maine", LUK: "Cincinnati Lunken", ABY: "Albany Georgia", BRL: "Burlington Iowa",
  CAE: "Columbia", COU: "Columbia Missouri", CSG: "Columbus Georgia", ILM: "Wilmington", ILG: "Wilmington Delaware", RST: "Rochester Minnesota",
  ART: "Watertown", ATY: "Watertown South Dakota", JAN: "Jackson", MKL: "Jackson Tennessee", SPI: "Springfield", GCN: "Grand Canyon",
  OPF: "Opa-locka", RFD: "Rockford", RDU: "Raleigh-Durham", USA: "Concord", CLD: "Carlsbad",
};

const text = (f) => fs.readFileSync(f, "utf8");
const airports = parseCsv(text(apFile));
const runways = parseCsv(text(rwFile));
const byRef = new Map();
for (const r of runways) {
  if (r.closed === "1" || !r.le_latitude_deg || !r.he_latitude_deg) continue;
  if (!/ASP|CON|PEM|BIT/i.test(r.surface) || Number(r.length_ft) < 4500) continue;
  if (/^H/.test(r.le_ident) || /W$/.test(r.le_ident)) continue; // helipads, water lanes
  (byRef.get(r.airport_ref) ?? byRef.set(r.airport_ref, []).get(r.airport_ref)).push(r);
}

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const SIDE = { L: "left", R: "right", C: "center" };
function runwayEnd(ident, lat, lon, elev) {
  const m = ident.match(/^0*(\d{1,2})([LRC]?)$/);
  const id = m ? `${m[1]}${m[2]}` : ident;
  const spoken = m ? [...m[1]].map((d) => WORDS[+d]).join(" ") + (m[2] ? ` ${SIDE[m[2]]}` : "") : ident;
  return { id, spoken, lat: +(+lat).toFixed(6), lon: +(+lon).toFixed(6), elevFt: Math.round(+elev) };
}

/** "Denver International Airport" -> "Denver"; "Chicago Rockford International Airport" -> "Chicago Rockford". */
function shortName(name) {
  return name
    .replace(/\b(International|Intl|Regional|Municipal|Metropolitan|Metro|County|Memorial|National|Jetport|Field|Airport|Air Terminal|Airpark)\b/g, "")
    .replace(/\s*[-–\/]\s*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const picked = [];
for (const a of airports) {
  if (a.iso_country !== "US") continue;
  const st = a.iso_region.replace("US-", "");
  if (!STATES[st]) continue; // lower 48 + DC only
  const airline = a.type === "large_airport" || (a.type === "medium_airport" && a.scheduled_service === "yes");
  if (!airline) continue;
  const rws = byRef.get(a.id);
  if (!rws) continue;
  const code = a.iata_code || a.local_code || a.ident;
  if (!/^[A-Z0-9]{3}$/.test(code)) continue;
  // The longest paved runway is the one the game uses.
  const r = rws.sort((x, y) => Number(y.length_ft) - Number(x.length_ft))[0];
  const elev = Number(a.elevation_ft || 0);
  const le = runwayEnd(r.le_ident, r.le_latitude_deg, r.le_longitude_deg, r.le_elevation_ft || elev);
  const he = runwayEnd(r.he_ident, r.he_latitude_deg, r.he_longitude_deg, r.he_elevation_ft || elev);
  // Prevailing winds in the US are mostly from the west / south-west: prefer landing that way.
  const hdg = (e, o) => ((Math.atan2((o.lon - e.lon) * Math.cos((e.lat * Math.PI) / 180), o.lat - e.lat) * 180) / Math.PI + 360) % 360;
  const into = (h) => Math.abs(((h - 240 + 540) % 360) - 180);
  const preferred = into(hdg(le, he)) <= into(hdg(he, le)) ? le.id : he.id;
  picked.push({ a, st, code, r, le, he, preferred, elev });
}

// Spoken name: how people say it, else the town if no other airport here shares it, else the
// shortened airport name.
const towns = new Map();
for (const p of picked) towns.set(p.a.municipality, (towns.get(p.a.municipality) ?? 0) + 1);
const out = picked.map(({ a, st, code, r, le, he, preferred, elev }) => {
  const town = a.municipality.replace(/\s*\(.*\)$/, "");
  // "Allentown/Bethlehem" is said "Allentown".
  const spoken = SPOKEN[code] ?? (towns.get(a.municipality) === 1 && town && town.length <= 22 ? town : shortName(a.name) || town).split("/")[0].trim();
  const big = a.type === "large_airport";
  return {
    code,
    icao: a.icao_code || a.gps_code || `K${code}`,
    name: a.name,
    spoken,
    towerName: `${spoken} Tower`,
    city: `${town}, ${STATES[st]}`,
    state: st,
    lat: +(+a.latitude_deg).toFixed(6),
    lon: +(+a.longitude_deg).toFixed(6),
    elevFt: Math.round(elev),
    home: false,
    blurb: big ? `A big, busy airport in ${town}` : `Airline flights to ${town}`,
    icon: big ? "🛫" : "✈️",
    size: big ? "large" : "medium",
    runway: { ends: [le, he], lengthFt: Number(r.length_ft), widthFt: Number(r.width_ft) || 150, preferred },
  };
});
// Any names still shared: add the state ("Springfield Illinois").
const count = new Map();
for (const o of out) count.set(o.spoken, (count.get(o.spoken) ?? 0) + 1);
for (const o of out) if (count.get(o.spoken) > 1 && !SPOKEN[o.code]) { o.spoken = `${o.spoken} ${STATES[o.state]}`; o.towerName = `${o.spoken} Tower`; }
out.sort((x, y) => x.code.localeCompare(y.code));
fs.writeFileSync("src/data/usAirports.json", JSON.stringify(out));
console.log(out.length, "airports;", out.filter((o) => o.size === "large").length, "large");
const sameSpoken = new Map();
for (const o of out) sameSpoken.set(o.spoken, [...(sameSpoken.get(o.spoken) ?? []), o.code]);
console.log("shared spoken names:", [...sameSpoken].filter(([, v]) => v.length > 1).map(([k, v]) => `${k}: ${v.join("/")}`).join("; ") || "none");
