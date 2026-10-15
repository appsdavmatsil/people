"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import type { HiringSubmission } from "@/lib/hiring-records";
import type { ConfigTextField } from "@/lib/form-config";
import { positionRank } from "@/lib/position-rank";
import { continentFor, continents, flagFor, normalizeNationality } from "@/lib/hiring-nationality";
import { HIRING_STATUSES, HIRING_STATUS_ACTIVE_STYLE, HIRING_STATUS_LABEL, HIRING_STATUS_MENU_STYLE, HIRING_STATUS_STYLE, normalizeHiringStatus, type HiringStatus } from "@/lib/hiring-status";
import { updateHiringStatusAction, deleteHiringSubmissionAction } from "@/app/(app)/hiringform/actions";
import { updateHiringStatusSharedAction } from "@/app/hiring-team/[token]/actions";

const STATUS_OPTIONS = HIRING_STATUSES;
const DECISION_OPTIONS = HIRING_STATUSES.filter((status) => status !== "new");
type ViewMode = "grid" | "list";

const STATUS_STYLE = HIRING_STATUS_STYLE;

function photoOf(s: HiringSubmission): string | null {
  const d = s.documents?.find((d) => /photo/i.test(d.label));
  return d?.web_view_link ?? d?.file_id ?? null;
}

