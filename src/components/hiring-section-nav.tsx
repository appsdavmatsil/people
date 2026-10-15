"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { SectionTabs } from "@/components/section-tabs";

// Hiring form has only two tabs: responses and builder. First tab is default.
const tabs = [
  { id: "responses", label: "Form Responses", icon: "M4 5h16M4 12h16M4 19h10", group: "responses" },
  { id: "builder", label: "Form Builder", icon: "M4 20h4L18.5 9.5a2.1 2.1 0 0 0-4-4L4 16v4M13.5 6.5l4 4", group: "setup" },
] as const;

export function HiringSectionNav() {
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get("tab") ?? tabs[0].id;

  return (
    <SectionTabs
      label="Hiring Form"
      active={current}
      tabs={tabs.map((tab) => ({ ...tab, href: `${pathname}?tab=${tab.id}` }))}
    />
  );
}
