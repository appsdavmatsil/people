import type { Metadata } from "next";
import { HiringApplicationForm } from "@/components/hiring/hiring-application-form";
import { landingOf, loadHiringConfig } from "@/lib/hiring-config";

export const metadata: Metadata = {
  title: "Join The Maine",
  description: "Apply to join The Maine team.",
};

export const dynamic = "force-dynamic";

export default async function HiringDetailsPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const [config, { preview }] = await Promise.all([loadHiringConfig(), searchParams]);
  const landing = landingOf(config);

  return (
    <main className="flex min-h-dvh flex-col overflow-y-auto bg-stone-100">
      <div className="mx-auto w-full max-w-xl flex-1 px-5 py-10">
        <HiringApplicationForm
          textFields={config.textFields}
          documents={config.documents}
          landing={landing}
          previewSuccess={preview === "success"}
        />
      </div>
      <footer className="flex flex-col items-center gap-3 border-t border-stone-300 bg-stone-200 px-5 py-8">
        {landing.logo && (
          <img src={landing.logo} alt="The Maine" className="max-h-20 w-20 object-contain mix-blend-multiply" />
        )}
        <p className="text-xs font-medium tracking-wide text-stone-600">
          New England Brasserie Company · {new Date().getFullYear()}
        </p>
      </footer>
    </main>
  );
}
