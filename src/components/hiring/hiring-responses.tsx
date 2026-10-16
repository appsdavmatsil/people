"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type TouchEvent } from "react";
import type { HiringSubmission } from "@/lib/hiring-records";
import type { ConfigTextField } from "@/lib/form-config";
import { positionRank } from "@/lib/position-rank";
import { continentFor, continents, flagFor, normalizeNationality } from "@/lib/hiring-nationality";
import { countryFlag, countryNames } from "@/lib/countries";
import { HIRING_STATUSES, HIRING_STATUS_ACTIVE_STYLE, HIRING_STATUS_LABEL, HIRING_STATUS_MENU_STYLE, HIRING_STATUS_STYLE, normalizeHiringStatus, type HiringStatus } from "@/lib/hiring-status";
import { updateHiringStatusAction, deleteHiringSubmissionAction, searchWorkplaceAction } from "@/app/(app)/hiringform/actions";
import { updateHiringStatusSharedAction, searchWorkplaceSharedAction } from "@/app/hiring-team/[token]/actions";
import type { AboutPanel, WebResult } from "@/lib/workplace-search";
import { useHiring } from "@/components/use-hiring";
import { useLocations } from "@/components/use-locations";
import { useCardTags } from "@/components/use-card-tags";
import { useCardLabels } from "@/components/use-card-labels";
import { hiringStatusLabel, type HiringRole } from "@/lib/hiring";
import { locationMatches, type LocationReference } from "@/lib/locations";
import type { CardLabel } from "@/lib/card-labels";
import type { CardTag } from "@/lib/card-tags";

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
  openApplicationId,
  panelOnly = false,
  onClose,
}: {
  submissions: HiringSubmission[];
  fields: ConfigTextField[];
  /** Set when opened from the team link: status changes go through the link, and deleting is hidden. */
  shareToken?: string;
  /** Opens this application on load, e.g. from a linked hiring card. */
  openApplicationId?: string;
  /** Renders only the application panel (and its dialogs), e.g. over the staff board. */
  panelOnly?: boolean;
  onClose?: () => void;
}) {
  const pages = useMemo(() => detailPages(fields), [fields]);
  const [records, setRecords] = useState(() => submissions.map((s) => ({ ...s, status: normalizeHiringStatus(s.status), position_applied: displayPosition(s.position_applied) })));
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("new");
  const [nationalityFilter, setNationalityFilter] = useState<string>("all");
  const [positionFilter, setPositionFilter] = useState<string>("all");
  const [view, setView] = useState<ViewMode>("grid");
  const [cardSize, setCardSize] = useState(2);
  const [dupsOnly, setDupsOnly] = useState(false);
  const [ageRange, setAgeRange] = useState<[number, number] | null>(null);
  const [genderFilter, setGenderFilter] = useState<GenderFilter>("all");
  const [ageSort, setAgeSort] = useState<AgeSort>(null);
  const [visaFilter, setVisaFilter] = useState("all");
  const [outsideOnly, setOutsideOnly] = useState(false);
  const [immediateOnly, setImmediateOnly] = useState(false);
  const [detail, setDetail] = useState<HiringSubmission | null>(() => (openApplicationId ? records.find((r) => r.id === openApplicationId) ?? null : null));
  const [pendingDelete, setPendingDelete] = useState<HiringSubmission | null>(null);
  const [viewer, setViewer] = useState<{ url: string; label: string } | null>(null);
  const [workplaceSearch, setWorkplaceSearch] = useState<{ name: string; query: string } | null>(null);
  const [linkingFor, setLinkingFor] = useState<HiringSubmission | null>(null);
  const { roles: hiringRoles, update: updateHiringRoles } = useHiring();
  const { locations } = useLocations();
  const { tags: cardTags } = useCardTags();
  const { labels: cardLabels } = useCardLabels();
  const [zoom, setZoom] = useState(1);
  const [menu, setMenu] = useState<{ ids: string[]; x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const lastPicked = useRef<string | null>(null);
  const matchesExtra = useCallback(
    (r: HiringSubmission) =>
      withinAge(ageRange, ageOf(r.date_of_birth)) &&
      (genderFilter === "all" || genderOf(r) === genderFilter) &&
      (visaFilter === "all" || visaOf(r) === visaFilter) &&
      (!outsideOnly || isOutsideUae(r)) &&
      (!immediateOnly || joinsImmediately(r)),
    [ageRange, genderFilter, visaFilter, outsideOnly, immediateOnly],
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
    const inStatus = records.filter((r) => statusFilter === "all" || r.status === statusFilter);
    c.outside = inStatus.filter(isOutsideUae).length;
    c.immediate = inStatus.filter(joinsImmediately).length;
    return c;
  }, [records, statusFilter]);

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
    const map = new Map<string, { count: number; all: HiringSubmission[]; others: HiringSubmission[] }>();
    for (const [, list] of groups) {
      if (list.length < 2) continue;
      const sorted = [...list].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      for (const r of list) {
        map.set(r.id, { count: list.length, all: sorted, others: sorted.filter((x) => x.id !== r.id) });
      }
    }
    return { map, keyOf: key };
  }, [records]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = records.filter((r) => {
      const matchStatus = statusFilter === "all" || r.status === statusFilter;
      const matchNat = nationalityFilter === "all" || normalizeNationality(r.nationality) === nationalityFilter;
      const matchPos = positionFilter === "all" || r.position_applied === positionFilter;
      const matchSearch =
        q === "" || matchesSearch(searchIndex.get(r.id) ?? "", q);
      const matchDup = !dupsOnly || dupInfo.map.has(r.id);
      return matchStatus && matchNat && matchPos && matchSearch && matchDup && matchesExtra(r);
    });
    if (!ageSort) return matches;
    const sign = ageSort === "asc" ? 1 : -1;
    return matches
      .map((r) => {
        const age = ageOf(r.date_of_birth);
        return { r, age: age !== null && age >= 14 && age <= 80 ? age : null };
      })
      .sort((a, b) => (a.age === null ? (b.age === null ? 0 : 1) : b.age === null ? -1 : (a.age - b.age) * sign))
      .map(({ r }) => r);
  }, [records, searchIndex, search, statusFilter, nationalityFilter, positionFilter, dupsOnly, dupInfo, matchesExtra, ageSort]);

  async function changeStatus(ids: string | string[], status: string) {
    const targets = new Set(Array.isArray(ids) ? ids : [ids]);
    for (const id of [...targets]) {
      for (const other of dupInfo.map.get(id)?.others ?? []) targets.add(other.id);
    }
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

  const filterKey = JSON.stringify([search, statusFilter, nationalityFilter, positionFilter, dupsOnly, ageRange, genderFilter, visaFilter, outsideOnly, immediateOnly, ageSort]);
  const [paging, setPaging] = useState({ key: filterKey, page: 1 });
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(paging.key === filterKey ? paging.page : 1, pageCount);
  const pageStart = (page - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(pageStart, pageStart + PAGE_SIZE);
  const resultsRef = useRef<HTMLDivElement>(null);
  const goToPage = (next: number) => {
    setPaging({ key: filterKey, page: next });
    resultsRef.current?.scrollTo({ top: 0 });
  };

  const visibleSelected = filtered.filter((r) => selected.has(r.id)).map((r) => r.id);

  const hasSelection = selected.size > 0;
  const overlayOpen = Boolean(menu || detail || viewer || pendingDelete || workplaceSearch || linkingFor);
  useEffect(() => {
    if (!workplaceSearch) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setWorkplaceSearch(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [workplaceSearch]);
  useEffect(() => {
    if (!linkingFor) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setLinkingFor(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [linkingFor]);

  const linkedRoleOf = (s: HiringSubmission) => hiringRoles.find((role) => role.applicationId === s.id && !role.archived) ?? null;

  /** Puts the applicant on the chosen opening; a multi-opening role gives up one opening to a new linked card. */
  function linkToRole(s: HiringSubmission, roleId: string) {
    const name = s.full_name.trim();
    updateHiringRoles((current) => {
      const released = current.map((role) =>
        role.applicationId === s.id
          ? { ...role, applicationId: undefined, candidateName: role.candidateName === name ? "" : role.candidateName }
          : role,
      );
      const target = released.find((role) => role.id === roleId);
      if (!target) return current;
      if (target.openings > 1) {
        return [
          ...released.map((role) => (role.id === roleId ? { ...role, openings: role.openings - 1 } : role)),
          { ...target, id: crypto.randomUUID(), openings: 1, candidateName: name, applicationId: s.id },
        ];
      }
      return released.map((role) => (role.id === roleId ? { ...role, candidateName: name, applicationId: s.id } : role));
    });
    setLinkingFor(null);
  }

  function unlinkRole(s: HiringSubmission) {
    const name = s.full_name.trim();
    updateHiringRoles((current) =>
      current.map((role) =>
        role.applicationId === s.id
          ? { ...role, applicationId: undefined, candidateName: role.candidateName === name ? "" : role.candidateName }
          : role,
      ),
    );
  }
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
    if (longPressed.current) {
      longPressed.current = false;
      event.preventDefault();
      return;
    }
    if (event.metaKey || event.ctrlKey || event.shiftKey) {
      event.preventDefault();
      toggleSelect(s.id, event.shiftKey);
    } else {
      setDetail(s);
    }
  }

  function openMenu(event: MouseEvent, id: string) {
    event.preventDefault();
    showMenu(id, event.clientX, event.clientY);
  }
  function showMenu(id: string, x: number, y: number) {
    const ids = selected.has(id) ? visibleSelected : [id];
    setMenu({ ids, x, y });
  }

  // Touch screens have no right-click: holding a card for half a second opens the status menu.
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressOrigin = useRef<{ x: number; y: number } | null>(null);
  const longPressed = useRef(false);
  function cancelPress() {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  }
  function longPressProps(id: string) {
    return {
      onTouchStart: (event: TouchEvent) => {
        const touch = event.touches[0];
        longPressed.current = false;
        pressOrigin.current = { x: touch.clientX, y: touch.clientY };
        cancelPress();
        pressTimer.current = setTimeout(() => {
          longPressed.current = true;
          navigator.vibrate?.(10);
          showMenu(id, touch.clientX, touch.clientY);
        }, 500);
      },
      onTouchMove: (event: TouchEvent) => {
        const touch = event.touches[0];
        const origin = pressOrigin.current;
        if (origin && Math.hypot(touch.clientX - origin.x, touch.clientY - origin.y) > 10) cancelPress();
      },
      onTouchEnd: (event: TouchEvent) => {
        cancelPress();
        // Stops the tap that follows the hold from opening the card or closing the menu.
        if (longPressed.current) event.preventDefault();
      },
      onTouchCancel: cancelPress,
    };
  }
  async function doDelete(id: string) {
    setRecords((prev) => prev.filter((r) => r.id !== id));
    setPendingDelete(null);
    if (detail?.id === id) closeDetail();
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

  const activeFilters = [statusFilter !== "new", nationalityFilter !== "all", positionFilter !== "all", search !== "", ageRange !== null, genderFilter !== "all", visaFilter !== "all", outsideOnly, immediateOnly].filter(Boolean).length;
  const closeDetail = () => {
    setDetail(null);
    onClose?.();
  };

  const clearAll = () => { setSearch(""); setStatusFilter("new"); setNationalityFilter("all"); setPositionFilter("all"); setAgeRange(null); setGenderFilter("all"); setVisaFilter("all"); setOutsideOnly(false); setImmediateOnly(false); };

  return (
    <div className={panelOnly ? "contents" : "flex min-h-0 flex-1 flex-col"}>
      {!panelOnly && (<>
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
      <div className="flex flex-wrap items-center justify-center gap-1.5 sm:justify-start sm:gap-2">
        {(["all", ...STATUS_OPTIONS] as const).map((s) => (
          <Fragment key={s}>
            <button
              onClick={() => setStatusFilter(s)}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors sm:px-3 sm:py-1 sm:text-xs ${
                s === "all"
                  ? statusFilter === s ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-400"
                  : statusFilter === s ? HIRING_STATUS_ACTIVE_STYLE[s] : `${STATUS_STYLE[s]} hover:brightness-95`
              }`}
            >
              {s === "all" ? "All" : HIRING_STATUS_LABEL[s]} <span className="opacity-60">({counts[s] ?? 0})</span>
            </button>
            {s === "new" ? (
              <button
                onClick={() => setOutsideOnly((v) => !v)}
                aria-pressed={outsideOnly}
                title="Applicants who are currently outside the UAE (from their visa answer or current country)"
                className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors sm:px-3 sm:py-1 sm:text-xs ${
                  outsideOnly ? "border-sky-600 bg-sky-600 text-white" : "border-sky-200 bg-sky-50 text-sky-700 hover:border-sky-400"
                }`}
              >
                ✈ Outside UAE <span className="opacity-70">({counts.outside ?? 0})</span>
              </button>
            ) : null}
            {s === "new" ? (
              <button
                onClick={() => setImmediateOnly((v) => !v)}
                aria-pressed={immediateOnly}
                title="Applicants who answered Immediately to Joining Availability"
                className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors sm:px-3 sm:py-1 sm:text-xs ${
                  immediateOnly ? "border-emerald-600 bg-emerald-600 text-white" : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-400"
                }`}
              >
                ⚡ Join immediately <span className="opacity-70">({counts.immediate ?? 0})</span>
              </button>
            ) : null}
          </Fragment>
        ))}
        {dupInfo.map.size > 0 && (
          <button
            onClick={() => setDupsOnly((v) => !v)}
            className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors sm:ml-1 sm:px-3 sm:py-1 sm:text-xs ${
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
        <div className="mt-3 grid grid-cols-2 gap-1.5 sm:hidden">
          <SearchableFilter
            label="Position"
            data={posCounts.filter((seg) => seg.name !== "Not specified")}
            active={positionFilter}
            onPick={(name) => setPositionFilter(positionFilter === name ? "all" : name)}
          />
          <SearchableFilter
            label="Nationality"
            data={[...natCounts].sort((a, b) => b.count - a.count)}
            active={nationalityFilter}
            onPick={(name) => setNationalityFilter(nationalityFilter === name ? "all" : name)}
            withFlags
          />
        </div>
      )}
      {(posCounts.length > 0 || natCounts.length > 0) && (
        <div className="mt-4 hidden gap-3 sm:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
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
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 sm:mt-4 sm:flex-nowrap sm:gap-2">
        <div className="relative min-w-[200px] flex-1 sm:min-w-[140px]">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") setSearch(""); }}
            placeholder="Search any field — name, phone, languages, experience…"
            className="h-8 w-full rounded-lg border border-stone-200 bg-white pr-8 pl-3 text-sm outline-none focus:border-stone-400 sm:h-9"
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

        <AgeRangeSlider bounds={ageBounds} value={ageRange} onChange={setAgeRange} sort={ageSort} onSortChange={setAgeSort} />
        <GenderSwitch value={genderFilter} onChange={setGenderFilter} />
        <FilterSelect label="UAE visa" value={visaFilter} onChange={setVisaFilter} options={visaOptions} width="w-48" />

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <div className={`hidden items-center gap-0.5 rounded-lg border border-stone-200 bg-white p-0.5 sm:flex ${view === "grid" ? "" : "pointer-events-none opacity-40"}`}>
            <button onClick={() => setCardSize((size) => Math.max(0, size - 1))} disabled={cardSize === 0} className="grid size-8 place-items-center rounded-md text-stone-500 hover:bg-stone-100 disabled:opacity-30 disabled:hover:bg-transparent" aria-label="Smaller thumbnails" title="Smaller thumbnails">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M8 11h6"/></svg>
            </button>
            <button onClick={() => setCardSize((size) => Math.min(GRID_SIZES.length - 1, size + 1))} disabled={cardSize === GRID_SIZES.length - 1} className="grid size-8 place-items-center rounded-md text-stone-500 hover:bg-stone-100 disabled:opacity-30 disabled:hover:bg-transparent" aria-label="Bigger thumbnails" title="Bigger thumbnails">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M8 11h6M11 8v6"/></svg>
            </button>
          </div>
          <div className="flex items-center gap-0.5 rounded-lg border border-stone-200 bg-white p-0.5">
            <button onClick={() => setView("grid")} className={`grid size-7 place-items-center sm:size-8 rounded-md ${view === "grid" ? "bg-stone-900 text-white" : "text-stone-500 hover:bg-stone-100"}`} aria-label="Grid">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            </button>
            <button onClick={() => setView("list")} className={`grid size-7 place-items-center sm:size-8 rounded-md ${view === "list" ? "bg-stone-900 text-white" : "text-stone-500 hover:bg-stone-100"}`} aria-label="List">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
            </button>
          </div>
        </div>

      </div>

      <div className="mt-2 flex h-5 items-center gap-3 text-xs text-stone-500">
        <p>
          {filtered.length} of {records.length} applications
          {pageCount > 1 ? <span className="text-stone-400"> · showing {pageStart + 1}–{pageStart + pageItems.length}</span> : null}
        </p>
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
        <div ref={resultsRef} className={`mt-3 grid min-h-0 flex-1 auto-rows-max content-start items-start gap-3 overflow-y-auto pb-4 ${GRID_SIZES[cardSize]}`}>
          {pageItems.map((s) => {
            const photo = photoOf(s);
            return (
              <button key={s.id} onClick={(event) => openCard(event, s)} onContextMenu={(event) => openMenu(event, s.id)} {...longPressProps(s.id)} className={`group relative flex flex-col overflow-hidden rounded-xl border bg-white text-left transition-all select-none [-webkit-touch-callout:none] hover:-translate-y-0.5 hover:shadow-md ${selected.has(s.id) ? "border-red-600" : "border-stone-200"}`}>
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
                <div className={`space-y-0.5 px-2 py-1.5 ${s.status === "not_selected" ? "bg-red-50" : s.status === "new" ? "" : "bg-emerald-50"}`}>
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
                  {(workplaceOf(s) || livingCountryOf(s)) && (
                    <p className="flex items-center gap-1 rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-600">
                      {workplaceOf(s) ? (
                        <span
                          role="link"
                          tabIndex={0}
                          title={`Look up ${workplaceOf(s)}`}
                          onClick={(event) => { event.stopPropagation(); setWorkplaceSearch(workplaceQuery(s)); }}
                          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); setWorkplaceSearch(workplaceQuery(s)); } }}
                          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 hover:text-stone-900 hover:underline"
                        >
                          <span className="truncate">{workplaceOf(s)}</span>
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true" className="shrink-0 opacity-60"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
                        </span>
                      ) : <span className="flex-1" />}
                      {livingCountryOf(s) && <span className="shrink-0" title={`Lives in ${livingCountryOf(s)}`}>{countryFlag(livingCountryOf(s)!)}</span>}
                    </p>
                  )}
                </div>
                {selected.has(s.id) && <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 rounded-[inherit] ring-2 ring-red-600 ring-inset" />}
              </button>
            );
          })}
          {filtered.length === 0 && <p className="col-span-full py-16 text-center text-sm text-stone-400">No applications match.</p>}
          <Pager page={page} pageCount={pageCount} onPage={goToPage} className="col-span-full" />
        </div>
      ) : (
        <div ref={resultsRef} className="mt-3 min-h-0 flex-1 space-y-1.5 overflow-y-auto pb-4">
          {pageItems.map((s) => {
            const photo = photoOf(s);
            return (
              <button key={s.id} onClick={(event) => openCard(event, s)} onContextMenu={(event) => openMenu(event, s.id)} {...longPressProps(s.id)} className={`relative flex w-full items-center gap-3 rounded-xl border bg-white px-4 py-2.5 text-left select-none [-webkit-touch-callout:none] ${selected.has(s.id) ? "border-red-600" : "border-stone-200 hover:border-stone-400"}`}>
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo} alt="" className="size-9 shrink-0 rounded-full object-cover" />
                ) : (
                  <div className="grid size-9 shrink-0 place-items-center rounded-full bg-stone-100 text-stone-300">—</div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="flex items-baseline gap-1.5 text-sm font-medium text-stone-900">
                    <span className="truncate">{s.full_name}</span>
                    {ageOf(s.date_of_birth) !== null && <span className="shrink-0 text-xs font-normal tabular-nums text-stone-500">{ageOf(s.date_of_birth)} y/o</span>}
                  </p>
                  <p className="flex items-center gap-1 text-xs text-stone-400">
                    <span className="shrink-0">{flagFor(s.nationality)}</span>
                    <span className="truncate">{[s.nationality, s.current_position, addressPart(s.current_address, "country")].filter(Boolean).join(" | ")}</span>
                  </p>
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLE[s.status]}`}>{HIRING_STATUS_LABEL[s.status]}</span>
                {selected.has(s.id) && <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[inherit] ring-2 ring-red-600 ring-inset" />}
              </button>
            );
          })}
          {filtered.length === 0 && <p className="py-16 text-center text-sm text-stone-400">No applications match.</p>}
          <Pager page={page} pageCount={pageCount} onPage={goToPage} />
        </div>
      )}

      </>)}

      {/* Detail drawer */}
      {detail && (
        <div className="fixed inset-0 z-[80] flex justify-end bg-stone-950/40" onClick={closeDetail}>
          <div className="h-full w-full max-w-2xl overflow-y-auto bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <header className="sticky top-0 z-10 flex items-center justify-between gap-4 bg-[#063f3b] px-6 py-4 text-white shadow-sm">
              <h2 className="min-w-0 truncate text-xl font-semibold tracking-tight">
                {detail.full_name}
                {ageOf(detail.date_of_birth) !== null ? (
                  <span className="ml-2 text-sm font-medium text-white/70">{ageOf(detail.date_of_birth)} y/o</span>
                ) : null}
              </h2>
              <button onClick={closeDetail} aria-label="Close" className="grid size-8 shrink-0 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white">×</button>
            </header>
            <div className="border-b border-stone-200 bg-stone-100 p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                {photoOf(detail) ? (
                  <button
                    type="button"
                    onClick={() => { setZoom(1); setViewer({ url: photoOf(detail)!, label: "Profile Photo" }); }}
                    className="group relative h-36 w-28 shrink-0 overflow-hidden rounded-xl shadow-sm ring-1 ring-stone-200"
                    title="Click to zoom"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photoOf(detail)!} alt="" className="h-full w-full object-cover" />
                    <span className="absolute bottom-1 right-1 grid size-5 place-items-center rounded-md bg-black/60 text-white transition group-hover:bg-black/80">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
                    </span>
                  </button>
                ) : <div className="grid h-36 w-28 shrink-0 place-items-center rounded-xl bg-stone-200/60 text-stone-400">—</div>}
                <div>
                  <p className="text-base font-medium text-stone-800">{detail.position_applied}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-stone-400">
                    <span>{flagFor(detail.nationality)}</span>{detail.nationality}
                    {detail.created_at && <span className="ml-1">· Applied {new Date(detail.created_at).toLocaleDateString("en-GB")}</span>}
                  </p>
                  <p className="mt-1 text-xs text-stone-500">
                    Salary expectation{" "}
                    <span className={`font-semibold ${detail.salary_expectation ? "text-stone-900" : "text-stone-300"}`}>
                      {detail.salary_expectation ? `AED ${detail.salary_expectation}` : "—"}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-stone-500">
                    The Maine reference{" "}
                    <span className={`font-semibold ${maineReferenceOf(detail) ? "text-stone-900" : "text-stone-300"}`}>
                      {maineReferenceOf(detail) || "—"}
                    </span>
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <span className="text-xs text-stone-500">Status</span>
              <select value={detail.status} onChange={(e) => changeStatus(detail.id, e.target.value)} className={`rounded-lg border px-2 py-1 text-xs font-medium ${STATUS_STYLE[detail.status]}`}>
                {STATUS_OPTIONS.map((o) => <option key={o} value={o}>{HIRING_STATUS_LABEL[o]}</option>)}
              </select>
              {detail.status === "selected" && !shareToken ? (() => {
                const linked = linkedRoleOf(detail);
                const venue = linked ? locations.find((location) => locationMatches(location, linked.venue)) : null;
                return linked ? (
                  <span className="inline-flex min-w-0 items-center gap-1 rounded-lg border border-green-200 bg-white py-0.5 pr-1 pl-2 text-xs">
                    <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: venue?.color || "#a8a29e" }} aria-hidden="true" />
                    <span className="truncate font-medium text-stone-800" title={`${venue?.nickname ?? linked.venue} · ${linked.position}`}>
                      {venue?.nickname ?? linked.venue} · {linked.position}
                    </span>
                    <button type="button" onClick={() => setLinkingFor(detail)} className="rounded px-1.5 py-0.5 font-medium text-stone-500 hover:bg-stone-100 hover:text-stone-900">Change</button>
                    <button type="button" onClick={() => unlinkRole(detail)} aria-label="Unlink hiring position" title="Unlink hiring position" className="grid size-5 place-items-center rounded text-stone-400 hover:bg-red-50 hover:text-red-600">×</button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setLinkingFor(detail)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-green-300 bg-white px-2.5 py-1 text-xs font-semibold text-green-800 hover:bg-green-50"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11.5 4.5" /><path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07l1.33-1.4" /></svg>
                    Link to hiring position
                  </button>
                );
              })() : null}
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
                <p className="mt-0.5 text-[11px] text-orange-700">Matched by email/phone. Newest first. A status change applies to all of them.</p>
                <div className="mt-2 space-y-1">
                  {dupInfo.map.get(detail.id)!.all.map((o) => {
                    const viewing = o.id === detail.id;
                    return (
                      <button
                        key={o.id}
                        onClick={() => setDetail(o)}
                        disabled={viewing}
                        aria-current={viewing ? "true" : undefined}
                        className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-1.5 text-left text-xs ${
                          viewing ? "border-orange-400 bg-orange-100" : "border-orange-200 bg-white hover:border-orange-400"
                        }`}
                      >
                        <span className="truncate text-stone-700">
                          {o.position_applied || "—"} <span className="text-stone-400">· {o.created_at ? new Date(o.created_at).toLocaleDateString("en-GB") : "—"}</span>
                          {viewing ? <span className="ml-1.5 font-medium text-orange-800">· Viewing</span> : null}
                        </span>
                        <span className={`ml-2 shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLE[o.status]}`}>{HIRING_STATUS_LABEL[o.status]}</span>
                      </button>
                    );
                  })}
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

      {workplaceSearch && <WorkplaceSearchDialog {...workplaceSearch} shareToken={shareToken} onClose={() => setWorkplaceSearch(null)} />}

      {linkingFor && (
        <LinkHiringDialog
          applicant={linkingFor}
          roles={hiringRoles}
          locations={locations}
          tags={cardTags}
          labels={cardLabels}
          linkedRoleId={linkedRoleOf(linkingFor)?.id ?? null}
          onPick={(roleId) => linkToRole(linkingFor, roleId)}
          onClose={() => setLinkingFor(null)}
        />
      )}

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
function withinAge(range: [number, number] | null, age: number | null) {
  return !range || (age !== null && age >= range[0] && age <= range[1]);
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

function joinsImmediately(r: HiringSubmission) {
  const value = r.data?.joiningAvailability ?? r.data?.joining_availability;
  return typeof value === "string" && /^\s*immediate(ly)?\b/i.test(value);
}

const UAE_NAMES = /^(uae|u\.a\.e\.?|united arab emirates|emirates|dubai|abu dhabi|sharjah|ajman|ras al khaimah|fujairah|umm al quwain|al ain)$/i;

const UAE_PLACE = /\b(uae|u\.a\.e|united arab emirates|dubai|abu ?dhabi|sharjah|ajman|ras al ?khaimah|rak|fujairah|umm al ?quwain|al ain|jebel ali|deira|bur dubai|satwa|karama|jumeirah|al barsha|al quoz|al nahda|al qusais|mussafah|khalifa city|dubai marina|jlt|jvc|business bay|international city|silicon oasis|discovery gardens)\b/i;

/** City from the address, or the separate city answer that older applications stored on their own. */
function cityOf(r: HiringSubmission) {
  const stored = r.data?.currentCity ?? r.data?.current_city;
  return [typeof stored === "string" ? stored : "", addressPart(r.current_address, "city") ?? ""].join(" ").trim();
}

/** Country the candidate lives in now, read from their free-text address; null when it can't be told. */
function livingCountryOf(r: HiringSubmission): string | null {
  const address = r.current_address ?? "";
  const place = `${cityOf(r)} ${address}`;
  if (UAE_PLACE.test(place) || UAE_AREA.test(place)) return "United Arab Emirates";
  for (const part of address.split(/[,\n]/).map((p) => p.trim()).filter(Boolean).reverse()) {
    const name = normalizeNationality(part);
    if (countryFlag(name)) return name;
  }
  const lower = address.toLowerCase();
  return COUNTRY_WORDS.find(({ pattern }) => pattern.test(lower))?.name ?? null;
}

/** Dubai and Abu Dhabi areas and spellings that applicants type without naming the emirate. */
const UAE_AREA = /(duba[iï]|abudabi|\brigga\b|al khail|al khile|musaffah|discovery garden|bus+iness bay|jabel ali|tourist club|burjuman|al safa|trade cent(er|re)|al wasa?l|al quoz)/i;

const COUNTRY_WORDS = [...countryNames]
  .sort((a, b) => b.length - a.length)
  .map((name) => ({ name, pattern: new RegExp(`\\b${name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`) }));

/**
 * Said they are outside the UAE, or gave a current country that is not the UAE.
 * A UAE city always wins: the country question was added after many people applied.
 */
function isOutsideUae(r: HiringSubmission) {
  if (UAE_PLACE.test(cityOf(r))) return false;
  if (/outside uae/i.test(visaOf(r))) return true;
  const country = addressPart(r.current_address, "country");
  return Boolean(country && !UAE_NAMES.test(country.trim()));
}

/** Phones always get 3 per row; the size buttons only show from the sm breakpoint. */
const PAGE_SIZE = 50;

function Pager({ page, pageCount, onPage, className = "" }: { page: number; pageCount: number; onPage: (page: number) => void; className?: string }) {
  if (pageCount <= 1) return null;
  const step = "h-8 rounded-lg border border-stone-200 bg-white px-3 text-xs font-medium text-stone-700 hover:border-stone-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-stone-200";
  return (
    <nav aria-label="Result pages" className={`flex flex-wrap items-center justify-center gap-1.5 pt-3 ${className}`}>
      <button type="button" onClick={() => onPage(page - 1)} disabled={page === 1} className={step}>‹ Previous</button>
      {Array.from({ length: pageCount }, (_, index) => index + 1).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onPage(n)}
          aria-current={n === page ? "page" : undefined}
          className={`h-8 min-w-8 rounded-lg px-2 text-xs font-semibold tabular-nums ${n === page ? "bg-[#063f3b] text-white" : "border border-stone-200 bg-white text-stone-700 hover:border-stone-400"}`}
        >
          {n}
        </button>
      ))}
      <button type="button" onClick={() => onPage(page + 1)} disabled={page === pageCount} className={step}>Next page ›</button>
    </nav>
  );
}

const GRID_SIZES = [
  "grid-cols-3 sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10",
  "grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8",
  "grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6",
  "grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
  "grid-cols-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
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
            onClick={() => onPick(current === status ? "new" : status)}
            title={current === status ? "Click again to set back to Pending" : undefined}
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

type GenderFilter = "all" | "Male" | "Female";
type AgeSort = "asc" | "desc" | null;

function genderOf(s: HiringSubmission): string | null {
  const value = s.data?.gender;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function displayPosition(position: string | null): string | null {
  return position && /^(jnr|junior) sous( chef)?$/i.test(position.trim()) ? "Jnr Sous" : position;
}

function workplaceOf(s: HiringSubmission): string | null {
  const value = s.data?.currentWorkplace ?? s.data?.current_workplace;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function workplaceQuery(s: HiringSubmission) {
  const name = workplaceOf(s) ?? "";
  const country = livingCountryOf(s);
  const query = country && !name.toLowerCase().includes(country.toLowerCase()) ? `${name} ${country}` : name;
  return { name, query };
}

/** Google search pages refuse to load inside another site, so results are fetched on the server and Google Maps is embedded beside them. */
function WorkplaceSearchDialog({ name, query, shareToken, onClose }: { name: string; query: string; shareToken?: string; onClose: () => void }) {
  const q = encodeURIComponent(query);
  const [search, setSearch] = useState<{ query: string; results?: WebResult[]; about?: AboutPanel; error?: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    (shareToken ? searchWorkplaceSharedAction(shareToken, query) : searchWorkplaceAction(query))
      .then((result) => { if (!cancelled) setSearch({ query, results: result.results, about: result.about, error: result.ok ? undefined : result.error }); })
      .catch(() => { if (!cancelled) setSearch({ query, error: "Web results are unavailable right now." }); });
    return () => { cancelled = true; };
  }, [query, shareToken]);
  const loaded = search?.query === query ? search : null;
  const [page, setPage] = useState<{ url: string; title: string; embedUrl?: string } | null>(null);
  const openPage = (event: MouseEvent<HTMLAnchorElement>, url: string, title: string) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    const result = loaded?.results?.find((r) => r.url === url);
    setPage({ url, title, embedUrl: result?.embedUrl ?? (/wikipedia\.org\/wiki\//.test(url) ? url : undefined) });
  };

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-stone-950/40 p-4" onClick={onClose}>
      <div role="dialog" aria-label={`Search for ${name}`} className="flex h-[min(85dvh,760px)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-stone-200 px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-semibold text-stone-900">{name}</h2>
            <p className="truncate text-xs text-stone-500">Current / Last Workplace · {query}</p>
          </div>
          <a href={`https://www.google.com/search?q=${q}`} target="_blank" rel="noreferrer" className="inline-flex h-8 shrink-0 items-center rounded-lg border border-stone-300 px-3 text-xs font-medium text-stone-700 hover:bg-stone-50">
            Google search ↗
          </a>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-8 shrink-0 place-items-center rounded-lg text-lg text-stone-500 hover:bg-stone-100 hover:text-stone-900">×</button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {page ? (
            <div className="flex min-h-0 flex-1 flex-col border-b border-stone-200 md:border-r md:border-b-0">
              <div className="flex items-center gap-2 border-b border-stone-200 px-3 py-2">
                <button type="button" onClick={() => setPage(null)} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-medium text-stone-700 hover:bg-stone-100">
                  ← Results
                </button>
                <span className="min-w-0 flex-1 truncate text-xs text-stone-500" title={page.url}>{page.title}</span>
                <a href={page.url} target="_blank" rel="noreferrer" className="inline-flex h-8 shrink-0 items-center rounded-lg border border-stone-300 px-2.5 text-xs font-medium text-stone-700 hover:bg-stone-50">
                  New tab ↗
                </a>
              </div>
              {page.embedUrl ? (
                <iframe
                  key={page.embedUrl}
                  title={page.title}
                  src={page.embedUrl}
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                  referrerPolicy="no-referrer"
                  className="min-h-0 w-full flex-1 border-0 bg-white"
                />
              ) : (
                <div className="grid flex-1 place-items-center p-6 text-center">
                  <div>
                    <p className="text-sm text-stone-600"><span className="font-medium text-stone-900">{new URL(page.url).hostname.replace(/^www\./, "")}</span> doesn&apos;t allow being shown inside another page.</p>
                    <a href={page.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex h-9 items-center rounded-lg bg-stone-900 px-4 text-sm font-medium text-white hover:bg-stone-800">
                      Open in new tab ↗
                    </a>
                  </div>
                </div>
              )}
            </div>
          ) : (
          <div className="min-h-0 flex-1 overflow-y-auto border-b border-stone-200 px-5 py-4 font-[Arial,Helvetica,sans-serif] md:border-r md:border-b-0">
            {!loaded ? (
              <div className="space-y-6" aria-label="Loading results">
                <div className="grid h-40 animate-pulse grid-cols-4 grid-rows-2 gap-1 overflow-hidden rounded-2xl">
                  <div className="col-span-2 row-span-2 bg-stone-200" />
                  {Array.from({ length: 4 }, (_, i) => <div key={i} className="bg-stone-100" />)}
                </div>
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="animate-pulse space-y-2">
                    <div className="flex items-center gap-2"><div className="size-7 rounded-full bg-stone-100" /><div className="h-2.5 w-1/3 rounded bg-stone-100" /></div>
                    <div className="h-4 w-3/4 rounded bg-stone-200" />
                    <div className="h-2.5 w-full rounded bg-stone-100" />
                  </div>
                ))}
              </div>
            ) : loaded.error || !loaded.results?.length ? (
              <p className="pt-2 text-sm text-[#4d5156]">
                {loaded.error ?? "No web results found."}{" "}
                <a href={`https://www.google.com/search?q=${q}`} target="_blank" rel="noreferrer" className="text-[#1a0dab] underline">Search on Google</a>
              </p>
            ) : (
              <>
                <SearchImageStrip results={loaded.results} about={loaded.about} onOpen={openPage} />
                {loaded.about && (
                  <section className="mb-6 border-b border-stone-200 pb-5">
                    <h3 className="text-[22px] leading-7 text-[#202124]">{loaded.about.title}</h3>
                    {loaded.about.description && <p className="mt-0.5 text-sm text-[#70757a] first-letter:uppercase">{loaded.about.description}</p>}
                    <h4 className="mt-3 text-base font-medium text-[#202124]">About</h4>
                    <p className="mt-1 line-clamp-5 text-sm leading-[22px] text-[#202124]">
                      {loaded.about.extract}{" "}
                      <a href={loaded.about.url} onClick={(e) => openPage(e, loaded.about!.url, `${loaded.about!.title} – Wikipedia`)} className="text-[#1a0dab] hover:underline">Wikipedia</a>
                    </p>
                  </section>
                )}
                <ol className="space-y-7">
                  {loaded.results.filter((r) => r.url !== loaded.about?.url).map((result) => (
                    <li key={result.url} className="flex min-w-0 gap-4">
                      <div className="min-w-0 flex-1">
                        <a href={result.url} onClick={(e) => openPage(e, result.url, result.title)} className="group block">
                          <span className="flex items-center gap-3">
                            <span className="grid size-[26px] shrink-0 place-items-center rounded-full border border-[#dadce0] bg-[#f1f3f4]">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={`https://www.google.com/s2/favicons?domain=${result.site}&sz=32`} alt="" className="size-[18px] rounded-full" />
                            </span>
                            <span className="min-w-0 leading-tight">
                              <span className="block truncate text-sm text-[#202124]">{siteLabel(result)}</span>
                              <span className="block truncate text-xs text-[#4d5156]">{breadcrumb(result.url)}</span>
                            </span>
                          </span>
                          <span className="mt-1.5 block text-xl leading-[26px] text-[#1a0dab] group-hover:underline">{result.title}</span>
                        </a>
                        {result.snippet && <p className="mt-1 line-clamp-3 text-sm leading-[22px] text-[#4d5156]">{result.snippet}</p>}
                      </div>
                      {result.image && (
                        <a href={result.url} onClick={(e) => openPage(e, result.url, result.title)} className="mt-8 shrink-0">
                          <SearchImage src={result.image} className="size-[92px] rounded-lg" />
                        </a>
                      )}
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>
          )}
          <iframe title={`Map of ${name}`} src={`https://www.google.com/maps?q=${q}&output=embed`} className="h-64 w-full shrink-0 border-0 md:h-auto md:w-[45%]" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
        </div>
      </div>
    </div>
  );
}

/** Third-party picture that removes itself if its host refuses to serve it. */
function SearchImage({ src, className }: { src: string; className: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className={`bg-stone-100 object-cover ${className}`} />;
}

/** Google-style photo mosaic: one large picture and up to four small ones, each linking to its page. */
function SearchImageStrip({ results, about, onOpen }: { results: WebResult[]; about?: AboutPanel; onOpen: (event: MouseEvent<HTMLAnchorElement>, url: string, title: string) => void }) {
  const seen = new Set<string>();
  const pictures = [
    ...(about?.image ? [{ src: about.image, href: about.url, title: `${about.title} – Wikipedia` }] : []),
    ...results.filter((r) => r.image).map((r) => ({ src: r.image!, href: r.url, title: r.title })),
  ].filter((p) => !seen.has(p.src) && seen.add(p.src)).slice(0, 5);
  if (!pictures.length) return null;
  return (
    <div className={`mb-6 grid h-44 gap-1 overflow-hidden rounded-2xl ${pictures.length === 1 ? "grid-cols-1" : pictures.length === 2 ? "grid-cols-2" : "grid-cols-4 grid-rows-2"}`}>
      {pictures.map((picture, index) => (
        <a
          key={picture.src}
          href={picture.href}
          onClick={(e) => onOpen(e, picture.href, picture.title)}
          className={`min-h-0 overflow-hidden bg-stone-100 ${pictures.length > 2 && index === 0 ? "col-span-2 row-span-2" : ""} ${pictures.length === 3 && index > 0 ? "col-span-2" : ""} ${pictures.length === 4 && index === 3 ? "col-span-2" : ""}`}
        >
          <SearchImage src={picture.src} className="h-full w-full transition-transform duration-300 hover:scale-105" />
        </a>
      ))}
    </div>
  );
}

function siteLabel(result: WebResult) {
  const fromTitle = /\s[|–—-]\s([^|–—-]{2,40})$/.exec(result.title)?.[1]?.trim();
  return fromTitle || result.site;
}

function breadcrumb(url: string) {
  try {
    const { protocol, hostname, pathname } = new URL(url);
    const parts = pathname.split("/").filter(Boolean).slice(0, 3).map((p) => decodeURIComponent(p).replace(/[-_]+/g, " ").replace(/\.\w+$/, ""));
    return [`${protocol}//${hostname}`, ...parts].join(" › ");
  } catch {
    return url;
  }
}

function GenderSwitch({ value, onChange }: { value: GenderFilter; onChange: (value: GenderFilter) => void }) {
  const options: { id: GenderFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "Male", label: "Male" },
    { id: "Female", label: "Female" },
  ];
  return (
    <div role="radiogroup" aria-label="Gender" className={`flex h-8 items-center gap-0.5 rounded-lg border bg-white p-0.5 text-xs sm:h-9 ${value === "all" ? "border-stone-200" : "border-stone-900"}`}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={value === option.id}
          onClick={() => onChange(option.id)}
          className={`h-full rounded-md px-2.5 font-medium transition-colors ${value === option.id ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100"}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function AgeRangeSlider({ bounds, value, onChange, sort, onSortChange }: { bounds: [number, number]; value: [number, number] | null; onChange: (value: [number, number] | null) => void; sort: AgeSort; onSortChange: (sort: AgeSort) => void }) {
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
    <div className={`flex h-8 items-center gap-3 rounded-lg border bg-white px-3 text-xs sm:h-9 ${value ? "border-stone-900" : "border-stone-200"}`}>
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
      <div className="-mr-1.5 flex items-center gap-0.5 border-l border-stone-200 pl-1.5">
        {(["asc", "desc"] as const).map((direction) => (
          <button
            key={direction}
            type="button"
            onClick={() => onSortChange(sort === direction ? null : direction)}
            aria-pressed={sort === direction}
            aria-label={direction === "asc" ? "Sort youngest first" : "Sort oldest first"}
            title={direction === "asc" ? "Youngest first" : "Oldest first"}
            className={`grid size-6 place-items-center rounded-md transition-colors ${sort === direction ? "bg-stone-900 text-white" : "text-stone-500 hover:bg-stone-100 hover:text-stone-900"}`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {direction === "asc" ? <path d="M12 19V5M5 12l7-7 7 7" /> : <path d="M12 5v14M5 12l7 7 7-7" />}
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options, width = "w-40" }: { label: string; value: string; onChange: (value: string) => void; options: string[]; width?: string }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className={`hidden h-9 ${width} shrink-0 truncate rounded-lg border px-2 text-xs outline-none sm:block ${value !== "all" ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-400"}`}
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

/** Phone-sized replacement for the breakdown boxes: type to search, tap to filter. */
function SearchableFilter({
  label,
  data,
  active,
  onPick,
  withFlags = false,
}: {
  label: string;
  data: { name: string; count: number }[];
  active: string;
  onPick: (name: string) => void;
  withFlags?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const isActive = active !== "all";
  const display = (name: string) => (withFlags ? `${flagFor(name)} ${name}` : name);
  const matches = data.filter((seg) => seg.name.toLowerCase().includes(query.trim().toLowerCase()));

  function pick(name: string) {
    onPick(name);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="relative min-w-0">
      <input
        value={open ? query : isActive ? display(active) : ""}
        onFocus={() => { setQuery(""); setOpen(true); }}
        onClick={() => setOpen(true)}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={open ? `Search ${label.toLowerCase()}…` : `${label}: All`}
        aria-label={label}
        className={`h-8 w-full truncate rounded-lg border pr-7 pl-2.5 text-xs sm:h-9 outline-none ${isActive && !open ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white text-stone-700 placeholder:text-stone-600 focus:border-stone-400"}`}
      />
      {isActive && !open ? (
        <button type="button" onClick={() => onPick(active)} aria-label={`Clear ${label}`} className="absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center text-sm text-white/80">×</button>
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-stone-400"><path d="m6 9 6 6 6-6" /></svg>
      )}
      {open && (
        <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-stone-200 bg-white py-1 shadow-lg">
          {!query && (
            <li>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); if (isActive) onPick(active); setOpen(false); }} className="flex w-full px-3 py-1.5 text-left text-xs font-medium text-stone-800 hover:bg-stone-100">
                All
              </button>
            </li>
          )}
          {matches.map((seg) => (
            <li key={seg.name}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); pick(seg.name); }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs ${seg.name === active ? "bg-stone-900 font-semibold text-white" : "text-stone-700 hover:bg-stone-100"}`}
              >
                <span className="truncate">{display(seg.name)}</span>
                <span className={`ml-auto shrink-0 tabular-nums ${seg.name === active ? "text-white/70" : "text-stone-400"}`}>{seg.count}</span>
              </button>
            </li>
          ))}
          {matches.length === 0 && <li className="px-3 py-1.5 text-xs text-stone-400">No matches</li>}
        </ul>
      )}
    </div>
  );
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
const HIDDEN_DATA_KEYS = new Set(["source", "source_id", "referenceFromTeam", "referenceName"]);

/** "Yes · Name", "No", or "" for applications sent before the form asked. */
function maineReferenceOf(s: HiringSubmission) {
  const answer = String(s.data?.referenceFromTeam ?? "").trim();
  const name = String(s.data?.referenceName ?? "").trim();
  if (answer === "Yes") return name ? `Yes · ${name}` : "Yes";
  return answer;
}

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

/** wa.me needs the number in international form with digits only. */
function whatsappLink(phone: string | null) {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (phone.trim().startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0") && digits.length === 10) digits = `971${digits.slice(1)}`;
  return digits.length >= 8 ? `https://wa.me/${digits}` : null;
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
      <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.64-2.05-.17-.3-.02-.46.13-.6.13-.14.3-.35.44-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.5h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.7.63.71.22 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35M12.05 21.5h-.01a9.4 9.4 0 0 1-4.8-1.31l-.34-.2-3.57.93.95-3.48-.22-.36a9.4 9.4 0 0 1-1.44-5.02c0-5.2 4.24-9.44 9.45-9.44a9.4 9.4 0 0 1 6.68 2.77 9.38 9.38 0 0 1 2.76 6.68c0 5.2-4.24 9.43-9.45 9.43M20.08 3.9A11.3 11.3 0 0 0 12.05.58C5.79.58.7 5.67.7 11.92c0 2 .52 3.95 1.52 5.67L.6 23.42l5.95-1.56a11.3 11.3 0 0 0 5.49 1.4h.01c6.25 0 11.34-5.09 11.35-11.34 0-3.03-1.18-5.88-3.32-8.02" />
    </svg>
  );
}

const RESIDENCE_FIELDS = new Set(["currentCountry", "currentCity", "currentAddress"]);
const isResidence = (f: ConfigTextField) => RESIDENCE_FIELDS.has(f.name) || /\bresiden|^current (country|city|address)\b/i.test(f.label);

/** Moves the matching field to sit right after Nationality, when both are in the list. */
function besideNationality(fields: ConfigTextField[], matches: (f: ConfigTextField) => boolean) {
  const moving = fields.find(matches);
  const anchor = fields.findIndex((f) => f.name === "nationality");
  if (!moving || anchor < 0) return fields;
  const rest = fields.filter((f) => f !== moving);
  const at = rest.findIndex((f) => f.name === "nationality") + 1;
  return [...rest.slice(0, at), moving, ...rest.slice(at)];
}

function AnswerSection({ section, submission, showTitle }: { section: DetailSection; submission: HiringSubmission; showTitle: boolean }) {
  const isScale = (f: ConfigTextField) => /^english\b/i.test(f.label.trim()) && (f.options?.length ?? 0) > 1;
  const fields = section.fields.filter((f) => f.name !== "salaryExpectation" && !/^salary expectation/i.test(f.label.trim()));
  if (fields.length === 0) return null;
  const scales = fields.filter(isScale);
  const short = besideNationality(fields.filter((f) => f.type !== "textarea" && !isScale(f)), (f) => f.name === "instagram" || /instagram/i.test(f.label));
  const long = fields.filter((f) => f.type === "textarea");
  return (
    <div className="space-y-3">
      {showTitle && <h4 className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">{section.title}</h4>}
      {scales.length > 0 && (
        <div className="space-y-2.5">
          {scales.map((f) => {
            const answer = answerOf(submission, f.name)?.trim() ?? "";
            const value = answer.toLowerCase();
            const options = f.options!;
            const shown = answer && !options.some((option) => option.trim().toLowerCase() === value) ? [...options, answer] : options;
            return (
              <div key={f.name} role="radiogroup" aria-label={f.label}>
                <p className="text-xs text-stone-400">{f.label}</p>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1.5">
                  {shown.map((option) => {
                    const checked = option.trim().toLowerCase() === value;
                    return (
                      <span key={option} role="radio" aria-checked={checked} className={`inline-flex items-center gap-1.5 text-sm ${checked ? "font-medium text-stone-900" : "text-stone-400"}`}>
                        <span className={`flex size-4 items-center justify-center rounded-full border ${checked ? "border-[#063f3b]" : "border-stone-300"}`}>
                          {checked ? <span className="size-2 rounded-full bg-[#063f3b]" /> : null}
                        </span>
                        {option}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {short.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
          {short.map((f, index) => {
            if (isResidence(f)) {
              if (short.findIndex((item) => isResidence(item)) !== index) return null;
              const residence = short.filter((item) => isResidence(item));
              return (
                <div key="residence" className="col-span-full grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 sm:grid-cols-3">
                  {residence.map((item) => {
                    const value = answerOf(submission, item.name);
                    return (
                      <div key={item.name} className="min-w-0">
                        <dt className="text-xs font-medium text-emerald-800">{item.label}</dt>
                        <dd className={`break-words ${value ? "font-medium text-stone-900" : "text-stone-300"}`}>{value ?? "—"}</dd>
                      </div>
                    );
                  })}
                </div>
              );
            }
            const value = answerOf(submission, f.name);
            const whatsapp = f.name === "phone" ? whatsappLink(value) : null;
            if (f.name === "nationality") {
              const flag = value ? flagFor(value) : "";
              return (
                <div key={f.name} className="flex min-w-0 items-center gap-2.5">
                  {flag ? <span className="text-3xl leading-none" aria-hidden="true">{flag}</span> : null}
                  <div className="min-w-0">
                    <dt className="text-xs text-stone-400">{f.label}</dt>
                    <dd className={`break-words ${value ? "text-stone-800" : "text-stone-300"}`}>{value ?? "—"}</dd>
                  </div>
                </div>
              );
            }
            if (/workplace/i.test(f.label)) {
              return (
                <div key={f.name} className="min-w-0 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5">
                  <dt className="text-xs font-medium text-violet-800">{f.label}</dt>
                  <dd className={`break-words ${value ? "font-medium text-stone-900" : "text-stone-300"}`}>{value ?? "—"}</dd>
                </div>
              );
            }
            return (
              <div key={f.name} className="min-w-0">
                <dt className="text-xs text-stone-400">{f.label}</dt>
                <dd className={`flex items-center gap-1.5 break-words ${value ? "text-stone-800" : "text-stone-300"}`}>
                  <span className="min-w-0 break-words">{value ?? "—"}</span>
                  {whatsapp ? (
                    <a
                      href={whatsapp}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Message ${submission.full_name ?? "candidate"} on WhatsApp`}
                      title="Message on WhatsApp"
                      className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[#25D366] hover:bg-[#25D366]/10"
                    >
                      <WhatsAppIcon />
                    </a>
                  ) : null}
                </dd>
              </div>
            );
          })}
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

function openRolesAt(roles: HiringRole[], venue: LocationReference) {
  return roles
    .filter((role) => !role.archived && role.status !== "filled" && locationMatches(venue, role.venue))
    .sort((a, b) => (b.salary ?? 0) - (a.salary ?? 0) || a.position.localeCompare(b.position));
}

function samePosition(a: string | null | undefined, b: string) {
  const clean = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return Boolean(a) && clean(displayPosition(a ?? "") ?? "") === clean(displayPosition(b) ?? "");
}

function LinkHiringDialog({
  applicant,
  roles,
  locations,
  tags,
  labels,
  linkedRoleId,
  onPick,
  onClose,
}: {
  applicant: HiringSubmission;
  roles: HiringRole[];
  locations: LocationReference[];
  tags: CardTag[];
  labels: CardLabel[];
  linkedRoleId: string | null;
  onPick: (roleId: string) => void;
  onClose: () => void;
}) {
  const linked = roles.find((role) => role.id === linkedRoleId) ?? null;
  const [venueId, setVenueId] = useState<string | null>(() => (linked ? locations.find((location) => locationMatches(location, linked.venue))?.id ?? null : null));
  const venue = locations.find((location) => location.id === venueId) ?? null;
  const tagOf = new Map(tags.filter((tag) => tag.text).map((tag) => [tag.staffId, tag.text]));
  const labelOf = new Map(labels.map((label) => [label.staffId, label.text]));
  const money = (value: number | null) => (value == null ? "—" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value));
  const open = venue ? openRolesAt(roles, venue) : [];

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-stone-950/40 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="link-hiring-title" className="flex max-h-[min(85dvh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-stone-200 px-5 py-4">
          <div className="min-w-0">
            <h2 id="link-hiring-title" className="text-base font-semibold text-stone-950">Link to hiring position</h2>
            <p className="mt-0.5 truncate text-sm text-stone-500">
              {applicant.full_name}
              {applicant.position_applied ? ` · applied for ${applicant.position_applied}` : ""}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-8 shrink-0 place-items-center rounded-lg text-stone-500 hover:bg-stone-100">×</button>
        </div>

        <div className="flex items-center gap-2 border-b border-stone-100 bg-stone-50 px-5 py-2 text-xs font-medium">
          <button type="button" onClick={() => setVenueId(null)} className={venue ? "text-stone-500 hover:text-stone-900" : "text-stone-900"}>1. Venue</button>
          <span className="text-stone-300" aria-hidden="true">›</span>
          <span className={venue ? "text-stone-900" : "text-stone-400"}>2. Position{venue ? ` at ${venue.nickname}` : ""}</span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {!venue ? (
            <ul className="grid gap-2 sm:grid-cols-2">
              {locations.map((location) => {
                const count = openRolesAt(roles, location).reduce((total, role) => total + role.openings, 0);
                return (
                  <li key={location.id}>
                    <button
                      type="button"
                      onClick={() => setVenueId(location.id)}
                      disabled={count === 0}
                      className="flex w-full items-center gap-3 rounded-xl border border-stone-200 px-3 py-2.5 text-left transition-colors hover:border-stone-400 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-stone-200 disabled:hover:bg-white"
                    >
                      <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: location.color }} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-stone-950">{location.nickname}</span>
                        <span className="block truncate text-xs text-stone-500">{location.venueName}</span>
                      </span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${count ? "bg-yellow-100 text-yellow-800" : "bg-stone-100 text-stone-400"}`}>
                        {count} open
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : open.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-stone-500">No open hiring positions at {venue.nickname}.</p>
          ) : (
            <ul className="space-y-2">
              {open.map((role) => {
                const isLinked = role.id === linkedRoleId;
                const otherCandidate = role.candidateName && !isLinked ? role.candidateName : "";
                const label = labelOf.get(role.id);
                const tag = tagOf.get(role.id);
                return (
                  <li key={role.id}>
                    <button
                      type="button"
                      onClick={() => onPick(role.id)}
                      className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${
                        isLinked ? "border-green-400 bg-green-50" : "border-yellow-200 bg-yellow-50 hover:border-yellow-400 hover:bg-yellow-100"
                      }`}
                    >
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate text-sm font-semibold text-stone-950">{role.position}</span>
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-stone-900">AED {money(role.salary)}</span>
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                        {role.department ? <span className="rounded bg-white/80 px-1.5 py-0.5 text-stone-600">{role.department}</span> : null}
                        <span className="rounded bg-white/80 px-1.5 py-0.5 text-stone-600">{role.openings} opening{role.openings === 1 ? "" : "s"}</span>
                        {role.status !== "open" ? <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800">{hiringStatusLabel(role.status)}</span> : null}
                        {label ? <span className="rounded bg-stone-800 px-1.5 py-0.5 font-medium text-white">{label}</span> : null}
                        {tag ? <span className="rounded border border-red-300 bg-white px-1.5 py-0.5 font-semibold uppercase tracking-wide text-red-700">{tag}</span> : null}
                        {samePosition(applicant.position_applied, role.position) ? <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-800">Matches application</span> : null}
                        {isLinked ? <span className="rounded bg-green-600 px-1.5 py-0.5 font-medium text-white">Linked</span> : null}
                      </span>
                      {otherCandidate ? (
                        <span className="mt-1.5 block text-xs text-amber-800">
                          Already has candidate {otherCandidate}{role.openings > 1 ? " — one opening will be split off" : " — they'll be replaced"}
                        </span>
                      ) : role.openings > 1 ? (
                        <span className="mt-1.5 block text-xs text-stone-500">One of the {role.openings} openings will become a card for {applicant.full_name}.</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
