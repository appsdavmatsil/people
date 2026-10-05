"use client";

import { usePathname } from "next/navigation";
import { SectionTabs } from "@/components/section-tabs";

const sections = [
  { id: "/staffdirectory", href: "/staffdirectory", label: "In-house", icon: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z", group: "staff" },
  { id: "/staffdirectory/outsourced", href: "/staffdirectory/outsourced", label: "Out Sourced", icon: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 10-4.5M16 15h6M19 12l3 3-3 3", group: "staff" },
  { id: "/staffdirectory/hiring", href: "/staffdirectory/hiring", label: "Hiring Positions", icon: "M4 7h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zM9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18", group: "growth" },
  { id: "/staffdirectory/promotions", href: "/staffdirectory/promotions", label: "Promotions", icon: "M3 17l6-6 4 4 8-8M15 7h6v6", group: "growth" },
  { id: "/staffdirectory/documents", href: "/staffdirectory/documents", label: "Documents", icon: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6", group: "records" },
] as const;

export function StaffSectionNav() {
  const pathname = usePathname();
  return <SectionTabs label="Staff directory" active={pathname} tabs={sections} />;
}
