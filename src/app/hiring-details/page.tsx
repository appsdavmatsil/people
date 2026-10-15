import type { Metadata } from "next";
import { HiringApplicationForm } from "@/components/hiring/hiring-application-form";
import { loadHiringConfig } from "@/lib/hiring-config";

export const metadata: Metadata = {
  title: "Join The Maine",
  description: "Apply to join The Maine team.",
};

export const dynamic = "force-dynamic";

export default async function HiringDetailsPage() {
  const config = await loadHiringConfig();

  return (
    <main className="min-h-dvh overflow-y-auto bg-stone-100 px-5 py-10">
      <div className="mx-auto w-full max-w-xl">
        <header className="mb-6 text-center">
          <h1 className="text-2xl font-semibold text-stone-950">Join The Maine</h1>
          <p className="mt-2 text-sm text-stone-600">
            Tell us about yourself and upload your CV and a photo. Our team reviews every application.
          </p>
        </header>
        <HiringApplicationForm
          textFields={config.textFields}
          documents={config.documents}
        />
      </div>
    </main>
  );
}
