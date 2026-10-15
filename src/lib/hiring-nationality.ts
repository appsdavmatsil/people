import { countryNames, countryFlag, countryIso } from "@/lib/countries";

// Demonyms / misspellings seen in the migrated maine-forms applications,
// mapped to the People app's canonical country names (src/lib/countries.ts).
const ALIASES: Record<string, string> = {
  indian: "India", imdian: "India",
  nepali: "Nepal", nepalese: "Nepal", nepales: "Nepal", nepalees: "Nepal",
  ugandan: "Uganda",
  filipino: "Philippines", filipina: "Philippines", filipinos: "Philippines",
  filipimo: "Philippines", philippine: "Philippines", phillipines: "Philippines", pinoy: "Philippines",
  "sri lankan": "Sri Lanka", srilankan: "Sri Lanka", srilanka: "Sri Lanka",
  "sri lanken": "Sri Lanka", "buddism sri lanka": "Sri Lanka",
  burmese: "Myanmar", burma: "Myanmar",
  pakistani: "Pakistan",
  cameroonian: "Cameroon",
  egyptian: "Egypt",
  kenyan: "Kenya",
  ghanaian: "Ghana", ghanian: "Ghana",
  indonesian: "Indonesia",
  turkish: "Turkey", turkiye: "Turkey",
  zimbabwean: "Zimbabwe",
  bangladeshi: "Bangladesh",
  beninese: "Benin",
  colombian: "Colombia",
  lebanese: "Lebanon", lebenese: "Lebanon",
  mauritian: "Mauritius",
  moroccan: "Morocco",
  nigerian: "Nigeria",
  uzbek: "Uzbekistan", uzbekistani: "Uzbekistan",
  american: "United States", british: "United Kingdom", emirati: "United Arab Emirates",
};

const NAME_SET = new Set(countryNames.map((n) => n.toLowerCase()));

/** Normalize any free-text nationality to a canonical country name (or "Unknown"). */
export function normalizeNationality(raw: string | null | undefined): string {
  if (!raw) return "Unknown";
  const key = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!key) return "Unknown";
  if (NAME_SET.has(key)) {
    return countryNames.find((n) => n.toLowerCase() === key)!;
  }
  if (ALIASES[key]) return ALIASES[key];
  if (/[,;0-9]/.test(key)) return "Unknown";
  const letters = (key.match(/[a-z]/g) || []).length;
  if (letters < 3) return "Unknown";
  return raw.trim().replace(/\b\w/g, (m) => m.toUpperCase());
}

/** Flag emoji for any nationality string, via normalization. Falls back to globe. */
export function flagFor(nationality: string | null | undefined): string {
  const canon = normalizeNationality(nationality);
  if (canon !== "Unknown") {
    const f = countryFlag(canon);
    if (f) return f;
  }
  return "🌐";
}

export const continents = ["Asia", "Africa", "Europe", "Americas", "Oceania", "Other"] as const;
export type Continent = (typeof continents)[number];

const CONTINENT_CODES: Record<Exclude<Continent, "Other">, string> = {
  Asia: "AF AM AZ BH BD BT BN KH CN CY GE HK IN ID IR IQ IL JP JO KZ KW KG LA LB MO MY MV MN MM NP KP OM PK PS PH QA SA SG KR LK SY TW TJ TH TL TR TM AE UZ VN YE",
  Africa: "DZ AO BJ BW BF BI CV CM CF TD KM CG CD CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU YT MA MZ NA NE NG RE RW SH ST SN SC SL SO ZA SS SD TZ TG TN UG EH ZM ZW",
  Europe: "AX AL AD AT BY BE BA BG HR CZ DK EE FO FI FR DE GI GR GG HU IS IE IM IT JE XK LV LI LT LU MT MD MC ME NL MK NO PL PT RO RU SM RS SK SI ES SE CH UA GB VA",
  Americas: "AG AR BS BB BZ BO BR CA CL CO CR CU DM DO EC SV GD GT GY HT HN JM MX NI PA PY PE PR KN LC VC SR TT US UY VE",
  Oceania: "AU FJ KI MH FM NR NZ PW PG WS SB TO TV VU",
};

const CONTINENT_BY_ISO = new Map(
  Object.entries(CONTINENT_CODES).flatMap(([continent, codes]) =>
    codes.split(" ").map((code) => [code, continent as Continent] as const),
  ),
);

/** Continent for a canonical country name, or "Other" when unknown. */
export function continentFor(country: string): Continent {
  return CONTINENT_BY_ISO.get(countryIso(country)) ?? "Other";
}
