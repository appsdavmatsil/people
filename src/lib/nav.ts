export const pages = [
  { href: "/", title: "Home" },
  { href: "/staff", title: "Staff" },
  { href: "/schedule", title: "Schedule" },
  { href: "/time", title: "Time" },
  { href: "/settings", title: "Settings" },
] as const;

export type AppPage = (typeof pages)[number];

export function pageForPath(pathname: string) {
  return pages.find((page) => page.href === pathname) ?? null;
}
