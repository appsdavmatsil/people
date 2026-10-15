"use client";

import { useMemo, useState } from "react";
import type { TipsRun, TipsRow } from "@/lib/tips";
import { computeRun, defaultPointsFor } from "@/lib/tips";
import {
  saveTipsRunAction, upsertTipsRowAction, updateTipsRowAction, deleteTipsRowAction, listDirectoryStaffAction,
} from "@/app/(app)/benefits/tips/actions";

const money = (n: number) => n.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Kitchen brigade seniority — lower number = more senior. Position text is
// matched case-insensitively; the numeric prefixes in the sheets ("03. SNR SOUS")
// are handled by the keyword match below.
function brigadeRank(position: string | null): number {
  const p = (position ?? "").toLowerCase();
  if (/exec/.test(p)) return 1;                       // Executive Chef
  if (/head chef/.test(p)) return 2;
  if (/snr sous|senior sous/.test(p)) return 3;
  if (/\bsous\b/.test(p) && !/jnr|junior/.test(p)) return 4;
  if (/jnr sous|junior sous/.test(p)) return 5;
  if (/snr cdp|senior cdp/.test(p)) return 6;
  if (/sushi/.test(p)) return 7;
  if (/pastry/.test(p)) return 8;
  if (/cdp|chef de partie/.test(p)) return 9;
  if (/demi/.test(p)) return 10;
  if (/commis\s*1/.test(p)) return 11;
  if (/commis\s*2/.test(p)) return 12;
  if (/commis\s*3/.test(p)) return 13;
  if (/trainee/.test(p)) return 14;
  if (/head steward/.test(p)) return 15;
  if (/steward/.test(p)) return 16;
  if (/\bkp\b/.test(p)) return 17;
  if (/runner|goods|purchas|invoice|driver/.test(p)) return 18;
  if (/support/.test(p)) return 19;
  return 50; // unknown / misc at the bottom
}

