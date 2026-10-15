import type { Metadata } from "next";
import { VENUES, VENUE_LABELS, listTipsRuns, getTipsRun } from "@/lib/tips";
import { TipsEditor } from "@/components/benefits/tips-editor";
import { TipsVenueTabs, TipsMonthTimeline } from "@/components/benefits/tips-nav";

export const metadata: Metadata = { title: "Tips" };
export const dynamic = "force-dynamic";

export default async function TipsPage({
  searchParams,
}: {
  searchParams: Promise<{ venue?: string; month?: string }>;
}) {
  const { venue: vParam, month: mParam } = await searchParams;
  const venue = (VENUES as readonly string[]).includes(vParam ?? "") ? vParam! : "BB";

  const runs = await listTipsRuns(venue);
  // default to the latest month
  const month = mParam || runs[runs.length - 1]?.month || "";
  const { run, rows } = month ? await getTipsRun(venue, month) : { run: null, rows: [] };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <div>
          <h1 className="text-lg font-semibold text-stone-950">Tips</h1>
          <p className="text-sm text-stone-500">Monthly tips pool and distribution by venue.</p>
        </div>

        <TipsVenueTabs active={venue} labels={VENUE_LABELS} />
        <TipsMonthTimeline venue={venue} runs={runs} activeMonth={month} />

        {run ? (
          <TipsEditor run={run} rows={rows} />
        ) : (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-10 text-center text-sm text-stone-500">
            No month selected. Create one from the timeline above.
          </div>
        )}
      </div>
    </div>
  );
}
