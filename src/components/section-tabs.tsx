"use client";

import Link from "next/link";
import { Fragment } from "react";

export type SectionTab = {
  id: string;
  label: string;
  /** SVG path data for a 24×24 stroke icon. */
  icon: string;
  /** Tabs in a different group from the previous tab get a divider before them. */
  group?: string;
  /** Link tabs navigate; tabs without an href call onSelect. */
  href?: string;
};

/**
 * Segmented tab bar shared by section pages (Form, Staff Directory, Settings).
 * Link tabs render as navigation; button tabs render as an ARIA tablist with
 * ids `${idPrefix}-tab-${id}` controlling `${idPrefix}-panel-${id}`.
 */
export function SectionTabs({
  tabs,
  active,
  label,
  onSelect,
  idPrefix,
}: {
  tabs: readonly SectionTab[];
  active: string;
  label: string;
  onSelect?: (id: string) => void;
  idPrefix?: string;
}) {
  const isNav = tabs.every((tab) => tab.href);
  const Container = isNav ? "nav" : "div";

  return (
    <Container aria-label={label} className="-mx-1 shrink-0 overflow-x-auto px-1 pb-1">
      <div
        role={isNav ? undefined : "tablist"}
        aria-label={isNav ? undefined : label}
        className="inline-flex items-center gap-1 rounded-xl border border-stone-200 bg-stone-100/80 p-1"
      >
        {tabs.map((tab, index) => {
          const selected = active === tab.id;
          const startsGroup = index > 0 && tabs[index - 1].group !== tab.group;
          const className = `inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm transition-colors ${
            selected
              ? "bg-white font-medium text-stone-950 shadow-sm ring-1 ring-stone-200"
              : "text-stone-500 hover:bg-white/60 hover:text-stone-900"
          }`;
          const content = (
            <>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`size-4 shrink-0 ${selected ? "text-[#063f3b]" : ""}`}
                aria-hidden="true"
              >
                <path d={tab.icon} />
              </svg>
              {tab.label}
            </>
          );

          return (
            <Fragment key={tab.id}>
              {startsGroup ? <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-stone-300" /> : null}
              {tab.href ? (
                <Link href={tab.href} aria-current={selected ? "page" : undefined} className={className}>
                  {content}
                </Link>
              ) : (
                <button
                  type="button"
                  role="tab"
                  id={idPrefix ? `${idPrefix}-tab-${tab.id}` : undefined}
                  aria-controls={idPrefix ? `${idPrefix}-panel-${tab.id}` : undefined}
                  aria-selected={selected}
                  onClick={() => onSelect?.(tab.id)}
                  className={className}
                >
                  {content}
                </button>
              )}
            </Fragment>
          );
        })}
      </div>
    </Container>
  );
}
