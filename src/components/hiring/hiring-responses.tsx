"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import type { HiringSubmission } from "@/lib/hiring-records";
import { flagFor, normalizeNationality } from "@/lib/hiring-nationality";
import { updateHiringStatusAction, deleteHiringSubmissionAction } from "@/app/(app)/hiringform/actions";

const STATUS_OPTIONS = ["new", "reviewed", "shortlisted", "hired"] as const;
type ViewMode = "grid" | "list";

const STATUS_STYLE: Record<string, string> = {
  new: "bg-blue-50 text-blue-700 border-blue-200",
  reviewed: "bg-amber-50 text-amber-700 border-amber-200",
  shortlisted: "bg-green-50 text-green-700 border-green-200",
  hired: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

function photoOf(s: HiringSubmission): string | null {
  const d = s.documents?.find((d) => /photo/i.test(d.label));
  return d?.web_view_link ?? d?.file_id ?? null;
}

export function HiringResponses({ submissions }: { submissions: HiringSubmission[] }) {
  const [records, setRecords] = useState(submissions);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [nationalityFilter, setNationalityFilter] = useState<string>("all");
  const [positionFilter, setPositionFilter] = useState<string>("all");
  const [view, setView] = useState<ViewMode>("grid");
  const [dupsOnly, setDupsOnly] = useState(false);
  const [showPos, setShowPos] = useState(false);
  const [detail, setDetail] = useState<HiringSubmission | null>(null);
  const [pendingDelete, setPendingDelete] = useState<HiringSubmission | null>(null);
  const [viewer, setViewer] = useState<{ url: string; label: string } | null>(null);
  const [zoom, setZoom] = useState(1);
  const posRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (posRef.current && !posRef.current.contains(e.target as Node)) setShowPos(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: records.length, new: 0, reviewed: 0, shortlisted: 0, hired: 0 };
    for (const r of records) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [records]);

  // Base slice for the nationality graph: respects status/position/search but
  // not the nationality filter itself (faceted behaviour).
  const natBase = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((r) => {
      const matchStatus = statusFilter === "all" || r.status === statusFilter;
      const matchPos = positionFilter === "all" || r.position_applied === positionFilter;
      const matchSearch =
        q === "" ||
        `${r.full_name} ${r.email ?? ""} ${r.position_applied ?? ""} ${r.nationality ?? ""}`.toLowerCase().includes(q);
      return matchStatus && matchPos && matchSearch;
    });
  }, [records, search, statusFilter, positionFilter]);

  const natCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of natBase) {
      const n = normalizeNationality(r.nationality);
      m.set(n, (m.get(n) ?? 0) + 1);
    }
    return Array.from(m.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [natBase]);

  // Duplicate detection: group applications by normalized email (fallback phone).
  // Lets HR see when the same person has applied more than once.
  const dupInfo = useMemo(() => {
    const key = (r: HiringSubmission) =>
      (r.email || "").trim().toLowerCase() || (r.phone || "").replace(/\D/g, "");
    const groups = new Map<string, HiringSubmission[]>();
    for (const r of records) {
      const k = key(r);
      if (!k) continue;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(r);
    }
    // id -> { count, others[] } only for keys with >1 application
    const map = new Map<string, { count: number; others: HiringSubmission[] }>();
    for (const [, list] of groups) {
      if (list.length < 2) continue;
      const sorted = [...list].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      for (const r of list) {
        map.set(r.id, { count: list.length, others: sorted.filter((x) => x.id !== r.id) });
      }
    }
    return { map, keyOf: key };
  }, [records]);

  const allPositions = useMemo(
    () => Array.from(new Set(records.map((r) => r.position_applied).filter(Boolean))).sort() as string[],
    [records],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((r) => {
      const matchStatus = statusFilter === "all" || r.status === statusFilter;
      const matchNat = nationalityFilter === "all" || normalizeNationality(r.nationality) === nationalityFilter;
      const matchPos = positionFilter === "all" || r.position_applied === positionFilter;
      const matchSearch =
        q === "" ||
        `${r.full_name} ${r.email ?? ""} ${r.position_applied ?? ""} ${r.nationality ?? ""}`.toLowerCase().includes(q);
      const matchDup = !dupsOnly || dupInfo.map.has(r.id);
      return matchStatus && matchNat && matchPos && matchSearch && matchDup;
    });
  }, [records, search, statusFilter, nationalityFilter, positionFilter, dupsOnly, dupInfo]);

  async function changeStatus(id: string, status: string) {
    setRecords((prev) => prev.map((r) => (r.id === id ? { ...r, status: status as HiringSubmission["status"] } : r)));
    if (detail?.id === id) setDetail({ ...detail, status: status as HiringSubmission["status"] });
    await updateHiringStatusAction(id, status);
  }
  async function doDelete(id: string) {
    setRecords((prev) => prev.filter((r) => r.id !== id));
    setPendingDelete(null);
    if (detail?.id === id) setDetail(null);
    await deleteHiringSubmissionAction(id);
  }

  // Download the full application as a print-ready sheet (photo + all details).
  // The CV (separate file) opens in a new tab for saving alongside.
  function downloadApplication(s: HiringSubmission) {
    const photo = photoOf(s);
    const esc = (v: unknown) => String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
    const rows: [string, unknown][] = [
      ["Email", s.email], ["Phone", s.phone], ["Date of birth", s.date_of_birth],
      ["Nationality", s.nationality], ["Address", s.current_address], ["Instagram", s.instagram],
      ["Position applied", s.position_applied], ["Current position", s.current_position],
      ["Experience", s.experience_years ? `${s.experience_years} yrs` : ""],
      ["Salary expectation", s.salary_expectation ? `AED ${s.salary_expectation}` : ""],
      ["Status", s.status], ["Applied", s.created_at ? new Date(s.created_at).toLocaleDateString("en-GB") : ""],
    ];
    const dataRows = Object.entries(s.data || {}).filter(([k, v]) => !["source", "source_id"].includes(k) && v);
    const docLinks = (s.documents || []).map((d) => `<a href="${esc(d.web_view_link ?? d.file_id)}">${esc(d.label)}</a>`).join(" &nbsp;·&nbsp; ");

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(s.full_name)} — Application</title>
      <style>
        *{box-sizing:border-box;font-family:-apple-system,Segoe UI,Roboto,sans-serif}
        body{margin:0;padding:32px;color:#1c1917}
        .head{display:flex;gap:20px;align-items:center;border-bottom:2px solid #063f3b;padding-bottom:16px}
        .head img{width:120px;height:120px;object-fit:cover;border-radius:12px}
        h1{margin:0;font-size:24px} .sub{color:#57534e;margin-top:4px}
        h2{font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:#78716c;margin:24px 0 8px}
        table{width:100%;border-collapse:collapse} td{padding:4px 8px;vertical-align:top;font-size:13px}
        td.k{color:#78716c;width:180px} .q{margin:10px 0} .q .ql{font-weight:600;font-size:13px} .q .qa{font-size:13px;white-space:pre-wrap;margin-top:2px}
        a{color:#063f3b}
        @media print{body{padding:0}}
      </style></head><body>
      <div class="head">
        ${photo ? `<img src="${esc(photo)}" crossorigin="anonymous"/>` : ""}
        <div><h1>${esc(s.full_name)}</h1><div class="sub">${esc(s.position_applied || "")} · ${esc(s.nationality || "")}</div></div>
      </div>
      <h2>Details</h2>
      <table>${rows.filter(([, v]) => v).map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</table>
      <h2>Documents</h2><p style="font-size:13px">${docLinks || "None"}</p>
      ${dataRows.length ? `<h2>Application</h2>${dataRows.map(([k, v]) => `<div class="q"><div class="ql">${esc(k.replace(/_/g, " "))}</div><div class="qa">${esc(v)}</div></div>`).join("")}` : ""}
      <script>window.onload=function(){setTimeout(function(){window.print()},400)}</script>
      </body></html>`;

    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
    // Also open the CV file so it can be saved alongside.
    const cv = (s.documents || []).find((d) => /cv|resume/i.test(d.label));
    if (cv) window.open(cv.web_view_link ?? cv.file_id, "_blank");
  }

  const activeFilters = [statusFilter !== "all", nationalityFilter !== "all", positionFilter !== "all", search !== ""].filter(Boolean).length;
  const clearAll = () => { setSearch(""); setStatusFilter("all"); setNationalityFilter("all"); setPositionFilter("all"); };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Status pills */}
      <div className="flex flex-wrap items-center gap-2">
        {(["all", ...STATUS_OPTIONS] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors ${
              statusFilter === s ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-400"
            }`}
          >
            {s} <span className="opacity-60">({counts[s] ?? 0})</span>
          </button>
        ))}
        {dupInfo.map.size > 0 && (
          <button
            onClick={() => setDupsOnly((v) => !v)}
            className={`ml-1 flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              dupsOnly ? "border-orange-500 bg-orange-500 text-white" : "border-orange-200 bg-orange-50 text-orange-700 hover:border-orange-400"
            }`}
            title="Applicants who applied more than once (matched by email/phone)"
          >
            ⚑ Reapplied <span className="opacity-70">({dupInfo.map.size})</span>
          </button>
        )}
      </div>

      {/* Nationality — compact donut */}
      {natCounts.length > 0 && (
        <div className="mt-4">
          <NationalityDonut
            data={natCounts}
            active={nationalityFilter}
            onPick={(name) => setNationalityFilter(nationalityFilter === name ? "all" : name)}
          />
        </div>
      )}

      {/* Search + view toggle + filters */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, position…"
          className="h-9 min-w-[200px] flex-1 rounded-lg border border-stone-200 bg-white px-3 text-sm outline-none focus:border-stone-400"
        />

        {/* view toggle */}
        <div className="flex items-center gap-0.5 rounded-lg border border-stone-200 bg-white p-0.5">
          <button onClick={() => setView("grid")} className={`grid size-8 place-items-center rounded-md ${view === "grid" ? "bg-stone-900 text-white" : "text-stone-500 hover:bg-stone-100"}`} aria-label="Grid">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
          </button>
          <button onClick={() => setView("list")} className={`grid size-8 place-items-center rounded-md ${view === "list" ? "bg-stone-900 text-white" : "text-stone-500 hover:bg-stone-100"}`} aria-label="List">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
          </button>
        </div>

        {/* position dropdown */}
        <div className="relative" ref={posRef}>
          <button onClick={() => setShowPos((v) => !v)} className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs ${positionFilter !== "all" ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-400"}`}>
            <span className="max-w-[120px] truncate">{positionFilter === "all" ? "Position" : positionFilter}</span>
            <span className="opacity-60">▾</span>
          </button>
          {showPos && (
            <div className="absolute right-0 top-full z-20 mt-1 max-h-72 w-56 overflow-y-auto rounded-lg border border-stone-200 bg-white shadow-xl">
              <button onClick={() => { setPositionFilter("all"); setShowPos(false); }} className="w-full px-3 py-2 text-left text-sm text-stone-600 hover:bg-stone-50">All Positions</button>
              {allPositions.map((p) => (
                <button key={p} onClick={() => { setPositionFilter(p); setShowPos(false); }} className="w-full px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-50">{p}</button>
              ))}
            </div>
          )}
        </div>

        {activeFilters > 0 && (
          <button onClick={clearAll} className="flex h-9 items-center gap-1 rounded-lg border border-stone-200 bg-white px-3 text-xs text-stone-500 hover:border-stone-400">× Clear</button>
        )}
      </div>

      <p className="mt-2 text-xs text-stone-500">{filtered.length} of {records.length} applications</p>

      {/* Results */}
      {view === "grid" ? (
        <div className="mt-3 grid min-h-0 flex-1 auto-rows-max content-start grid-cols-3 gap-3 overflow-y-auto pb-4 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {filtered.map((s) => {
            const photo = photoOf(s);
            return (
              <button key={s.id} onClick={() => setDetail(s)} className="group flex flex-col overflow-hidden rounded-xl border border-stone-200 bg-white text-left transition-all hover:-translate-y-0.5 hover:shadow-md">
                <div className="relative aspect-square w-full shrink-0 bg-stone-100">
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo} alt={s.full_name} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-stone-300"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg></div>
                  )}
                  <span className={`absolute left-1.5 top-1.5 rounded-full border px-1.5 py-0.5 text-[9px] font-medium capitalize ${STATUS_STYLE[s.status]}`}>{s.status}</span>
                  {dupInfo.map.has(s.id) && (
                    <span className="absolute right-1.5 top-1.5 rounded-full border border-orange-300 bg-orange-500/90 px-1.5 py-0.5 text-[9px] font-semibold text-white" title={`Applied ${dupInfo.map.get(s.id)!.count} times`}>
                      ⚑ ×{dupInfo.map.get(s.id)!.count}
                    </span>
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-6">
                    <p className="truncate text-xs font-medium text-white">{s.full_name}</p>
                  </div>
                </div>
                <div className="space-y-0.5 px-2 py-1.5">
                  <p className="truncate text-[11px] text-stone-700">{s.position_applied || "—"}</p>
                  <p className="flex items-center gap-1 truncate text-[11px] text-stone-400"><span>{flagFor(s.nationality)}</span><span className="truncate">{s.nationality || "Unknown"}</span></p>
                  {(s.experience_years || s.salary_expectation) && (
                    <p className="flex items-center gap-1.5 truncate text-[10px] text-stone-500">
                      {s.experience_years && <span>{s.experience_years} yrs</span>}
                      {s.experience_years && s.salary_expectation && <span className="text-stone-300">·</span>}
                      {s.salary_expectation && <span>AED {s.salary_expectation}</span>}
                    </p>
                  )}
                  {s.created_at && (
                    <p className="truncate text-[10px] text-stone-400">
                      Applied {new Date(s.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && <p className="col-span-full py-16 text-center text-sm text-stone-400">No applications match.</p>}
        </div>
      ) : (
        <div className="mt-3 min-h-0 flex-1 space-y-1.5 overflow-y-auto pb-4">
          {filtered.map((s) => {
            const photo = photoOf(s);
            return (
              <button key={s.id} onClick={() => setDetail(s)} className="flex w-full items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-left hover:border-stone-400">
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo} alt="" className="size-9 shrink-0 rounded-full object-cover" />
                ) : (
                  <div className="grid size-9 shrink-0 place-items-center rounded-full bg-stone-100 text-stone-300">—</div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-stone-900">{s.full_name}</p>
                  <p className="flex items-center gap-1 truncate text-xs text-stone-400"><span>{flagFor(s.nationality)}</span>{s.position_applied} · {s.nationality} · {s.email}</p>
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize ${STATUS_STYLE[s.status]}`}>{s.status}</span>
              </button>
            );
          })}
          {filtered.length === 0 && <p className="py-16 text-center text-sm text-stone-400">No applications match.</p>}
        </div>
      )}

      {/* Detail drawer */}
      {detail && (
        <div className="fixed inset-0 z-[80] flex justify-end bg-stone-950/40" onClick={() => setDetail(null)}>
          <div className="h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                {photoOf(detail) ? (
                  <button
                    type="button"
                    onClick={() => { setZoom(1); setViewer({ url: photoOf(detail)!, label: "Profile Photo" }); }}
                    className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-xl"
                    title="Click to zoom"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photoOf(detail)!} alt="" className="h-full w-full object-cover" />
                    <span className="absolute bottom-1 right-1 grid size-5 place-items-center rounded-md bg-black/60 text-white transition group-hover:bg-black/80">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
                    </span>
                  </button>
                ) : <div className="grid h-20 w-20 place-items-center rounded-xl bg-stone-100 text-stone-300">—</div>}
                <div>
                  <h2 className="text-lg font-semibold text-stone-900">{detail.full_name}</h2>
                  <p className="text-sm text-stone-500">{detail.position_applied}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-stone-400"><span>{flagFor(detail.nationality)}</span>{detail.nationality}</p>
                </div>
              </div>
              <button onClick={() => setDetail(null)} className="grid size-8 place-items-center rounded-lg text-stone-500 hover:bg-stone-100">×</button>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <span className="text-xs text-stone-500">Status</span>
              <select value={detail.status} onChange={(e) => changeStatus(detail.id, e.target.value)} className={`rounded-lg border px-2 py-1 text-xs font-medium capitalize ${STATUS_STYLE[detail.status]}`}>
                {STATUS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              <button
                onClick={() => downloadApplication(detail)}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-[#063f3b] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#052f2c]"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14"/></svg>
                Download
              </button>
            </div>

            {dupInfo.map.has(detail.id) && (
              <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50 p-3">
                <p className="text-xs font-semibold text-orange-800">
                  ⚑ This person applied {dupInfo.map.get(detail.id)!.count} times
                </p>
                <p className="mt-0.5 text-[11px] text-orange-700">Matched by email/phone. Other applications:</p>
                <div className="mt-2 space-y-1">
                  {dupInfo.map.get(detail.id)!.others.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => setDetail(o)}
                      className="flex w-full items-center justify-between rounded-lg border border-orange-200 bg-white px-2.5 py-1.5 text-left text-xs hover:border-orange-400"
                    >
                      <span className="truncate text-stone-700">
                        {o.position_applied || "—"} <span className="text-stone-400">· {o.created_at ? new Date(o.created_at).toLocaleDateString("en-GB") : "—"}</span>
                      </span>
                      <span className={`ml-2 shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize ${STATUS_STYLE[o.status]}`}>{o.status}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-400">Documents</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {detail.documents?.length ? detail.documents.map((d, i) => {
                  const url = d.web_view_link ?? d.file_id;
                  return (
                    <button
                      key={i}
                      onClick={() => { setZoom(1); setViewer({ url, label: d.label }); }}
                      className="group inline-flex items-center gap-1.5 rounded-lg border border-stone-200 px-3 py-1.5 text-xs text-stone-700 hover:border-stone-400"
                      title="Click to view"
                    >
                      {d.label}
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-stone-400 group-hover:text-stone-700"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
                    </button>
                  );
                }) : <span className="text-xs text-stone-400">No documents</span>}
              </div>
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Field label="Email" value={detail.email} />
              <Field label="Phone" value={detail.phone} />
              <Field label="Date of birth" value={detail.date_of_birth} />
              <Field label="Experience" value={detail.experience_years ? `${detail.experience_years} yrs` : null} />
              <Field label="Salary expectation" value={detail.salary_expectation ? `AED ${detail.salary_expectation}` : null} />
              <Field label="Current position" value={detail.current_position} />
              <Field label="Address" value={detail.current_address} />
              <Field label="Applied" value={detail.created_at ? new Date(detail.created_at).toLocaleDateString("en-GB") : null} />
            </dl>

            {Object.keys(detail.data || {}).filter((k) => !["source", "source_id"].includes(k)).length > 0 && (
              <div className="mt-5 space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-400">Application details</h3>
                {Object.entries(detail.data).filter(([k, v]) => !["source", "source_id"].includes(k) && v).map(([k, v]) => (
                  <div key={k}>
                    <p className="text-xs font-medium capitalize text-stone-500">{k.replace(/_/g, " ")}</p>
                    <p className="whitespace-pre-wrap text-sm text-stone-700">{String(v)}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-6 border-t border-stone-100 pt-4">
              <button onClick={() => setPendingDelete(detail)} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">Delete application</button>
            </div>
          </div>
        </div>
      )}

      {/* Document / photo viewer lightbox */}
      {viewer && (() => {
        const isPdf = /\.pdf(\?|$)/i.test(viewer.url) || /\.docx?(\?|$)/i.test(viewer.url);
        const isImg = !isPdf; // default everything else to the zoomable image viewer
        return (
          <div className="fixed inset-0 z-[95] flex flex-col bg-stone-950/90" onClick={() => setViewer(null)}>
            <div className="flex items-center justify-between gap-3 px-4 py-3 text-white" onClick={(e) => e.stopPropagation()}>
              <span className="text-sm font-medium">{viewer.label}</span>
              <div className="flex items-center gap-2">
                {isImg && (
                  <>
                    <button onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} className="grid size-8 place-items-center rounded-lg bg-white/10 hover:bg-white/20">−</button>
                    <span className="w-10 text-center text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
                    <button onClick={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))} className="grid size-8 place-items-center rounded-lg bg-white/10 hover:bg-white/20">+</button>
                  </>
                )}
                <a href={viewer.url} target="_blank" rel="noreferrer" className="rounded-lg bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20">Download</a>
                <button onClick={() => setViewer(null)} className="grid size-8 place-items-center rounded-lg bg-white/10 hover:bg-white/20">×</button>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4" onClick={(e) => e.stopPropagation()}>
              {isPdf ? (
                <iframe src={viewer.url} className="h-full w-full rounded-lg bg-white" title={viewer.label} />
              ) : isImg ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={viewer.url} alt={viewer.label} style={{ transform: `scale(${zoom})` }} className="max-h-full max-w-full origin-center rounded-lg object-contain transition-transform" />
              ) : (
                <div className="rounded-lg bg-white p-8 text-center text-sm text-stone-600">
                  Preview not available. <a href={viewer.url} target="_blank" rel="noreferrer" className="text-[#063f3b] underline">Open file</a>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {pendingDelete && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-stone-950/40 p-4" onClick={() => setPendingDelete(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-semibold text-stone-900">Delete application</h2>
            <p className="mt-1 text-sm text-stone-500">Permanently delete <span className="font-medium">{pendingDelete.full_name}</span>? This cannot be undone.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setPendingDelete(null)} className="h-9 rounded-lg border border-stone-300 px-3 text-sm">Cancel</button>
              <button onClick={() => doDelete(pendingDelete.id)} className="h-9 rounded-lg bg-red-600 px-3 text-sm font-medium text-white">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs text-stone-400">{label}</dt>
      <dd className="text-stone-800">{value}</dd>
    </div>
  );
}

// Compact donut + full scrollable legend. Clicking a segment or legend row filters.
// Shows EVERY nationality (no "Other" grouping).
const DONUT_PALETTE = [
  "#1c1917", "#78716c", "#a8a29e", "#44403c", "#57534e", "#d6d3d1",
  "#0f766e", "#0891b2", "#2563eb", "#7c3aed", "#c026d3", "#db2777",
  "#dc2626", "#ea580c", "#d97706", "#ca8a04", "#65a30d", "#16a34a",
  "#059669", "#0d9488", "#0284c7", "#4f46e5", "#9333ea", "#be123c",
];

function colorAt(i: number) {
  return DONUT_PALETTE[i % DONUT_PALETTE.length];
}

function NationalityDonut({
  data,
  active,
  onPick,
}: {
  data: { name: string; count: number }[];
  active: string;
  onPick: (name: string) => void;
}) {
  const total = data.reduce((s, d) => s + d.count, 0) || 1;
  const r = 15.915; // circumference ≈ 100 for easy percentages
  let offset = 25; // start at top (12 o'clock)

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-stone-200 bg-white px-4 py-3">
      {/* Donut — every nationality is a segment */}
      <div className="relative shrink-0">
        <svg viewBox="0 0 36 36" className="size-24 -rotate-90">
          <circle cx="18" cy="18" r={r} fill="none" stroke="#f5f5f4" strokeWidth="4" />
          {data.map((seg, i) => {
            const pct = (seg.count / total) * 100;
            const dash = `${pct} ${100 - pct}`;
            const el = (
              <circle
                key={seg.name}
                cx="18" cy="18" r={r} fill="none"
                stroke={seg.name === active ? "#063f3b" : colorAt(i)}
                strokeWidth={seg.name === active ? 5 : 4}
                strokeDasharray={dash}
                strokeDashoffset={-offset}
                className="cursor-pointer"
                onClick={() => onPick(seg.name)}
              >
                <title>{`${seg.name}: ${seg.count}`}</title>
              </circle>
            );
            offset += pct;
            return el;
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-sm font-semibold text-stone-900">{total}</span>
          <span className="text-[9px] uppercase tracking-wide text-stone-400">total</span>
        </div>
      </div>

      {/* Legend — ALL nationalities, scrollable */}
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-xs font-semibold text-stone-900">By Nationality <span className="text-stone-400">({data.length})</span></h2>
          {active !== "all" && (
            <button onClick={() => onPick(active)} className="text-[11px] text-stone-500 hover:underline">× clear</button>
          )}
        </div>
        <div className="grid max-h-24 grid-cols-2 gap-x-4 gap-y-0.5 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4">
          {data.map((seg, i) => (
            <button
              key={seg.name}
              onClick={() => onPick(seg.name)}
              className={`flex items-center gap-1.5 text-left text-[11px] ${
                seg.name === active ? "font-semibold text-stone-900" : "text-stone-600 hover:text-stone-900"
              }`}
            >
              <span className="size-2 shrink-0 rounded-sm" style={{ backgroundColor: seg.name === active ? "#063f3b" : colorAt(i) }} />
              <span className="truncate">{flagFor(seg.name)} {seg.name}</span>
              <span className="ml-auto shrink-0 tabular-nums text-stone-400">{seg.count}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
