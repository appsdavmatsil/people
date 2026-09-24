"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const sections = [
  { href: "/staff", label: "In-house" },
  { href: "/staff/outsourced", label: "Out Sourced" },
  { href: "/staff/hiring", label: "Hiring Positions" },
  { href: "/staff/promotions", label: "Promotions" },
] as const;

export function StaffSectionNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Staff directory" className="flex shrink-0 gap-6 border-b border-stone-200">
      {sections.map((section) => {
        const active = pathname === section.href;
        return (
          <Link
            key={section.href}
            href={section.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px border-b-2 pb-2 text-sm ${
              active
                ? "border-stone-950 font-medium text-stone-950"
                : "border-transparent text-stone-500 hover:text-stone-950"
            }`}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
