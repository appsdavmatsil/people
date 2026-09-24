export const pages = [
  { href: "/dashboard", title: "Home" },
  { href: "/staffdirectory", title: "Staff Directory" },
  { href: "/staffdeployment", title: "Staff Deployment" },
  { href: "/events", title: "Events Manning" },
  { href: "/settings", title: "Settings" },
] as const;

export type AppPage = (typeof pages)[number];

export const profilePage = {
  href: "/profile",
  title: "Profile settings",
} as const;

export function isAppPage(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function pageForPath(pathname: string) {
  if (isAppPage(pathname, profilePage.href)) {
    return profilePage;
  }

  return pages.find((page) => isAppPage(pathname, page.href)) ?? null;
}
