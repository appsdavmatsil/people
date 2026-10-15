import type { Metadata } from "next";

export const metadata: Metadata = { title: "Service Charge" };

export default function ServiceChargePage() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl">
        <h1 className="text-lg font-semibold text-stone-950">Service Charge</h1>
        <p className="mt-1 text-sm text-stone-500">
          Service charge distribution and records.
        </p>

        <div className="mt-6 rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-10 text-center">
          <p className="text-sm text-stone-500">
            Service charge content goes here. Tell me what this page should show
            (e.g. monthly pool, per-staff shares, reconciliation) and I will build it.
          </p>
        </div>
      </div>
    </div>
  );
}
