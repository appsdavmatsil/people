export const pages = [
  { href: "/", title: "Home" },
  { href: "/staff", title: "Staff Directory" },
  { href: "/schedule", title: "Staff Location" },
  { href: "/events", title: "Events Manning" },
  { href: "/settings", title: "Settings" },
] as const;

export type AppPage = (typeof pages)[number];

export const profilePage = {
  href: "/profile",
  title: "Profile settings",
} as const;

export function isAppPage(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function pageForPath(pathname: string) {
  if (isAppPage(pathname, profilePage.href)) {
    return profilePage;
  }

  return pages.find((page) => isAppPage(pathname, page.href)) ?? null;
}
