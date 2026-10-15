import { countryNames, countryFlag } from "@/lib/countries";

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
