"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/lib/auth/actions";
import { pageForPath, pages } from "@/lib/nav";

export function AppShell({
  children,
  name,
  email,
}: {
  children: React.ReactNode;
  name: string;
  email: string;
}) {
  const pathname = usePathname();
  const current = pageForPath(pathname);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-full flex-1">
      {open ? (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-20 bg-stone-950/30 md:hidden"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-stone-200 bg-stone-50 transition-transform md:static md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="px-4 py-5">
          <Link href="/" className="block">
            <span className="text-xs font-medium tracking-[0.16em] text-stone-500 uppercase">
              Staff
            </span>
            <span className="mt-1 block text-xl font-semibold tracking-tight text-stone-950">
              People
            </span>
          </Link>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-2" aria-label="Pages">
          {pages.map((page) => {
            const active = page.href === pathname;

            return (
              <Link
                key={page.href}
                href={page.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-9 items-center rounded-lg px-3 text-sm ${
                  active
                    ? "bg-white font-medium text-stone-950 shadow-sm"
                    : "text-stone-600 hover:bg-white/70 hover:text-stone-950"
                }`}
              >
                {page.title}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-stone-200 p-3">
          {name || email ? (
            <div className="px-2">
              {name ? (
                <p className="truncate text-sm font-medium text-stone-950">
                  {name}
                </p>
              ) : null}
              {email ? (
                <p className="truncate text-xs text-stone-500">{email}</p>
              ) : null}
            </div>
          ) : null}
          <form action={signOutAction} className="mt-2">
            <button
              type="submit"
              className="h-9 w-full rounded-lg px-3 text-left text-sm text-stone-700 hover:bg-white"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-stone-200 px-4">
          <button
            type="button"
            className="flex size-8 items-center justify-center rounded-lg text-stone-700 md:hidden"
            aria-label="Open menu"
            onClick={() => setOpen(true)}
          >
            <MenuIcon />
          </button>
          <h1 className="text-base font-semibold tracking-tight text-stone-950">
            {current?.title ?? "People"}
          </h1>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}

function MenuIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M2 4.5h12M2 8h12M2 11.5h12"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
