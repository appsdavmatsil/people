import { normalizeName } from "@/lib/directory-lookups";

export const privacyPages = [
  { href: "/dashboard", title: "Home" },
  { href: "/staffdirectory", title: "In-house" },
  { href: "/staffdirectory/outsourced", title: "Out Sourced" },
  { href: "/staffdirectory/hiring", title: "Hiring Positions" },
  { href: "/staffdirectory/promotions", title: "Promotions" },
  { href: "/staffdeployment", title: "Staff Deployment" },
  { href: "/events", title: "Events Manning" },
  { href: "/settings", title: "Settings" },
  { href: "/profile", title: "Profile settings" },
] as const;

export type PrivacyPageHref = (typeof privacyPages)[number]["href"];

export const privacyFeatures = [
  { id: "board-visibility", title: "Location board visibility" },
  { id: "location-arrange", title: "Move staff on the location board" },
] as const;

export type PrivacyFeatureId = (typeof privacyFeatures)[number]["id"];

export const defaultProtectedFeatures: PrivacyFeatureId[] = privacyFeatures.map((feature) => feature.id);

export type PrivacySnapshot = {
  passwordEnabled: boolean;
  stamp: string;
  isOwner: boolean;
  showHiring: boolean;
  showPromotions: boolean;
  hiddenSalaryPositions: string[];
  protectedPages: string[];
  protectedFeatures: string[];
};

export const defaultPrivacySnapshot: PrivacySnapshot = {
  passwordEnabled: true,
  stamp: "",
  isOwner: false,
  showHiring: true,
  showPromotions: true,
  hiddenSalaryPositions: [],
  protectedPages: [],
  protectedFeatures: [...defaultProtectedFeatures],
};

export const privacyUnlockKey = "people.privacy-unlock";

export function positionKey(name: string) {
  return normalizeName(name).toLowerCase();
}

export function salaryHidden(hiddenSalaryPositions: string[], position: string) {
  if (!position.trim()) {
    return false;
  }

  const key = positionKey(position);
  return hiddenSalaryPositions.some((item) => item === key);
}

const legacyPrivacyPaths: Record<string, PrivacyPageHref> = {
  "/": "/dashboard",
  "/staff": "/staffdirectory",
  "/staff/outsourced": "/staffdirectory/outsourced",
  "/staff/hiring": "/staffdirectory/hiring",
  "/staff/promotions": "/staffdirectory/promotions",
  "/schedule": "/staffdeployment",
};

export function canonicalPrivacyPath(path: string) {
  return legacyPrivacyPaths[path] ?? path;
}

export function privacyPageForPath(pathname: string) {
  const ranked = [...privacyPages].sort((left, right) => right.href.length - left.href.length);

  return ranked.find((page) => pathname === page.href || pathname.startsWith(`${page.href}/`)) ?? null;
}

export function pageIsProtected(pathname: string, protectedPages: string[]) {
  const page = privacyPageForPath(pathname);
  return page != null && protectedPages.includes(page.href);
}

export function featureIsProtected(feature: PrivacyFeatureId, protectedFeatures: string[]) {
  return protectedFeatures.includes(feature);
}
