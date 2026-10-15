"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { TipsRun } from "@/lib/tips";
import { createTipsMonthAction } from "@/app/(app)/benefits/tips/actions";

export function TipsVenueTabs({ active, labels }: { active: string; labels: Record<string, string> }) {
  const venues = ["BB", "JBR", "SC", "VM"];
  return (
    <div className="flex flex-wrap gap-2">
      {venues.map((v) => (
        <a
          key={v}
          href={`/benefits/tips?venue=${v}`}
          className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
            active === v ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-400"
          }`}
          title={labels[v]}
        >
          {v}
        </a>
      ))}
    </div>
  );
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEPT", "OCT", "NOV", "DEC"];
const MONTH_NUM: Record<string, number> = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEPT: 9, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };

export function TipsMonthTimeline({ venue, runs, activeMonth }: { venue: string; runs: TipsRun[]; activeMonth: string }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [busy, setBusy] = useState(false);

  const year = runs[0]?.month ? new Date(runs[0].month).getFullYear() : new Date().getFullYear();

  async function addMonth(source: "clone" | "directory") {
    const label = newLabel.trim().toUpperCase();
    const mnum = MONTH_NUM[label];
    if (!mnum) { alert("Enter a valid month (e.g. OCT)"); return; }
    const month = `${year}-${String(mnum).padStart(2, "0")}-01`;
    const days = new Date(year, mnum, 0).getDate();
    setBusy(true);
    const res = await createTipsMonthAction({ venue, month, monthLabel: label, monthDays: days, source });
    setBusy(false);
    if (res.ok) { setAdding(false); setNewLabel(""); router.push(`/benefits/tips?venue=${venue}&month=${month}`); router.refresh(); }
    else alert(res.error);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-stone-200 bg-white p-2">
      {runs.map((r) => {
        const act = r.month === activeMonth;
        return (
          <a
            key={r.id}
            href={`/benefits/tips?venue=${venue}&month=${r.month}`}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              act ? "bg-[#063f3b] text-white" : "text-stone-600 hover:bg-stone-100"
            }`}
          >
            <span className={`size-1.5 rounded-full ${r.locked ? "bg-green-500" : "bg-amber-400"}`} />
            {r.month_label}
          </a>
        );
      })}
      {adding ? (
        <span className="flex items-center gap-1">
          <input autoFocus value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="OCT"
            className="h-8 w-20 rounded-lg border border-stone-300 px-2 text-xs uppercase outline-none focus:border-stone-500" />
          <button onClick={() => addMonth("clone")} disabled={busy} title="Carry forward last month's staff (incl. support)"
            className="h-8 rounded-lg bg-[#063f3b] px-2 text-xs font-medium text-white disabled:opacity-60">{busy ? "…" : "Clone last"}</button>
          <button onClick={() => addMonth("directory")} disabled={busy} title="Start fresh from the current staff directory"
            className="h-8 rounded-lg border border-[#063f3b] px-2 text-xs font-medium text-[#063f3b] disabled:opacity-60">From directory</button>
          <button onClick={() => setAdding(false)} className="h-8 rounded-lg border border-stone-300 px-2 text-xs">×</button>
        </span>
      ) : (
        <button onClick={() => setAdding(true)} className="rounded-lg border border-dashed border-stone-300 px-3 py-1.5 text-xs text-stone-500 hover:border-stone-500">+ Month</button>
      )}
    </div>
  );
}

export { MONTHS };
