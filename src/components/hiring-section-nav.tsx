"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { SectionTabs } from "@/components/section-tabs";
import { HiringTeamLink } from "@/components/hiring/hiring-team-link";

// Hiring form tabs. First tab is default.
const tabs = [
  { id: "responses", label: "Form Responses", icon: "M4 5h16M4 12h16M4 19h10", group: "responses" },
  { id: "calendar", label: "Calendar", icon: "M8 3v4M16 3v4M3 10h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z", group: "responses" },
  { id: "builder", label: "Form Builder", icon: "M4 20h4L18.5 9.5a2.1 2.1 0 0 0-4-4L4 16v4M13.5 6.5l4 4", group: "setup" },
] as const;

export function HiringSectionNav({ shareToken }: { shareToken: string | null }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get("tab") ?? tabs[0].id;

  return (
    <div className="flex flex-wrap items-start gap-2">
      <SectionTabs
        label="Hiring Form"
        compact
        active={current}
        tabs={tabs.map((tab) => ({ ...tab, href: `${pathname}?tab=${tab.id}` }))}
      />
      {current === "responses" ? <HiringTeamLink token={shareToken} /> : null}
    </div>
  );
}