export function HiringResponses({
  submissions,
  fields,
  shareToken,
}: {
  submissions: HiringSubmission[];
  fields: ConfigTextField[];
  /** Set when opened from the team link: status changes go through the link, and deleting is hidden. */
  shareToken?: string;
}) {
  const pages = useMemo(() => detailPages(fields), [fields]);
  const [records, setRecords] = useState(() => submissions.map((s) => ({ ...s, status: normalizeHiringStatus(s.status) })));
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("new");
  const [nationalityFilter, setNationalityFilter] = useState<string>("all");
  const [positionFilter, setPositionFilter] = useState<string>("all");
  const [view, setView] = useState<ViewMode>("grid");
  const [cardSize, setCardSize] = useState(2);
  const [dupsOnly, setDupsOnly] = useState(false);
  const [ageRange, setAgeRange] = useState<[number, number] | null>(null);
  const [experienceFilter, setExperienceFilter] = useState("all");
  const [salaryFilter, setSalaryFilter] = useState("all");
  const [visaFilter, setVisaFilter] = useState("all");
  const [detail, setDetail] = useState<HiringSubmission | null>(null);
  const [pendingDelete, setPendingDelete] = useState<HiringSubmission | null>(null);
  const [viewer, setViewer] = useState<{ url: string; label: string } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [menu, setMenu] = useState<{ ids: string[]; x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const lastPicked = useRef<string | null>(null);
  const matchesExtra = useCallback(
    (r: HiringSubmission) =>
      withinAge(ageRange, ageOf(r.date_of_birth)) &&
      inRange(EXPERIENCE_RANGES, experienceFilter, experienceOf(r.experience_years)) &&
      inRange(SALARY_RANGES, salaryFilter, numberOf(r.salary_expectation)) &&
      (visaFilter === "all" || visaOf(r) === visaFilter),
    [ageRange, experienceFilter, salaryFilter, visaFilter],
  );
  const ageBounds = useMemo<[number, number]>(() => {
    const ages = records.map((r) => ageOf(r.date_of_birth)).filter((age): age is number => age !== null && age >= 14 && age <= 80);
    return ages.length ? [Math.min(...ages), Math.max(...ages)] : [18, 60];
  }, [records]);
  const visaOptions = useMemo(
    () => Array.from(new Set(records.map(visaOf).filter(Boolean))).sort() as string[],
    [records],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: records.length, ...Object.fromEntries(HIRING_STATUSES.map((status) => [status, 0])) };
    for (const r of records) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [records]);

  const searchIndex = useMemo(() => new Map(records.map((r) => [r.id, searchTextOf(r)])), [records]);

  // Base slice for the nationality graph: respects status/position/search but
  // not the nationality filter itself (faceted behaviour).
  const natBase = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((r) => {
      const matchStatus = statusFilter === "all" || r.status === statusFilter;
      const matchPos = positionFilter === "all" || r.position_applied === positionFilter;
      const matchSearch =
        q === "" || matchesSearch(searchIndex.get(r.id) ?? "", q);
      return matchStatus && matchPos && matchSearch && matchesExtra(r);
    });
  }, [records, searchIndex, search, statusFilter, positionFilter, matchesExtra]);

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

  const posCounts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const m = new Map<string, number>();
    for (const r of records) {
      if (statusFilter !== "all" && r.status !== statusFilter) continue;
      if (nationalityFilter !== "all" && normalizeNationality(r.nationality) !== nationalityFilter) continue;
      if (q !== "" && !matchesSearch(searchIndex.get(r.id) ?? "", q)) continue;
      if (!matchesExtra(r)) continue;
      const position = r.position_applied?.trim() || "Not specified";
      m.set(position, (m.get(position) ?? 0) + 1);
    }
    return Array.from(m.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => positionRank(a.name) - positionRank(b.name) || b.count - a.count || a.name.localeCompare(b.name));
  }, [records, searchIndex, search, statusFilter, nationalityFilter, matchesExtra]);

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((r) => {
      const matchStatus = statusFilter === "all" || r.status === statusFilter;
      const matchNat = nationalityFilter === "all" || normalizeNationality(r.nationality) === nationalityFilter;
      const matchPos = positionFilter === "all" || r.position_applied === positionFilter;
      const matchSearch =
        q === "" || matchesSearch(searchIndex.get(r.id) ?? "", q);
      const matchDup = !dupsOnly || dupInfo.map.has(r.id);
      return matchStatus && matchNat && matchPos && matchSearch && matchDup && matchesExtra(r);
    });
  }, [records, searchIndex, search, statusFilter, nationalityFilter, positionFilter, dupsOnly, dupInfo, matchesExtra]);

  async function changeStatus(ids: string | string[], status: string) {
    const targets = new Set(Array.isArray(ids) ? ids : [ids]);
    const previous = new Map(records.filter((r) => targets.has(r.id)).map((r) => [r.id, r.status]));
    setRecords((prev) => prev.map((r) => (targets.has(r.id) ? { ...r, status: status as HiringStatus } : r)));
    setDetail((current) => (current && targets.has(current.id) ? { ...current, status: status as HiringStatus } : current));
    const result = shareToken
      ? await updateHiringStatusSharedAction(shareToken, [...targets], status)
      : await updateHiringStatusAction([...targets], status);
    if (!result.ok) {
      setRecords((prev) => prev.map((r) => (previous.has(r.id) ? { ...r, status: previous.get(r.id)! } : r)));
      setDetail((current) => (current && previous.has(current.id) ? { ...current, status: previous.get(current.id)! } : current));
      window.alert(result.error ?? "Could not update the status.");
    }
  }

  const visibleSelected = filtered.filter((r) => selected.has(r.id)).map((r) => r.id);

  const hasSelection = selected.size > 0;
  const overlayOpen = Boolean(menu || detail || viewer || pendingDelete);
  useEffect(() => {
    if (!hasSelection || overlayOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true]")) return;
      setSelected(new Set());
      lastPicked.current = null;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasSelection, overlayOpen]);

  function toggleSelect(id: string, range: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      const from = range && lastPicked.current ? filtered.findIndex((r) => r.id === lastPicked.current) : -1;
      const to = filtered.findIndex((r) => r.id === id);
      if (from >= 0 && to >= 0) {
        for (const r of filtered.slice(Math.min(from, to), Math.max(from, to) + 1)) next.add(r.id);
      } else if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    lastPicked.current = id;
  }

  function openCard(event: MouseEvent, s: HiringSubmission) {
    if (event.metaKey || event.ctrlKey || event.shiftKey) {
      event.preventDefault();
      toggleSelect(s.id, event.shiftKey);
    } else {
      setDetail(s);
    }
  }

  function openMenu(event: MouseEvent, id: string) {
    event.preventDefault();
    const ids = selected.has(id) ? visibleSelected : [id];
    setMenu({ ids, x: event.clientX, y: event.clientY });
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
      ${dataRows.length ? `<h2>Application</h2>${dataRows.map(([k, v]) => `<div class="q"><div class="ql">${esc(fieldTitle(k))}</div><div class="qa">${esc(v)}</div></div>`).join("")}` : ""}
      <script>window.onload=function(){setTimeout(function(){window.print()},400)}</script>
      </body></html>`;

    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
    // Also open the CV file so it can be saved alongside.
    const cv = (s.documents || []).find((d) => /cv|resume/i.test(d.label));
    if (cv) window.open(cv.web_view_link ?? cv.file_id, "_blank");
  }

  const activeFilters = [statusFilter !== "new", nationalityFilter !== "all", positionFilter !== "all", search !== "", ageRange !== null, experienceFilter !== "all", salaryFilter !== "all", visaFilter !== "all"].filter(Boolean).length;
  const clearAll = () => { setSearch(""); setStatusFilter("new"); setNationalityFilter("all"); setPositionFilter("all"); setAgeRange(null); setExperienceFilter("all"); setSalaryFilter("all"); setVisaFilter("all"); };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {menu ? (
        <StatusMenu
          x={menu.x}
          y={menu.y}
          current={(() => {
            const statuses = new Set(records.filter((r) => menu.ids.includes(r.id)).map((r) => r.status));
            return statuses.size === 1 ? [...statuses][0] : null;
          })()}
          name={menu.ids.length > 1 ? `${menu.ids.length} candidates selected` : records.find((r) => r.id === menu.ids[0])?.full_name ?? ""}
          onPick={(status) => { void changeStatus(menu.ids, status); setMenu(null); }}
          onClose={() => setMenu(null)}
        />
      ) : null}
      {/* Status pills */}
      <div className="flex flex-wrap items-center gap-2">
        {(["all", ...STATUS_OPTIONS] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              s === "all"
                ? statusFilter === s ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-400"
                : statusFilter === s ? HIRING_STATUS_ACTIVE_STYLE[s] : `${STATUS_STYLE[s]} hover:brightness-95`
            }`}
          >
            {s === "all" ? "All" : HIRING_STATUS_LABEL[s]} <span className="opacity-60">({counts[s] ?? 0})</span>
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
            ⚑ Duplicated <span className="opacity-70">({dupInfo.map.size})</span>
          </button>
        )}
      </div>

      {/* Breakdown — position first, then nationality */}
      {(posCounts.length > 0 || natCounts.length > 0) && (
        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <PositionBreakdown
            data={posCounts}
            active={positionFilter}
            onPick={(name) => setPositionFilter(positionFilter === name || name === "Not specified" ? "all" : name)}
          />
          <NationalityByContinent
            data={natCounts}
            active={nationalityFilter}
            onPick={(name) => setNationalityFilter(nationalityFilter === name ? "all" : name)}
          />
        </div>
      )}

      {/* Search + view toggle + filters */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") setSearch(""); }}
            placeholder="Search any field — name, phone, languages, experience…"
            className="h-9 w-full rounded-lg border border-stone-200 bg-white pr-8 pl-3 text-sm outline-none focus:border-stone-400"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded-md text-base leading-none text-stone-400 hover:bg-stone-100 hover:text-stone-900"
            >
              ×
            </button>
          ) : null}
        </div>

        <AgeRangeSlider bounds={ageBounds} value={ageRange} onChange={setAgeRange} />
        <FilterSelect label="Experience" value={experienceFilter} onChange={setExperienceFilter} options={EXPERIENCE_RANGES.map((r) => r.label)} />
        <FilterSelect label="Salary" value={salaryFilter} onChange={setSalaryFilter} options={SALARY_RANGES.map((r) => r.label)} width="w-48" />
        <FilterSelect label="UAE visa" value={visaFilter} onChange={setVisaFilter} options={visaOptions} width="w-56" />

        <div className="ml-auto flex items-center gap-2">
          <div className={`flex items-center gap-0.5 rounded-lg border border-stone-200 bg-white p-0.5 ${view === "grid" ? "" : "pointer-events-none opacity-40"}`}>
            <button onClick={() => setCardSize((size) => Math.max(0, size - 1))} disabled={cardSize === 0} className="grid size-8 place-items-center rounded-md text-stone-500 hover:bg-stone-100 disabled:opacity-30 disabled:hover:bg-transparent" aria-label="Smaller thumbnails" title="Smaller thumbnails">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M8 11h6"/></svg>
            </button>
            <button onClick={() => setCardSize((size) => Math.min(GRID_SIZES.length - 1, size + 1))} disabled={cardSize === GRID_SIZES.length - 1} className="grid size-8 place-items-center rounded-md text-stone-500 hover:bg-stone-100 disabled:opacity-30 disabled:hover:bg-transparent" aria-label="Bigger thumbnails" title="Bigger thumbnails">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M8 11h6M11 8v6"/></svg>
            </button>
          </div>
          <div className="flex items-center gap-0.5 rounded-lg border border-stone-200 bg-white p-0.5">
            <button onClick={() => setView("grid")} className={`grid size-8 place-items-center rounded-md ${view === "grid" ? "bg-stone-900 text-white" : "text-stone-500 hover:bg-stone-100"}`} aria-label="Grid">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            </button>
            <button onClick={() => setView("list")} className={`grid size-8 place-items-center rounded-md ${view === "list" ? "bg-stone-900 text-white" : "text-stone-500 hover:bg-stone-100"}`} aria-label="List">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
            </button>
          </div>
        </div>

      </div>

      <div className="mt-2 flex h-5 items-center gap-3 text-xs text-stone-500">
        <p>{filtered.length} of {records.length} applications</p>
        {visibleSelected.length > 0 && (
          <span className="inline-flex items-center gap-2 rounded-full bg-stone-900 py-0.5 pr-1.5 pl-2.5 font-medium text-white">
            {visibleSelected.length} selected · right-click to set status
            <button onClick={() => setSelected(new Set())} aria-label="Clear selection" className="text-white/70 hover:text-white">×</button>
          </span>
        )}
        {activeFilters > 0 && (
          <button onClick={clearAll} className="font-medium text-stone-600 hover:text-stone-950 hover:underline">× Clear filters</button>
        )}
      </div>

      {/* Results */}
      {view === "grid" ? (
        <div className={`mt-3 grid min-h-0 flex-1 auto-rows-max content-start items-start gap-3 overflow-y-auto pb-4 ${GRID_SIZES[cardSize]}`}>
          {filtered.map((s) => {
            const photo = photoOf(s);
            return (
              <button key={s.id} onClick={(event) => openCard(event, s)} onContextMenu={(event) => openMenu(event, s.id)} className={`group relative flex flex-col overflow-hidden rounded-xl border bg-white text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${selected.has(s.id) ? "border-red-600" : "border-stone-200"}`}>
                <div
                  className={`relative aspect-square w-full shrink-0 overflow-hidden bg-stone-100 ${photo ? "cursor-zoom-in" : ""}`}
                  title={photo ? "View photo" : undefined}
                  onClick={(event) => {
                    if (!photo || event.metaKey || event.ctrlKey || event.shiftKey) return;
                    event.stopPropagation();
                    setZoom(1);
                    setViewer({ url: photo, label: `${s.full_name} – Profile Photo` });
                  }}
                >
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo} alt={s.full_name} loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-stone-300"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg></div>
                  )}
                  <span className={`absolute left-1.5 top-1.5 rounded-full border px-1.5 py-0.5 text-[9px] font-medium ${STATUS_STYLE[s.status]}`}>{HIRING_STATUS_LABEL[s.status]}</span>
                  <span
                    role="checkbox"
                    aria-checked={selected.has(s.id)}
                    aria-label={`Select ${s.full_name}`}
                    title="Select (or ⌘/Ctrl-click, Shift-click for a range)"
                    onClick={(event) => { event.stopPropagation(); toggleSelect(s.id, event.shiftKey); }}
                    className={`absolute bottom-1.5 left-1.5 grid size-5 cursor-pointer place-items-center rounded-full border-2 text-[10px] font-bold transition ${
                      selected.has(s.id) ? "border-white bg-red-600 text-white" : `border-white bg-black/30 text-transparent hover:bg-black/50 ${visibleSelected.length ? "" : "opacity-0 group-hover:opacity-100"}`
                    }`}
                  >
                    ✓
                  </span>
                  {dupInfo.map.has(s.id) && (
                    <span className="absolute right-1.5 top-1.5 rounded-full border border-orange-300 bg-orange-500/90 px-1.5 py-0.5 text-[9px] font-semibold text-white" title={`Applied ${dupInfo.map.get(s.id)!.count} times`}>
                      ⚑ ×{dupInfo.map.get(s.id)!.count}
                    </span>
                  )}
                </div>
                <div className="space-y-0.5 px-2 py-1.5">
                  <p className="truncate text-xs font-semibold text-stone-950">{s.full_name}</p>
                  <p className="truncate text-[11px] text-stone-700">{s.position_applied || "—"}</p>
                  <p className="flex items-center gap-1 truncate text-[11px] text-stone-400">{ageOf(s.date_of_birth) !== null && <span className="shrink-0 rounded-full bg-stone-100 px-1.5 text-[10px] font-medium tabular-nums text-stone-700">{ageOf(s.date_of_birth)} y/o</span>}<span>{flagFor(s.nationality)}</span><span className="truncate">{s.nationality || "Unknown"}</span></p>
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
                {selected.has(s.id) && <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 rounded-[inherit] ring-2 ring-red-600 ring-inset" />}
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
              <button key={s.id} onClick={(event) => openCard(event, s)} onContextMenu={(event) => openMenu(event, s.id)} className={`relative flex w-full items-center gap-3 rounded-xl border bg-white px-4 py-2.5 text-left ${selected.has(s.id) ? "border-red-600" : "border-stone-200 hover:border-stone-400"}`}>
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
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLE[s.status]}`}>{HIRING_STATUS_LABEL[s.status]}</span>
                {selected.has(s.id) && <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[inherit] ring-2 ring-red-600 ring-inset" />}
              </button>
            );
          })}
          {filtered.length === 0 && <p className="py-16 text-center text-sm text-stone-400">No applications match.</p>}
        </div>
      )}

      {/* Detail drawer */}
      {detail && (
        <div className="fixed inset-0 z-[80] flex justify-end bg-stone-950/40" onClick={() => setDetail(null)}>
          <div className="h-full w-full max-w-2xl overflow-y-auto bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-stone-200 bg-stone-100 p-6">
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
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-stone-400">
                    <span>{flagFor(detail.nationality)}</span>{detail.nationality}
                    {detail.created_at && <span className="ml-1">· Applied {new Date(detail.created_at).toLocaleDateString("en-GB")}</span>}
                  </p>
                </div>
              </div>
              <button onClick={() => setDetail(null)} className="grid size-8 place-items-center rounded-lg text-stone-500 hover:bg-white">×</button>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <span className="text-xs text-stone-500">Status</span>
              <select value={detail.status} onChange={(e) => changeStatus(detail.id, e.target.value)} className={`rounded-lg border px-2 py-1 text-xs font-medium ${STATUS_STYLE[detail.status]}`}>
                {STATUS_OPTIONS.map((o) => <option key={o} value={o}>{HIRING_STATUS_LABEL[o]}</option>)}
              </select>
              <button
                onClick={() => downloadApplication(detail)}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-[#063f3b] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#052f2c]"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14"/></svg>
                Download
              </button>
            </div>

            {pages[0] && (
              <div className="mt-5 space-y-4 border-t border-stone-200 pt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">{pages[0].title}</h3>
                {pages[0].sections.map((section, index) => (
                  <AnswerSection
                    key={section.title + index}
                    section={{ ...section, fields: section.fields.filter((f) => f.name !== "fullName") }}
                    submission={detail}
                    showTitle={section.title !== pages[0].title}
                  />
                ))}
              </div>
            )}
            </div>

            <div className="p-6 pt-1">

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
                      <span className={`ml-2 shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLE[o.status]}`}>{HIRING_STATUS_LABEL[o.status]}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {pages.slice(1).map((page, pageIndex) => (
              <div key={page.title + pageIndex} className="mt-5 space-y-4 border-t border-stone-200 pt-5 first:border-t-0">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[#063f3b]">{page.title}</h3>
                {page.sections.map((section, index) => (
                  <AnswerSection key={section.title + index} section={section} submission={detail} showTitle={section.title !== page.title} />
                ))}
              </div>
            ))}

            <div className="mt-5 border-t border-stone-200 pt-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[#063f3b]">Documents</h3>
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

            {otherAnswers(detail, fields).length > 0 && (
              <div className="mt-5 space-y-3 border-t border-stone-200 pt-5">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-400">Other answers</h3>
                {otherAnswers(detail, fields).map(([k, v]) => (
                  <div key={k}>
                    <p className="text-xs font-medium capitalize text-stone-500">{fieldTitle(k)}</p>
                    <p className="whitespace-pre-wrap text-sm text-stone-700">{String(v)}</p>
                  </div>
                ))}
              </div>
            )}

            {!shareToken && (
              <div className="mt-6 border-t border-stone-100 pt-4">
                <button onClick={() => setPendingDelete(detail)} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">Delete application</button>
              </div>
            )}
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
            <div className="flex items-center justify-between gap-3 px-4 py-3 text-white" onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) setViewer(null); }}>
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
            <div className="flex min-h-0 flex-1 cursor-zoom-out items-center justify-center overflow-auto p-4" onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) setViewer(null); }}>
              {isPdf ? (
                <iframe src={viewer.url} className="h-full w-full rounded-lg bg-white" title={viewer.label} />
              ) : isImg ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={viewer.url} alt={viewer.label} onClick={(e) => e.stopPropagation()} style={{ transform: `scale(${zoom})` }} className="max-h-full max-w-full origin-center cursor-default rounded-lg object-contain transition-transform" />
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

// Compact donut + full scrollable legend. Clicking a segment or legend row filters.
// Shows EVERY nationality (no "Other" grouping).
type Range = { label: string; min: number; max: number };
const EXPERIENCE_RANGES: Range[] = [
  { label: "0–2 yrs", min: 0, max: 2 },
  { label: "3–5 yrs", min: 3, max: 5 },
  { label: "6–9 yrs", min: 6, max: 9 },
  { label: "10+ yrs", min: 10, max: 60 },
];
const SALARY_RANGES: Range[] = [
  { label: "Under AED 3,000", min: 0, max: 2999 },
  { label: "AED 3,000–4,999", min: 3000, max: 4999 },
  { label: "AED 5,000–7,999", min: 5000, max: 7999 },
  { label: "AED 8,000+", min: 8000, max: Number.POSITIVE_INFINITY },
];

function inRange(ranges: Range[], selected: string, value: number | null) {
  if (selected === "all") return true;
  const range = ranges.find((r) => r.label === selected);
  return !!range && value !== null && value >= range.min && value <= range.max;
}

function withinAge(range: [number, number] | null, age: number | null) {
  return !range || (age !== null && age >= range[0] && age <= range[1]);
}

function numberOf(raw: string | null) {
  const value = Number((raw ?? "").replace(/[^\d.]/g, ""));
  return raw && Number.isFinite(value) && value > 0 ? value : null;
}

function experienceOf(raw: string | null) {
  const value = Number((raw ?? "").trim());
  return raw && Number.isFinite(value) && value <= 60 ? value : null;
}

function ageOf(dob: string | null) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dob ?? "");
  if (!match) return null;
  const today = new Date();
  let age = today.getFullYear() - Number(match[1]);
  if (today.getMonth() + 1 < Number(match[2]) || (today.getMonth() + 1 === Number(match[2]) && today.getDate() < Number(match[3]))) age -= 1;
  return age;
}

function visaOf(r: HiringSubmission) {
  const value = r.data?.uae_eligibility ?? r.data?.uaeEligibility;
  return typeof value === "string" ? value.trim() : "";
}

const GRID_SIZES = [
  "grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10",
  "grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8",
  "grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6",
  "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
  "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
];

function StatusMenu({ x, y, current, name, onPick, onClose }: { x: number; y: number; current: HiringStatus | null; name: string; onPick: (status: HiringStatus) => void; onClose: () => void }) {
  const width = 200;
  const height = 44 + DECISION_OPTIONS.length * 34;
  const left = Math.min(x, window.innerWidth - width - 8);
  const top = Math.min(y, window.innerHeight - height - 8);
  return (
    <div
      className="fixed inset-0 z-[95]"
      onClick={onClose}
      onContextMenu={(event) => { event.preventDefault(); onClose(); }}
      onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}
      onWheel={onClose}
    >
      <div
        role="menu"
        aria-label={`Set status for ${name}`}
        className="absolute space-y-0.5 overflow-hidden rounded-xl border border-stone-200 bg-white p-1 shadow-xl"
        style={{ left, top, width }}
        onClick={(event) => event.stopPropagation()}
      >
        <p className="truncate px-2 pt-1 pb-1 text-[11px] font-medium text-stone-400">{name}</p>
        {DECISION_OPTIONS.map((status, index) => (
          <button
            key={status}
            type="button"
            role="menuitemradio"
            aria-checked={current === status}
            autoFocus={index === 0}
            onClick={() => onPick(status)}
            className={`flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm font-medium outline-none ${HIRING_STATUS_MENU_STYLE[status].row}`}
          >
            <span className={`size-2.5 shrink-0 rounded-full ${HIRING_STATUS_MENU_STYLE[status].dot}`} />
            <span className="flex-1">{HIRING_STATUS_LABEL[status]}</span>
            {current === status ? <span aria-hidden="true">✓</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

function AgeRangeSlider({ bounds, value, onChange }: { bounds: [number, number]; value: [number, number] | null; onChange: (value: [number, number] | null) => void }) {
  const [min, max] = bounds;
  const [low, high] = value ?? bounds;
  const span = Math.max(1, max - min);
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<0 | 1 | null>(null);
  const set = (next: [number, number]) => onChange(next[0] <= min && next[1] >= max ? null : next);
  const valueAt = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return min;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Math.round(min + ratio * span);
  };
  const move = (handle: 0 | 1, next: number) => {
    if (handle === 0) set([Math.min(next, high), high]);
    else set([low, Math.max(next, low)]);
  };
  const percent = (age: number) => ((age - min) / span) * 100;

  return (
    <div className={`flex h-9 items-center gap-3 rounded-lg border bg-white px-3 text-xs ${value ? "border-stone-900" : "border-stone-200"}`}>
      <span className="shrink-0 text-stone-600">Age</span>
      <div
        ref={trackRef}
        className="relative h-4 w-32 cursor-pointer touch-none select-none"
        onPointerDown={(event) => {
          const next = valueAt(event.clientX);
          const handle: 0 | 1 = Math.abs(next - low) <= Math.abs(next - high) && !(next > high) ? 0 : 1;
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragging(handle);
          move(handle, next);
        }}
        onPointerMove={(event) => {
          if (dragging !== null) move(dragging, valueAt(event.clientX));
        }}
        onPointerUp={() => setDragging(null)}
        onPointerCancel={() => setDragging(null)}
      >
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-stone-200" />
        <div className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-stone-900" style={{ left: `${percent(low)}%`, right: `${100 - percent(high)}%` }} />
        {([low, high] as const).map((age, handle) => (
          <span
            key={handle}
            role="slider"
            tabIndex={0}
            aria-label={handle === 0 ? "Minimum age" : "Maximum age"}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={age}
            onKeyDown={(event) => {
              const step = event.key === "ArrowLeft" || event.key === "ArrowDown" ? -1 : event.key === "ArrowRight" || event.key === "ArrowUp" ? 1 : 0;
              if (!step) return;
              event.preventDefault();
              move(handle as 0 | 1, Math.min(max, Math.max(min, age + step)));
            }}
            className={`absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-stone-900 shadow outline-none focus-visible:ring-2 focus-visible:ring-stone-400 ${dragging === handle ? "scale-110" : ""}`}
            style={{ left: `${percent(age)}%`, zIndex: dragging === handle ? 2 : 1 }}
          />
        ))}
      </div>
      <span className="w-12 shrink-0 text-right font-medium tabular-nums text-stone-900">{low}–{high}</span>
      <button
        type="button"
        onClick={() => onChange(null)}
        className={`w-3 shrink-0 text-stone-400 hover:text-stone-900 ${value ? "" : "invisible"}`}
        aria-label="Reset age range"
        tabIndex={value ? 0 : -1}
      >
        ×
      </button>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options, width = "w-40" }: { label: string; value: string; onChange: (value: string) => void; options: string[]; width?: string }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className={`h-9 ${width} shrink-0 truncate rounded-lg border px-2 text-xs outline-none ${value !== "all" ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-400"}`}
    >
      <option value="all">{label}: All</option>
      {options.map((option) => (
        <option key={option} value={option}>{label}: {option}</option>
      ))}
    </select>
  );
}

function collectText(value: unknown, out: string[]) {
  if (value === null || value === undefined) return;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    out.push(String(value));
  } else if (Array.isArray(value)) {
    for (const item of value) collectText(item, out);
  } else if (typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (key !== "file_id" && key !== "web_view_link") collectText(item, out);
    }
  }
}

