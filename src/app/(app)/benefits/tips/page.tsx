import type { Metadata } from "next";

export const metadata: Metadata = { title: "Tips" };

export default function TipsPage() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl">
        <h1 className="text-lg font-semibold text-stone-950">Tips</h1>
        <p className="mt-1 text-sm text-stone-500">
          Tips pool and distribution by points.
        </p>

        <div className="mt-6 rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-10 text-center">
          <p className="text-sm text-stone-500">
            Tips content goes here. Tell me what this page should show
            (e.g. pot total, per-point value, per-staff payout) and I will build it.
          </p>
        </div>
      </div>
    </div>
  );
}
