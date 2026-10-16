import type { Metadata } from "next";
import { landingOf, loadHiringConfig, loadHiringConfigVersion } from "@/lib/hiring-config";
import { listHiringSubmissions } from "@/lib/hiring-records";
import { HiringFormBuilder } from "@/components/hiring/hiring-form-builder";
import { HiringResponses } from "@/components/hiring/hiring-responses";
import { InterviewCalendar } from "@/components/hiring/interview-calendar";
export const metadata: Metadata = {
  title: "Hiring Form",
};

export const dynamic = "force-dynamic";

// Keep in sync with HiringSectionNav (first tab is the default).
const tabs = ["responses", "calendar", "builder"] as const;
type Tab = (typeof tabs)[number];

export default async function HiringFormPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; application?: string }>;
}) {
  const { tab, application } = await searchParams;
  const active: Tab = tabs.includes(tab as Tab) ? (tab as Tab) : "responses";

  if (active === "builder") {
    const [config, version] = await Promise.all([loadHiringConfig(), loadHiringConfigVersion()]);
    return <HiringFormBuilder config={config} landing={landingOf(config)} version={version} />;
  }

  const [submissions, config] = await Promise.all([listHiringSubmissions(), loadHiringConfig()]);
  if (active === "calendar") {
    return <InterviewCalendar submissions={submissions} fields={config.textFields} />;
  }
  return <HiringResponses submissions={submissions} fields={config.textFields} openApplicationId={application} />;
}
