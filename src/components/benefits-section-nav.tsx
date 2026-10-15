"use client";

import { usePathname } from "next/navigation";
import { SectionTabs } from "@/components/section-tabs";

const tabs = [
  { id: "tips", label: "Tips", icon: "M8 13V7a4 4 0 1 1 8 0v6M5 13h14l-1 8H6l-1-8z", group: "a" },
  { id: "service-charge", label: "Service Charge", icon: "M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6", group: "a" },
] as const;

export function BenefitsSectionNav() {
  const pathname = usePathname();
  const current = pathname.split("/")[2] ?? "tips";

  return (
    <SectionTabs
      label="PayRoll"
      active={current}
      tabs={tabs.map((tab) => ({ ...tab, href: `/benefits/${tab.id}` }))}
    />
  );
}
