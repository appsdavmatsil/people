import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HiringResponses } from "@/components/hiring/hiring-responses";
import { loadHiringConfig } from "@/lib/hiring-config";
import { listHiringSubmissions } from "@/lib/hiring-records";
import { isValidHiringShareToken } from "@/lib/hiring-share";

export const metadata: Metadata = {
  title: "Job Applications",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export const dynamic = "force-dynamic";

export default async function HiringTeamPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!(await isValidHiringShareToken(token))) notFound();

  const [submissions, config] = await Promise.all([listHiringSubmissions(), loadHiringConfig()]);

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-white px-4 py-5 md:px-6">
      <header className="mb-4 flex items-center gap-3">
        <img src="/the-maine-logo.png" alt="The Maine" className="h-9 w-auto" />
        <div className="border-l border-stone-200 pl-3">
          <h1 className="text-sm font-semibold text-stone-950">Job Applications</h1>
          <p className="text-xs text-stone-500">Shared with the team · please don&apos;t forward this link</p>
        </div>
      </header>
      <HiringResponses submissions={submissions} fields={config.textFields} shareToken={token} />
    </main>
  );
}