function searchTextOf(r: HiringSubmission) {
  const parts: string[] = [];
  const { id: _id, documents, data, ...fields } = r;
  void _id;
  collectText(fields, parts);
  collectText(data, parts);
  collectText(documents?.map((doc) => [doc.label, doc.file_name]), parts);
  parts.push(normalizeNationality(r.nationality), continentFor(normalizeNationality(r.nationality)), (r.phone ?? "").replace(/\D/g, ""));
  if (r.created_at) parts.push(new Date(r.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }));
  return parts.join(" ").toLowerCase();
}

function matchesSearch(text: string, query: string) {
  return query.split(/\s+/).every((term) => text.includes(term));
}

function PositionBreakdown({
  data,
  active,
  onPick,
}: {
  data: { name: string; count: number }[];
  active: string;
  onPick: (name: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-100 px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold text-stone-900">
          By Position
        </h2>
      </div>
      <div className="grid max-h-[7.5rem] grid-cols-1 gap-x-6 gap-y-0.5 overflow-x-hidden overflow-y-auto pr-1 sm:grid-cols-2">
        {data.map((seg) => (
          <button
            key={seg.name}
            onClick={() => onPick(seg.name)}
            className={`flex w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 py-px text-left text-[11px] ${
              seg.name === active ? "bg-stone-900 font-semibold text-white" : "text-stone-600 hover:bg-white hover:text-stone-900"
            }`}
          >
            <span className="truncate">{seg.name}</span>
            <span className={`ml-auto shrink-0 tabular-nums ${seg.name === active ? "text-white/70" : "text-stone-400"}`}>{seg.count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function NationalityByContinent({
  data,
  active,
  onPick,
}: {
  data: { name: string; count: number }[];
  active: string;
  onPick: (name: string) => void;
}) {
  const groups = continents
    .map((continent) => {
      const countries = data.filter((seg) => continentFor(seg.name) === continent);
      return { continent, countries, count: countries.reduce((s, d) => s + d.count, 0) };
    })
    .filter((group) => group.countries.length > 0)
    .sort((a, b) => (a.continent === "Other" ? 1 : b.continent === "Other" ? -1 : b.count - a.count));

  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-100 px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold text-stone-900">
          By Nationality
        </h2>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 xl:grid-cols-4">
        {groups.map((group) => (
          <div key={group.continent} className="min-w-0">
            <div className="mb-1 flex items-center justify-between border-b border-stone-200 pb-1 text-[11px] font-semibold text-stone-900">
              <span>{group.continent}</span>
              <span className="tabular-nums text-stone-400">{group.count}</span>
            </div>
            <div className="max-h-24 space-y-0.5 overflow-x-hidden overflow-y-auto pr-1">
              {group.countries.map((seg) => (
                <button
                  key={seg.name}
                  onClick={() => onPick(seg.name)}
                  className={`flex w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 py-px text-left text-[11px] ${
              seg.name === active ? "bg-stone-900 font-semibold text-white" : "text-stone-600 hover:bg-white hover:text-stone-900"
            }`}
                >
                  <span className="truncate">{flagFor(seg.name)} {seg.name}</span>
                  <span className={`ml-auto shrink-0 tabular-nums ${seg.name === active ? "text-white/70" : "text-stone-400"}`}>{seg.count}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function fieldTitle(key: string) {
  return key.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
}

const snakeCase = (key: string) => key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
const HIDDEN_DATA_KEYS = new Set(["source", "source_id"]);

/** Splits the stored "City, Country" address back into its two form fields. */
function addressPart(address: string | null, part: "city" | "country") {
  if (!address) return null;
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  if (part === "country") return parts.length > 1 ? parts.at(-1)! : null;
  return (parts.length > 1 ? parts.slice(0, -1).join(", ") : parts[0]) || null;
}

/** The candidate's answer to one form field, from its column or the extra data. */
function answerOf(s: HiringSubmission, name: string): string | null {
  const column: Record<string, string | null> = {
    fullName: s.full_name,
    email: s.email,
    phone: s.phone,
    dateOfBirth: s.date_of_birth,
    nationality: s.nationality,
    instagram: s.instagram,
    positionApplied: s.position_applied,
    currentPosition: s.current_position,
    experienceYears: s.experience_years ? `${s.experience_years} yrs` : null,
    salaryExpectation: s.salary_expectation ? `AED ${s.salary_expectation}` : null,
    currentAddress: s.current_address,
    currentCity: addressPart(s.current_address, "city"),
    currentCountry: addressPart(s.current_address, "country"),
  };
  if (name in column) return column[name];
  const value = s.data?.[name] ?? s.data?.[snakeCase(name)];
  return value == null || value === "" ? null : String(value);
}

type DetailSection = { title: string; fields: ConfigTextField[] };
type DetailPage = { title: string; sections: DetailSection[] };

/** Groups the form fields into its pages, and each page into its section headings. */
function detailPages(fields: ConfigTextField[]): DetailPage[] {
  const pages: DetailPage[] = [];
  for (const f of fields) {
    if (pages.length === 0 || f.pageBreak) pages.push({ title: f.section || "Details", sections: [] });
    const page = pages.at(-1)!;
    const title = f.section || page.title;
    if (page.sections.at(-1)?.title !== title) page.sections.push({ title, fields: [] });
    page.sections.at(-1)!.fields.push(f);
  }
  return pages;
}

/** Extra answers stored on the application that the current form no longer asks. */
function otherAnswers(s: HiringSubmission, fields: ConfigTextField[]) {
  const known = new Set(fields.flatMap((f) => [f.name, snakeCase(f.name)]));
  return Object.entries(s.data || {}).filter(([k, v]) => !HIDDEN_DATA_KEYS.has(k) && !known.has(k) && v != null && v !== "");
}

function AnswerSection({ section, submission, showTitle }: { section: DetailSection; submission: HiringSubmission; showTitle: boolean }) {
  const short = section.fields.filter((f) => f.type !== "textarea");
  const long = section.fields.filter((f) => f.type === "textarea");
  return (
    <div className="space-y-3">
      {showTitle && <h4 className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">{section.title}</h4>}
      {short.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
          {short.map((f) => (
            <div key={f.name} className="min-w-0">
              <dt className="text-xs text-stone-400">{f.label}</dt>
              <dd className={`break-words ${answerOf(submission, f.name) ? "text-stone-800" : "text-stone-300"}`}>{answerOf(submission, f.name) ?? "—"}</dd>
            </div>
          ))}
        </dl>
      )}
      {long.map((f) => (
        <div key={f.name}>
          <p className="text-xs text-stone-400">{f.label}</p>
          <p className={`whitespace-pre-wrap text-sm ${answerOf(submission, f.name) ? "text-stone-700" : "text-stone-300"}`}>{answerOf(submission, f.name) ?? "—"}</p>
        </div>
      ))}
    </div>
  );
}
