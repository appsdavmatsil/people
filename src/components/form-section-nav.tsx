"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { SectionTabs } from "@/components/section-tabs";

// Response tabs first, then form setup. The first tab is the default.
const tabs = [
  { id: "responses", label: "Form Responses", icon: "M4 5h16M4 12h16M4 19h10", group: "responses" },
  { id: "missing", label: "Missing Responses", icon: "M12 8v5M12 16.5v.5M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z", group: "responses" },
  { id: "notifications", label: "Notifications", icon: "M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0", group: "responses" },
  { id: "builder", label: "Form Builder", icon: "M4 20h4L18.5 9.5a2.1 2.1 0 0 0-4-4L4 16v4M13.5 6.5l4 4", group: "setup" },
  { id: "sorting", label: "Document Sorting", icon: "M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4", group: "setup" },
] as const;

export function FormSectionNav() {
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get("tab") ?? tabs[0].id;

  return (
    <SectionTabs
      label="Form"
      active={current}
      tabs={tabs.map((tab) => ({ ...tab, href: `${pathname}?tab=${tab.id}` }))}
    />
  );
}
