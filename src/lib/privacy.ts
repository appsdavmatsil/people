import { normalizeName } from "@/lib/directory-lookups";

export const privacyPages = [
  { href: "/", title: "Home" },
  { href: "/staff", title: "In-house" },
  { href: "/staff/outsourced", title: "Out Sourced" },
  { href: "/staff/hiring", title: "Hiring Positions" },
  { href: "/staff/promotions", title: "Promotions" },
  { href: "/schedule", title: "Staff Location" },
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

export function privacyPageForPath(pathname: string) {
  const ranked = [...privacyPages].sort((left, right) => right.href.length - left.href.length);

  return (
    ranked.find((page) =>
      page.href === "/"
        ? pathname === "/"
        : pathname === page.href || pathname.startsWith(`${page.href}/`),
    ) ?? null
  );
}

export function pageIsProtected(pathname: string, protectedPages: string[]) {
  const page = privacyPageForPath(pathname);
  return page != null && protectedPages.includes(page.href);
}

export function featureIsProtected(feature: PrivacyFeatureId, protectedFeatures: string[]) {
  return protectedFeatures.includes(feature);
}
