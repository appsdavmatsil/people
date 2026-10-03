"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const tabs = [
  { tab: "builder", label: "Form Builder" },
  { tab: "sorting", label: "Document Sorting" },
  { tab: "responses", label: "Form Responses" },
  { tab: "notifications", label: "Notifications" },
] as const;

export function FormSectionNav() {
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get("tab") ?? "builder";

  return (
    <nav aria-label="Form" className="flex shrink-0 gap-6 overflow-x-auto border-b border-stone-200">
      {tabs.map((item) => {
        const active = current === item.tab;
        return (
          <Link
            key={item.tab}
            href={`${pathname}?tab=${item.tab}`}
            aria-current={active ? "page" : undefined}
            className={`-mb-px whitespace-nowrap border-b-2 pb-2 text-sm ${
              active
                ? "border-stone-950 font-medium text-stone-950"
                : "border-transparent text-stone-500 hover:text-stone-950"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
