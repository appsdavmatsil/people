import type { Metadata } from "next";
import { loadHiringConfig } from "@/lib/hiring-config";
import { listHiringSubmissions } from "@/lib/hiring-records";
import { HiringFormBuilder } from "@/components/hiring/hiring-form-builder";
import { HiringResponses } from "@/components/hiring/hiring-responses";

export const metadata: Metadata = {
  title: "Hiring Form",
};

export const dynamic = "force-dynamic";

// Keep in sync with HiringSectionNav (first tab is the default).
const tabs = ["responses", "builder"] as const;
type Tab = (typeof tabs)[number];

export default async function HiringFormPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const active: Tab = tabs.includes(tab as Tab) ? (tab as Tab) : "responses";

  if (active === "builder") {
    const config = await loadHiringConfig();
    return <HiringFormBuilder config={config} />;
  }

  const submissions = await listHiringSubmissions();
  return <HiringResponses submissions={submissions} />;
}
