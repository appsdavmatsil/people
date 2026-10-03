import type { Metadata } from "next";
import { loadFormConfig } from "@/lib/form-config";
import { listIntakeSubmissions } from "@/lib/staff-intake-records";
import { FormBuilder } from "@/components/form/form-builder";
import { DocumentSorting } from "@/components/form/document-sorting";
import { FormResponses } from "@/components/form/form-responses";
import { FormNotifications } from "@/components/form/form-notifications";

export const metadata: Metadata = {
  title: "Form",
};

export const dynamic = "force-dynamic";

const tabs = ["builder", "sorting", "responses", "notifications"] as const;
type Tab = (typeof tabs)[number];

export default async function FormPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const active: Tab = tabs.includes(tab as Tab) ? (tab as Tab) : "builder";

  const config = await loadFormConfig();

  if (active === "builder") {
    return <FormBuilder config={config} />;
  }

  if (active === "sorting") {
    return <DocumentSorting config={config} />;
  }

  const submissions = await listIntakeSubmissions();

  if (active === "responses") {
    return <FormResponses submissions={submissions} />;
  }

  return <FormNotifications submissions={submissions} />;
}
