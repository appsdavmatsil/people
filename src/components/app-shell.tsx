"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PrivacyGate } from "@/components/privacy-gate";
import { PrivacyProvider } from "@/components/privacy-provider";
import { WorkspaceSync } from "@/components/workspace-sync";
import { noteAccess, setActivityActor } from "@/lib/activity";
import { signOutAction } from "@/lib/auth/actions";
import { isAppPage, pageForPath, pages, profilePage } from "@/lib/nav";
import { profileAvatarEvent, profileAvatarKey } from "@/lib/profile-avatar";

const sidebarCollapsedKey = "people-sidebar-collapsed";
const zoomKey = "people.zoom";
const zoomLevels = [0.8, 0.9, 1, 1.1, 1.25, 1.5];

export function AppShell({
  children,
  userId,
  name,
  email,
}: {
  children: React.ReactNode;
  userId: string;
  name: string;
  email: string;
}) {
  const pathname = usePathname();
  const current = pageForPath(pathname);
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(sidebarCollapsedKey) === "1");
  }, []);

  useEffect(() => {
    if (!userId) {
      return;
    }

    setActivityActor(userId);
    noteAccess("Opened People");
  }, [userId]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(sidebarCollapsedKey, next ? "1" : "0");
      return next;
    });
  }

  return (
    <div className="flex h-dvh min-h-0 flex-1 overflow-hidden">
      {open ? (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-20 bg-stone-950/30 md:hidden"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-30 flex h-dvh w-52 flex-col overflow-hidden border-r border-stone-200 bg-stone-50 transition-[width,transform] duration-200 ease-out md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        } ${collapsed ? "md:w-14" : "md:w-52"}`}
      >
        <div className="flex h-14 shrink-0 items-center border-b border-stone-200 px-2">
          <button
            type="button"
            className="hidden size-10 shrink-0 items-center justify-center rounded-lg text-stone-600 hover:bg-white/70 hover:text-stone-950 md:flex"
            aria-label={collapsed ? "Expand sidebar" : "Minimize sidebar"}
            aria-expanded={!collapsed}
            onClick={toggleCollapsed}
          >
            <SidebarToggleIcon expanded={!collapsed} />
          </button>
          <Link
            href="/dashboard"
            aria-label="People home"
            className={`min-w-0 truncate px-2.5 text-base font-semibold tracking-[0.14em] text-stone-950 uppercase md:px-0 ${
              collapsed ? "md:hidden" : ""
            }`}
          >
            People
          </Link>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-2" aria-label="Pages">
          {pages.map((page) => {
            const active = isAppPage(pathname, page.href);
            const Icon = pageIcons[page.href];

            return (
              <Fragment key={page.href}>
                <Link
                  href={page.href}
                  aria-current={active ? "page" : undefined}
                  aria-label={page.title}
                  title={collapsed ? page.title : undefined}
                  className={`flex h-10 items-center overflow-hidden rounded-lg text-base whitespace-nowrap ${
                    active
                      ? "bg-white font-medium text-stone-950 shadow-sm"
                      : "text-stone-600 hover:bg-white/70 hover:text-stone-950"
                  }`}
                >
                  <span
                    className={`grid size-10 shrink-0 place-items-center ${
                      collapsed ? "md:[&_svg]:size-7" : ""
                    }`}
                  >
                    <Icon />
                  </span>
                  <span className="overflow-hidden pr-2.5 whitespace-nowrap">{page.title}</span>
                </Link>
                {page.href === "/events" ? (
                  <hr
                    className={`my-2 border-0 border-t border-stone-200 ${
                      collapsed ? "mx-3 md:mx-2" : "mx-3"
                    }`}
                  />
                ) : null}
              </Fragment>
            );
          })}
        </nav>
      </aside>

      <div className={`flex min-h-0 min-w-0 flex-1 flex-col ${collapsed ? "md:pl-14" : "md:pl-52"}`}>
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-stone-200 px-4">
          <button
            type="button"
            className="flex size-8 items-center justify-center rounded-lg text-stone-700 md:hidden"
            aria-label="Open menu"
            onClick={() => setOpen(true)}
          >
            <MenuIcon />
          </button>
          <h1 className="flex min-w-0 items-center gap-2 text-base font-semibold tracking-tight text-stone-950">
            {current ? <PageIcon href={current.href} /> : null}
            <span className="truncate">{current?.title ?? "People"}</span>
          </h1>
          <AccountMenu userId={userId} name={name} email={email} />
        </header>
        <WorkspaceSync userId={userId} />
        <PrivacyProvider>
          <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <PrivacyGate>{children}</PrivacyGate>
          </main>
        </PrivacyProvider>
      </div>
    </div>
  );
}

function AccountMenu({
  userId,
  name,
  email,
}: {
  userId: string;
  name: string;
  email: string;
}) {
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const label = name || email || "Account";
  const profileActive = isAppPage(pathname, profilePage.href);
  const teamActive =
    open &&
    isAppPage(pathname, "/settings") &&
    new URLSearchParams(window.location.search).get("tab") === "team";
  const [avatar, setAvatar] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const zoomIndex = Math.max(0, zoomLevels.indexOf(zoom));

  useEffect(() => {
    function loadAvatar() {
      setAvatar(userId ? window.localStorage.getItem(profileAvatarKey(userId)) : null);
    }

    loadAvatar();
    window.addEventListener(profileAvatarEvent, loadAvatar);
    return () => window.removeEventListener(profileAvatarEvent, loadAvatar);
  }, [userId]);

  useEffect(() => {
    const stored = readZoom();
    setZoom(stored);
    applyZoom(stored);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative ml-auto">
      <button
        type="button"
        className="flex size-8 items-center justify-center overflow-hidden rounded-full bg-stone-900 text-xs font-medium text-white"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((current) => !current)}
      >
        {avatar ? (
          <img src={avatar} alt="" className="size-full object-cover" />
        ) : (
          accountInitials(name, email)
        )}
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Account"
          className="absolute top-full right-0 z-40 mt-2 w-72 overflow-hidden rounded-xl border border-stone-200 bg-white text-sm text-stone-950 shadow-lg"
        >
          <div className="flex items-center gap-3 border-b border-stone-200 px-3 py-3">
            <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-stone-900 text-xs font-medium text-white">
              {avatar ? (
                <img src={avatar} alt="" className="size-full object-cover" />
              ) : (
                accountInitials(name, email)
              )}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-medium">{label}</span>
              {email && email !== label ? (
                <span className="block truncate text-xs text-stone-500">{email}</span>
              ) : null}
            </span>
          </div>
          <div className="p-1.5">
            <Link
              href={profilePage.href}
              aria-current={profileActive ? "page" : undefined}
              className={accountMenuItemClass(profileActive)}
            >
              <ProfileIcon className="size-4 shrink-0" />
              Profile settings
            </Link>
            <Link
              href="/settings?tab=team"
              aria-current={teamActive ? "page" : undefined}
              className={accountMenuItemClass(teamActive)}
              onClick={() => window.dispatchEvent(new Event("people-open-team-settings"))}
            >
              <TeamIcon />
              Team settings
            </Link>
          </div>
          <div className="border-t border-stone-200 px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-stone-600">Zoom</span>
              <span className="flex items-center rounded-lg bg-stone-100 p-0.5">
                <button
                  type="button"
                  className="inline-flex size-7 items-center justify-center rounded-md text-base leading-none text-stone-600 hover:bg-white hover:text-stone-950 disabled:opacity-30"
                  aria-label="Zoom out"
                  disabled={zoomIndex === 0}
                  onClick={() => changeZoom(zoomIndex - 1, setZoom)}
                >
                  −
                </button>
                <span className="w-11 text-center text-xs font-medium text-stone-700 tabular-nums">
                  {Math.round(zoomLevels[zoomIndex] * 100)}%
                </span>
                <button
                  type="button"
                  className="inline-flex size-7 items-center justify-center rounded-md text-base leading-none text-stone-600 hover:bg-white hover:text-stone-950 disabled:opacity-30"
                  aria-label="Zoom in"
                  disabled={zoomIndex === zoomLevels.length - 1}
                  onClick={() => changeZoom(zoomIndex + 1, setZoom)}
                >
                  +
                </button>
              </span>
            </div>
          </div>
          <div className="border-t border-stone-200 p-1.5">
            <form action={signOutAction}>
              <button
                type="submit"
                className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-stone-700 hover:bg-stone-100 hover:text-stone-950"
              >
                <LogOutIcon />
                Log out
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function readZoom() {
  const stored = Number(window.localStorage.getItem(zoomKey));
  return zoomLevels.includes(stored) ? stored : 1;
}

function applyZoom(value: number) {
  document.documentElement.style.setProperty("zoom", String(value));
}

function changeZoom(index: number, setZoom: (value: number) => void) {
  const next = zoomLevels[index];
  if (next == null) {
    return;
  }

  window.localStorage.setItem(zoomKey, String(next));
  applyZoom(next);
  setZoom(next);
}

function accountMenuItemClass(active: boolean) {
  return `flex h-9 items-center gap-2.5 rounded-lg px-2.5 ${
    active ? "bg-stone-100 font-medium text-stone-950" : "text-stone-800 hover:bg-stone-100"
  }`;
}

function TeamIcon() {
  return (
    <svg className="size-4 shrink-0" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="5.5" cy="5.2" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M2.2 12.4c.6-1.7 1.8-2.5 3.3-2.5s2.7.8 3.3 2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="11" cy="5.6" r="1.25" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M10.1 9.8c.6-.2 1.2-.3 1.8-.1.8.3 1.3 1 1.6 2.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LogOutIcon() {
  return (
    <svg className="size-4 shrink-0" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M6.2 3.2H3.6A1.2 1.2 0 0 0 2.4 4.4v7.2a1.2 1.2 0 0 0 1.2 1.2h2.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M7 8h6.4M11.2 5.6 13.6 8l-2.4 2.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function accountInitials(name: string, email: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
  }

  if (parts[0]) {
    return parts[0].charAt(0).toUpperCase();
  }

  return email.charAt(0).toUpperCase() || "?";
}

const pageIcons = {
  "/dashboard": HomeIcon,
  "/staffdirectory": DirectoryIcon,
  "/staffdeployment": DeploymentIcon,
  "/events": EventsIcon,
  "/settings": SettingsIcon,
  "/profile": ProfileIcon,
} as const;

function PageIcon({ href }: { href: string }) {
  const Icon = pageIcons[href as keyof typeof pageIcons];
  return Icon ? <Icon /> : null;
}

function HomeIcon() {
  return (
    <svg className="size-5 shrink-0" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M2.4 7.1 8 2.6l5.6 4.5V13a.7.7 0 0 1-.7.7H3.1a.7.7 0 0 1-.7-.7V7.1Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M6.5 13.7V9.4h3v4.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DirectoryIcon() {
  return (
    <svg className="size-5 shrink-0" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="6" cy="5.2" r="1.7" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M2.5 12.6c.7-1.8 2-2.7 3.5-2.7s2.8.9 3.5 2.7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="11.1" cy="5.5" r="1.35" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M10.2 10c.7-.3 1.4-.4 2.1-.2.9.4 1.5 1.1 1.8 2.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DeploymentIcon() {
  return (
    <svg className="size-5 shrink-0" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="4.2" cy="5" r="1.55" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M1.6 11.6c.55-1.7 1.5-2.5 2.6-2.5s2.05.8 2.6 2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M9.2 8h4.6M11.6 5.8 14 8l-2.4 2.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EventsIcon() {
  return (
    <svg className="size-5 shrink-0" viewBox="0 0 16 16" aria-hidden="true">
      <rect
        x="2.2"
        y="3.2"
        width="11.6"
        height="10.2"
        rx="1.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M2.2 6.4h11.6M5.2 2.2v2.2M10.8 2.2v2.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg className="size-5 shrink-0" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M6.55 1.85h2.9l.32 1.22c.4.14.76.35 1.08.6l1.22-.42 1.45 2.5-.95.9c.08.35.1.6.1 1s-.02.65-.1 1l.95.9-1.45 2.5-1.22-.42c-.32.25-.68.46-1.08.6l-.32 1.22h-2.9l-.32-1.22a3.7 3.7 0 0 1-1.08-.6l-1.22.42-1.45-2.5.95-.9A4.2 4.2 0 0 1 3.4 8c0-.4.02-.65.1-1l-.95-.9 1.45-2.5 1.22.42c.32-.25.68-.46 1.08-.6l.32-1.22Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="1.55" fill="none" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}

function SidebarToggleIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg className="size-5 shrink-0" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d={expanded ? "M2 4.5h12M2 8h12M2 11.5h12" : "M4.5 2v12M8 2v12M11.5 2v12"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ProfileIcon({ className = "size-5 shrink-0" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="5.2" r="2.1" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M3.2 13.2c.9-2.1 2.6-3.2 4.8-3.2s3.9 1.1 4.8 3.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg className="size-5 shrink-0" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M2 4.5h12M2 8h12M2 11.5h12"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