export function TipsEditor({ run, rows: initialRows }: { run: TipsRun; rows: TipsRow[] }) {
  const [bank, setBank] = useState(run.tips_bank);
  const [extra, setExtra] = useState(run.extra);
  const [monthDays, setMonthDays] = useState(run.month_days);
  const [rows, setRows] = useState<TipsRow[]>(initialRows);
  const [locked, setLocked] = useState(run.locked);
  const [savingHdr, setSavingHdr] = useState(false);
  const [picker, setPicker] = useState(false);
  const [staff, setStaff] = useState<{ name: string; position: string; here: boolean }[]>([]);
  const [pickerSearch, setPickerSearch] = useState("");
  const [sortKey, setSortKey] = useState<"order" | "position" | "points" | "payout">("order");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [kfModal, setKfModal] = useState(false);
  const [kfRoundStep, setKfRoundStep] = useState(10);
  const [kfMinus, setKfMinus] = useState("");
  const [kfCustomAmt, setKfCustomAmt] = useState("");

  const liveRun: TipsRun = { ...run, tips_bank: bank, extra, month_days: monthDays };
  const computed = useMemo(() => computeRun(liveRun, rows), [bank, extra, monthDays, rows]);

  // Display order (sorting is view-only; it does not change saved sort_order).
  const viewRows = useMemo(() => {
    const kf = computed.rows.filter((r) => /kitchen fund/i.test(r.name));
    const arr = computed.rows.filter((r) => !/kitchen fund/i.test(r.name));
    if (sortKey !== "order") {
      const dir = sortDir === "asc" ? 1 : -1;
      arr.sort((a, b) => {
        let av: number | string = 0, bv: number | string = 0;
        if (sortKey === "position") { return dir * (brigadeRank(a.position) - brigadeRank(b.position) || a.name.localeCompare(b.name)); }
        if (sortKey === "points") { av = a.actual; bv = b.actual; }
        if (sortKey === "payout") { av = a.payout; bv = b.payout; }
        return dir * ((av as number) - (bv as number));
      });
    }
    return [...arr, ...kf];
  }, [computed.rows, sortKey, sortDir]);

  function toggleSort(k: "position" | "points" | "payout") {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "position" ? "asc" : "desc"); }
  }

  /** Open the Kitchen Fund setup modal (round off / minus from everyone / custom). */
  function addKitchenFund() {
    setKfModal(true);
  }

  function adjustableRows() {
    return computed.rows.filter((r) => r.override_amount == null && r.payout > 0 && !/kitchen fund/i.test(r.name));
  }

  async function ensureKitchenFund(amount: number, mode: "replace" | "on_top"): Promise<void> {
    const existing = rows.find((r) => /kitchen fund/i.test(r.name));
    if (existing) {
      setRows((cur) => cur.map((r) => (r.id === existing.id ? { ...r, override_amount: amount, override_mode: mode } : r)));
      await updateTipsRowAction(existing.id, { override_amount: amount, override_mode: mode });
    } else {
      const res = await upsertTipsRowAction({
        run_id: run.id, sort_order: rows.length, name: "KITCHEN FUND", position: "MISC EXPENSES", status: "SUPPORT",
        points: null, work_days: null, deduction: 0, override_amount: amount, override_mode: mode, comment: null,
      });
      if (res.ok && res.id) {
        setRows((cur) => [...cur, {
          id: res.id!, run_id: run.id, sort_order: cur.length, name: "KITCHEN FUND", position: "MISC EXPENSES", status: "SUPPORT",
          points: null, work_days: null, deduction: 0, override_amount: amount, override_mode: mode, comment: null,
        }]);
      }
    }
  }

  // Method 1: round each payout down to `step`; remainder -> Kitchen Fund (on top).
  async function kfRoundOff(step: number) {
    const targets = adjustableRows();
    let collected = 0;
    const updates: { id: string; amount: number }[] = [];
    for (const r of targets) {
      const rounded = Math.floor(r.payout / step) * step;
      collected += r.payout - rounded;
      updates.push({ id: r.id, amount: Math.round(rounded * 100) / 100 });
    }
    setRows((cur) => cur.map((r) => {
      const u = updates.find((x) => x.id === r.id);
      return u ? { ...r, override_amount: u.amount, override_mode: "replace" } : r;
    }));
    for (const u of updates) await updateTipsRowAction(u.id, { override_amount: u.amount, override_mode: "replace" });
    await ensureKitchenFund(Math.round(collected * 100) / 100, "on_top");
    setKfModal(false);
  }

  // Method 2: subtract `amount` from each eligible payout; total -> Kitchen Fund (on top).
  async function kfMinusEach(amount: number) {
    const targets = adjustableRows();
    let collected = 0;
    const updates: { id: string; amount: number }[] = [];
    for (const r of targets) {
      const reduced = Math.max(0, r.payout - amount);
      collected += r.payout - reduced;
      updates.push({ id: r.id, amount: Math.round(reduced * 100) / 100 });
    }
    setRows((cur) => cur.map((r) => {
      const u = updates.find((x) => x.id === r.id);
      return u ? { ...r, override_amount: u.amount, override_mode: "replace" } : r;
    }));
    for (const u of updates) await updateTipsRowAction(u.id, { override_amount: u.amount, override_mode: "replace" });
    await ensureKitchenFund(Math.round(collected * 100) / 100, "on_top");
    setKfModal(false);
  }

  // Method 3: just set a custom Kitchen Fund amount (doesn't touch others; on top).
  async function kfCustom(amount: number) {
    await ensureKitchenFund(amount, "on_top");
    setKfModal(false);
  }

  const balanceDiff = computed.totalDistributed - (computed.totalPot + computed.onTopTotal);
  const balanced = Math.abs(balanceDiff) < 0.5;
  // "replace" overrides that exceed the pot starve everyone else (pool hits 0).
  const replaceTotal = rows
    .filter((r) => r.override_amount != null && r.override_mode === "replace")
    .reduce((s, r) => s + (r.override_amount ?? 0), 0);
  const overAllocated = replaceTotal > computed.totalPot + 0.5;

  async function saveHeader(patch: Partial<{ month_days: number; tips_bank: number; extra: number; locked: boolean }>) {
    setSavingHdr(true);
    await saveTipsRunAction(run.id, patch);
    setSavingHdr(false);
  }

  function patchRow(id: string, patch: Partial<TipsRow>) {
    setRows((cur) => cur.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  async function persistRow(id: string, patch: Partial<TipsRow>) {
    patchRow(id, patch);
    await updateTipsRowAction(id, patch);
  }

  async function addFromDirectory(name: string, position: string) {
    const pts = defaultPointsFor(position);
    const res = await upsertTipsRowAction({
      run_id: run.id, sort_order: rows.length, name, position, status: "ON'BOARD",
      points: pts, work_days: monthDays, deduction: 0, override_amount: null, override_mode: "replace", comment: null,
    });
    if (res.ok && res.id) {
      setRows((cur) => [...cur, {
        id: res.id!, run_id: run.id, sort_order: cur.length, name, position, status: "ON'BOARD",
        points: pts, work_days: monthDays, deduction: 0, override_amount: null, override_mode: "replace", comment: null,
      }]);
    }
    setPicker(false);
  }

  async function addManual() {
    const name = prompt("Name (support / cross-charge / outsourced)?");
    if (!name?.trim()) return;
    const position = prompt("Position / role? (e.g. VM Support, Driver, KP)") || "";
    const pts = defaultPointsFor(position);
    const res = await upsertTipsRowAction({
      run_id: run.id, sort_order: rows.length, name: name.trim(), position, status: "SUPPORT",
      points: pts, work_days: 0, deduction: 0, override_amount: null, override_mode: "replace", comment: null,
    });
    if (res.ok && res.id) {
      setRows((cur) => [...cur, {
        id: res.id!, run_id: run.id, sort_order: cur.length, name: name.trim(), position, status: "SUPPORT",
        points: pts, work_days: 0, deduction: 0, override_amount: null, override_mode: "replace", comment: null,
      }]);
    }
    setPicker(false);
  }

  async function openPicker() {
    setPicker(true);
    if (staff.length === 0) {
      const list = await listDirectoryStaffAction(run.venue);
      setStaff(list);
    }
  }

  async function removePerson(id: string) {
    if (!confirm("Remove this person from this month?")) return;
    setRows((cur) => cur.filter((r) => r.id !== id));
    await deleteTipsRowAction(id);
  }

  function toggleOverride(r: TipsRow & { payout: number }) {
    if (r.override_amount != null) {
      persistRow(r.id, { override_amount: null });
    } else {
      const v = prompt(`Fixed payout for ${r.name} (AED)?\nThis comes out of the pot — everyone else revises automatically.`, String(Math.round(r.payout)));
      if (v == null) return;
      const amount = Number(v);
      if (!isFinite(amount)) return;
      persistRow(r.id, { override_amount: amount, override_mode: "replace" });
    }
  }

  // Toggle an overridden row between 'replace' (from pot) and 'on_top' (extra funds).
  function toggleOverrideMode(r: TipsRow) {
    if (r.override_amount == null) return;
    persistRow(r.id, { override_mode: r.override_mode === "replace" ? "on_top" : "replace" });
  }

  function exportExcel() {
    // CSV (opens in Excel) matching the sheet layout.
    const header = ["#", "Name", "Position", "Status", "Points", "Work Days", "Deduction", "Actual Points", "Payout", "Comment"];
    const lines = [
      `${run.venue} TIPS — ${run.month_label}`,
      `Tips Bank,${bank}`, `Extra,${extra}`, `Month Days,${monthDays}`,
      `Value per Point,${computed.valuePerPoint.toFixed(4)}`, "",
      header.join(","),
      ...computed.rows.map((r, i) => [
        i + 1, `"${r.name}"`, `"${r.position ?? ""}"`, `"${r.status ?? ""}"`,
        r.points ?? "", r.work_days ?? "", r.deduction, r.actual.toFixed(3), r.payout.toFixed(2), `"${r.comment ?? ""}"`,
      ].join(",")),
      "", `Total Distributed,${computed.totalDistributed.toFixed(2)}`,
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${run.venue}_TIPS_${run.month_label}.csv`;
    a.click();
  }

  function exportPdf() {
    const esc = (v: unknown) => String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
    const body = computed.rows.map((r, i) => `<tr>
      <td>${i + 1}</td><td style="text-align:left">${esc(r.name)}</td><td style="text-align:left">${esc(r.position ?? "")}</td>
      <td>${r.points ?? ""}</td><td>${r.work_days ?? ""}</td><td>${Math.round((r.deduction ?? 0) * 100)}%</td>
      <td>${r.actual.toFixed(2)}</td><td style="text-align:right">${money(r.payout)}${r.override_amount != null ? " *" : ""}</td>
      <td style="text-align:left">${esc(r.comment ?? "")}</td></tr>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${run.venue} Tips ${run.month_label}</title>
      <style>*{font-family:-apple-system,Segoe UI,Roboto,sans-serif}body{padding:28px;color:#1c1917}
      h1{margin:0;font-size:20px}.sub{color:#57534e;margin:4px 0 16px}
      .cards{display:flex;gap:16px;margin-bottom:16px;font-size:13px}.cards div{background:#f5f5f4;border-radius:8px;padding:8px 12px}
      table{width:100%;border-collapse:collapse;font-size:12px}th,td{border-bottom:1px solid #e7e5e4;padding:5px 6px;text-align:center}
      th{background:#063f3b;color:#fff;font-size:10px;text-transform:uppercase}tfoot td{font-weight:700;border-top:2px solid #063f3b}
      @media print{body{padding:0}}</style></head><body>
      <h1>${esc(run.venue)} — Tips Distribution</h1><div class="sub">${esc(run.month_label)} · ${monthDays} days</div>
      <div class="cards">
        <div>Tips Bank<br><b>AED ${money(bank)}</b></div><div>Extra<br><b>AED ${money(extra)}</b></div>
        <div>Total Pot<br><b>AED ${money(computed.totalPot)}</b></div>
        <div>Value/Point<br><b>AED ${money(computed.valuePerPoint)}</b></div>
        <div>Distributed<br><b>AED ${money(computed.totalDistributed)}</b></div>
      </div>
      <table><thead><tr><th>#</th><th>Name</th><th>Position</th><th>Pts</th><th>Days</th><th>Ded</th><th>Actual</th><th>Payout</th><th>Comment</th></tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr><td colspan="7">Total (${computed.rows.length})</td><td style="text-align:right">AED ${money(computed.totalDistributed)}</td><td></td></tr></tfoot></table>
      <p style="font-size:10px;color:#78716c;margin-top:8px">* fixed/override payout</p>
      <script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  }

  return (
    <div className="space-y-4">
      {/* Summary header */}
      <div className="grid grid-cols-2 gap-3 rounded-2xl border border-stone-200 bg-white p-4 sm:grid-cols-4">
        <HeaderNum label="Tips Bank (AED)" value={bank} onChange={setBank} onBlur={(v) => saveHeader({ tips_bank: v })} editable={!locked} />
        <HeaderNum label="Extra (AED)" value={extra} onChange={setExtra} onBlur={(v) => saveHeader({ extra: v })} editable={!locked} />
        <HeaderNum label="Month Days" value={monthDays} onChange={setMonthDays} onBlur={(v) => saveHeader({ month_days: v })} editable={!locked} integer />
        <Stat label="Total Pot" value={`AED ${money(computed.totalPot)}`} />
        <Stat label="Total Points" value={computed.totalPoints.toFixed(2)} />
        <Stat label="Value / Point" value={`AED ${money(computed.valuePerPoint)}`} highlight />
        <Stat label="Distributed" value={`AED ${money(computed.totalDistributed)}`} />
        <div className="flex flex-col justify-center">
          <span className="text-[11px] text-stone-400">Balance</span>
          <span className={`text-sm font-semibold ${balanced ? "text-green-600" : "text-amber-600"}`}>
            {balanced ? "✓ Balanced" : `${balanceDiff > 0 ? "+" : ""}${money(balanceDiff)}`}
          </span>
        </div>
      </div>

      {overAllocated && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          ⚠️ Fixed payouts (AED {money(replaceTotal)}) exceed the pot (AED {money(computed.totalPot)}). There's nothing left to
          distribute by points, so everyone else shows 0. Lower a fixed amount, raise the Tips Bank, or set the extra ones to “on top”.
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={openPicker} disabled={locked} className="rounded-lg bg-[#063f3b] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#052f2c] disabled:opacity-50">+ Add person</button>
        <button onClick={addKitchenFund} disabled={locked} className="rounded-lg border border-[#063f3b] px-3 py-1.5 text-xs font-medium text-[#063f3b] hover:bg-[#063f3b]/5 disabled:opacity-50">+ Kitchen Fund</button>
        <button onClick={exportExcel} className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50">Export Excel</button>
        <button onClick={exportPdf} className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50">Export PDF</button>
        <button onClick={() => { const n = !locked; setLocked(n); saveHeader({ locked: n }); }}
          className={`ml-auto rounded-lg border px-3 py-1.5 text-xs font-medium ${locked ? "border-green-300 bg-green-50 text-green-700" : "border-stone-300 text-stone-600 hover:bg-stone-50"}`}>
          {locked ? "🔒 Locked (click to unlock)" : "Lock month"}
        </button>
        {savingHdr && <span className="text-[11px] text-stone-400">saving…</span>}
      </div>

      {/* Staff table */}
      <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-[11px] uppercase tracking-wide text-stone-400">
              <th className="px-3 py-2 w-8">#</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2 cursor-pointer select-none hover:text-stone-700" onClick={() => toggleSort("position")}>
                Position {sortKey === "position" ? (sortDir === "asc" ? "▲" : "▼") : ""}
              </th>
              <th className="px-2 py-2 w-16 text-right">Points</th>
              <th className="px-2 py-2 w-20 text-right">Days</th>
              <th className="px-2 py-2 w-16 text-right">Ded %</th>
              <th className="px-2 py-2 w-20 text-right cursor-pointer select-none hover:text-stone-700" onClick={() => toggleSort("points")}>
                Actual {sortKey === "points" ? (sortDir === "asc" ? "▲" : "▼") : ""}
              </th>
              <th className="px-3 py-2 w-28 text-right cursor-pointer select-none hover:text-stone-700" onClick={() => toggleSort("payout")}>
                Payout {sortKey === "payout" ? (sortDir === "asc" ? "▲" : "▼") : ""}
              </th>
              <th className="px-2 py-2 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {viewRows.map((r, i) => {
              const overridden = r.override_amount != null;
              return (
                <tr key={r.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50/60">
                  <td className="px-3 py-1.5 text-stone-400">{i + 1}</td>
                  <td className="px-3 py-1.5">
                    <div className="font-medium text-stone-800">{r.name}</div>
                    {r.status && r.status !== "ON'BOARD" && <div className="text-[10px] text-stone-400">{r.status}</div>}
                    {r.comment && <div className="mt-0.5 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700">💬 {r.comment}</div>}
                  </td>
                  <td className="px-3 py-1.5 text-stone-500">{r.position}</td>
                  <td className="px-2 py-1.5 text-right">
                    <input type="number" step="0.1" disabled={locked} value={r.points == null || r.points === 0 ? "" : r.points} placeholder="0" onFocus={(e) => e.currentTarget.select()} onChange={(e) => patchRow(r.id, { points: e.target.value === "" ? null : Number(e.target.value) })} onBlur={(e) => persistRow(r.id, { points: e.target.value === "" ? null : Number(e.target.value) })}
                      className="w-14 rounded border border-transparent bg-transparent px-1 py-0.5 text-right hover:border-stone-200 focus:border-stone-400 focus:outline-none" />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <input type="number" disabled={locked} value={r.work_days == null || r.work_days === 0 ? "" : r.work_days} placeholder="0" onFocus={(e) => e.currentTarget.select()} onChange={(e) => patchRow(r.id, { work_days: e.target.value === "" ? null : Number(e.target.value) })} onBlur={(e) => persistRow(r.id, { work_days: e.target.value === "" ? null : Number(e.target.value) })}
                      className="w-16 rounded border border-transparent bg-transparent px-1 py-0.5 text-right hover:border-stone-200 focus:border-stone-400 focus:outline-none" />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <input type="number" step="1" disabled={locked} value={!r.deduction ? "" : Math.round(r.deduction * 100)} placeholder="0" onFocus={(e) => e.currentTarget.select()} onChange={(e) => patchRow(r.id, { deduction: (e.target.value === "" ? 0 : Number(e.target.value)) / 100 })} onBlur={(e) => persistRow(r.id, { deduction: (e.target.value === "" ? 0 : Number(e.target.value)) / 100 })}
                      className="w-12 rounded border border-transparent bg-transparent px-1 py-0.5 text-right hover:border-stone-200 focus:border-stone-400 focus:outline-none" />
                  </td>
                  <td className="px-2 py-1.5 text-right text-stone-500">{r.actual.toFixed(2)}</td>
                  <td className={`px-3 py-1.5 text-right font-medium ${overridden ? "text-[#063f3b]" : "text-stone-800"}`}>
                    {money(r.payout)}
                    {overridden && (
                      <button
                        onClick={() => toggleOverrideMode(r)}
                        title={r.override_mode === "on_top" ? "Paid ON TOP of pot — click to take from pot instead" : "Taken FROM pot — click to pay on top instead"}
                        className="ml-1 rounded bg-[#063f3b]/10 px-1 text-[9px] text-[#063f3b] hover:bg-[#063f3b]/20"
                      >
                        {r.override_mode === "on_top" ? "FIXED+" : "FIXED"}
                      </button>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center justify-end gap-1">
                      <button title="Comment" onClick={() => { const c = prompt("Comment:", r.comment ?? ""); if (c != null) persistRow(r.id, { comment: c }); }}
                        className={`grid size-6 place-items-center rounded ${r.comment ? "text-blue-600" : "text-stone-300 hover:text-stone-500"}`}>💬</button>
                      <button title="Override payout" disabled={locked} onClick={() => toggleOverride(r)}
                        className={`grid size-6 place-items-center rounded ${overridden ? "text-[#063f3b]" : "text-stone-300 hover:text-stone-500"}`}>🔒</button>
                      <button title="Remove" disabled={locked} onClick={() => removePerson(r.id)}
                        className="grid size-6 place-items-center rounded text-stone-300 hover:text-red-500">×</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-stone-200 font-semibold">
              <td className="px-3 py-2" colSpan={6}>Total ({computed.rows.length})</td>
              <td className="px-2 py-2 text-right text-stone-500">{computed.totalPoints.toFixed(2)}</td>
              <td className="px-3 py-2 text-right">AED {money(computed.totalDistributed)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-[11px] text-stone-400">
        Payout = (Pot ÷ Total Points) × Actual Points. Fixed+ rows (Driver, Kitchen Fund) are paid on top of the pot;
        Fixed rows replace their pool share. Deduction is a %. Edits save automatically.
      </p>

      {/* Staff picker — compact dropdown */}
      {picker && (
        <div className="fixed inset-0 z-[80]" onClick={() => setPicker(false)}>
          <div
            className="absolute left-1/2 top-40 w-72 -translate-x-1/2 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-stone-100 p-2">
              <input autoFocus value={pickerSearch} onChange={(e) => setPickerSearch(e.target.value)} placeholder="Search staff…"
                className="w-full rounded-lg border border-stone-200 px-2.5 py-1.5 text-sm outline-none focus:border-stone-400" />
            </div>
            <div className="max-h-56 overflow-y-auto">
              {staff.length === 0 && <p className="p-4 text-center text-xs text-stone-400">Loading…</p>}
              {staff
                .filter((s) => pickerSearch === "" || `${s.name} ${s.position}`.toLowerCase().includes(pickerSearch.toLowerCase()))
                .filter((s) => !rows.some((r) => r.name.toLowerCase() === s.name.toLowerCase()))
                .map((s) => (
                  <button key={s.name} onClick={() => addFromDirectory(s.name, s.position)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-stone-50">
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-stone-800">{s.name}</span>
                      <span className="block truncate text-[11px] text-stone-400">{s.position}</span>
                    </span>
                    {!s.here && <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium text-amber-700">Cross</span>}
                  </button>
                ))}
            </div>
            <button onClick={addManual} className="w-full border-t border-stone-100 px-3 py-2 text-left text-xs font-medium text-[#063f3b] hover:bg-stone-50">
              + Add manually (support / outsourced)
            </button>
          </div>
        </div>
      )}
      {/* Kitchen Fund setup modal */}
      {kfModal && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-stone-950/40 p-4" onClick={() => setKfModal(false)}>
          <div className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-stone-900">Kitchen Fund</h2>
              <button onClick={() => setKfModal(false)} className="grid size-7 place-items-center rounded-lg text-stone-500 hover:bg-stone-100">×</button>
            </div>

            {/* 1. Round off */}
            <div className="rounded-xl border border-stone-200 p-3">
              <p className="text-sm font-medium text-stone-800">Round off everyone</p>
              <p className="mt-0.5 text-[11px] text-stone-500">Round each payout down; the leftover goes to Kitchen Fund.</p>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-stone-500">Nearest</span>
                {[10, 50, 100].map((s) => (
                  <button key={s} onClick={() => setKfRoundStep(s)}
                    className={`rounded-md border px-2 py-1 text-xs ${kfRoundStep === s ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300"}`}>{s}</button>
                ))}
                <button onClick={() => kfRoundOff(kfRoundStep)} className="ml-auto rounded-md bg-[#063f3b] px-3 py-1 text-xs font-semibold text-white">Apply</button>
              </div>
            </div>

            {/* 2. Minus from everyone */}
            <div className="rounded-xl border border-stone-200 p-3">
              <p className="text-sm font-medium text-stone-800">Minus from everyone</p>
              <p className="mt-0.5 text-[11px] text-stone-500">Subtract a fixed amount from each payout into Kitchen Fund.</p>
              <div className="mt-2 flex items-center gap-2">
                <input type="number" value={kfMinus} onChange={(e) => setKfMinus(e.target.value)} placeholder="e.g. 50"
                  className="w-24 rounded-md border border-stone-300 px-2 py-1 text-sm outline-none focus:border-stone-500" />
                <button onClick={() => { const n = Number(kfMinus); if (n > 0) kfMinusEach(n); }}
                  className="ml-auto rounded-md bg-[#063f3b] px-3 py-1 text-xs font-semibold text-white">Apply</button>
              </div>
            </div>

            {/* 3. Custom amount */}
            <div className="rounded-xl border border-stone-200 p-3">
              <p className="text-sm font-medium text-stone-800">Custom amount</p>
              <p className="mt-0.5 text-[11px] text-stone-500">Set the Kitchen Fund to a fixed figure (doesn't change others).</p>
              <div className="mt-2 flex items-center gap-2">
                <input type="number" value={kfCustomAmt} onChange={(e) => setKfCustomAmt(e.target.value)} placeholder="e.g. 300"
                  className="w-24 rounded-md border border-stone-300 px-2 py-1 text-sm outline-none focus:border-stone-500" />
                <button onClick={() => { const n = Number(kfCustomAmt); if (isFinite(n)) kfCustom(n); }}
                  className="ml-auto rounded-md bg-[#063f3b] px-3 py-1 text-xs font-semibold text-white">Apply</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function HeaderNum({ label, value, onChange, onBlur, editable, integer }: {
  label: string; value: number; onChange: (v: number) => void; onBlur: (v: number) => void; editable: boolean; integer?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] text-stone-400">{label}</span>
      <input
        type="number" step={integer ? "1" : "0.01"} disabled={!editable}
        value={value === 0 ? "" : value}
        placeholder="0"
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
        onBlur={(e) => onBlur(e.target.value === "" ? 0 : Number(e.target.value))}
        className="mt-0.5 w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm font-semibold text-stone-900 outline-none focus:border-stone-500 disabled:bg-stone-50"
      />
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex flex-col justify-center">
      <span className="text-[11px] text-stone-400">{label}</span>
      <span className={`text-sm font-semibold ${highlight ? "text-[#063f3b]" : "text-stone-900"}`}>{value}</span>
    </div>
  );
}
