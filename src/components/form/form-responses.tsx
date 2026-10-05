"use client";

import { useMemo, useState } from "react";
import type { IntakeSubmission, IntakeDocumentRecord } from "@/lib/staff-intake-records";
import { MergeDialog } from "@/components/form/merge-dialog";
import { DocPreview, DocThumb } from "@/components/form/doc-thumb";
import { ExpiredTag } from "@/components/form/expired-tag";
import { isExpired } from "@/lib/staff";
import { SortArrows } from "@/components/table-column-controls";
import { useStaffDirectory } from "@/components/use-staff-directory";
import { formatSubmittedAt } from "@/lib/submitted-at";
import { namesMatch } from "@/lib/name-match";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

const th = "whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-stone-500";
const td = "whitespace-nowrap px-3 py-2 text-sm text-stone-900 align-middle";
function ExpiryCell({ iso }: { iso: string | null }) {
  const expired = isExpired(iso);
  return (
    <td className={`${td} ${expired ? "font-medium text-red-700" : ""}`}>
      <span className="inline-flex items-center">
        {formatDate(iso)}
        {expired ? <ExpiredTag /> : null}
      </span>
    </td>
  );
}

function wordCount(name: string): number {
  return name.trim().split(/\s+/).filter(Boolean).length;
}

// Groups submissions that look like the same person: closely matching names of
// two or more words (extra/missing words, initials, one-letter typos) or a shared email, phone
// or passport number. Returns submission id -> group number (only for groups of 2+).
function findDuplicates(records: IntakeSubmission[]): Map<string, number> {
  const parent = records.map((_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  const key = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();
  for (let i = 0; i < records.length; i++) {
    for (let j = i + 1; j < records.length; j++) {
      const a = records[i];
      const b = records[j];
      const same =
        (key(a.email) && key(a.email) === key(b.email)) ||
        (key(a.passport_number) && key(a.passport_number) === key(b.passport_number)) ||
        (a.phone && b.phone && localDigits(a.phone).length >= 7 && localDigits(a.phone) === localDigits(b.phone)) ||
        // A one-word name ("Mahendra") is too vague to match on its own.
        (wordCount(a.full_name) >= 2 && wordCount(b.full_name) >= 2 && namesMatch(a.full_name, b.full_name));
      if (same) parent[root(i)] = root(j);
    }
  }
  const sizes = new Map<number, number>();
  records.forEach((_, i) => sizes.set(root(i), (sizes.get(root(i)) ?? 0) + 1));
  const groups = new Map<string, number>();
  const numbering = new Map<number, number>();
  records.forEach((record, i) => {
    const r = root(i);
    if ((sizes.get(r) ?? 0) < 2) return;
    if (!numbering.has(r)) numbering.set(r, numbering.size + 1);
    groups.set(record.id, numbering.get(r)!);
  });
  return groups;
}

// Digits of a phone number without the UAE country code or trunk 0.
function localDigits(value: string): string {
  return value.replace(/\D/g, "").replace(/^(00971|971|0)/, "");
}

type SortKey =
  | "name" | "documents" | "email" | "phone" | "whatsapp" | "dob" | "nationality"
  | "passport" | "passportExpiry" | "eid" | "eidExpiry" | "visaExpiry";

// Header columns in table order; null keys are not sortable.
const columns: { key: SortKey | null; label: string; value?: (s: IntakeSubmission) => string | number | null }[] = [
  { key: "name", label: "Name", value: (s) => s.full_name },
  { key: null, label: "" },
  { key: "documents", label: "Documents", value: (s) => s.documents.length },
  { key: "email", label: "Email", value: (s) => s.email },
  { key: "phone", label: "Phone", value: (s) => s.phone },
  { key: "whatsapp", label: "WhatsApp", value: (s) => s.whatsapp },
  { key: "dob", label: "DOB", value: (s) => s.date_of_birth },
  { key: "nationality", label: "Nationality", value: (s) => s.nationality },
  { key: "passport", label: "Passport no.", value: (s) => s.passport_number },
  { key: "passportExpiry", label: "Passport exp.", value: (s) => s.passport_expiry },
  { key: "eid", label: "EID no.", value: (s) => s.emirates_id_number },
  { key: "eidExpiry", label: "EID exp.", value: (s) => s.emirates_id_expiry },
  { key: "visaExpiry", label: "Visa exp.", value: (s) => s.visa_expiry },
];

const iconButton = "inline-flex size-7 items-center justify-center rounded-lg disabled:opacity-50";

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const FOLDER_ICON = "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z";
const MERGE_ICON = "M6 3v6a6 6 0 0 0 6 6h6M6 21v-6M15 12l3 3-3 3";
const TRASH_ICON = "M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3";

export function FormResponses({ submissions }: { submissions: IntakeSubmission[] }) {
  const [records, setRecords] = useState(submissions);
  const [merging, setMerging] = useState<IntakeSubmission | null>(null);
  const [preview, setPreview] = useState<IntakeDocumentRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<IntakeSubmission | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const count = records.length;
  const { employees } = useStaffDirectory();
  // A submission counts as merged when an employee records its id or holds any
  // of its documents. Older merges stored neither, so those fall back to email
  // (which would otherwise also flag a person's unmerged duplicate submission).
  const merged = useMemo(() => {
    const submissionIds = new Set<string>();
    const fileIds = new Set<string>();
    const emails = new Set<string>();
    for (const e of employees) {
      if (e.intakeSubmissionId) submissionIds.add(e.intakeSubmissionId);
      for (const d of e.documents ?? []) fileIds.add(d.fileId);
      if (e.importedAt && e.email && !e.intakeSubmissionId && !e.documents?.length) {
        emails.add(e.email.trim().toLowerCase());
      }
    }
    return (person: IntakeSubmission) =>
      submissionIds.has(person.id) ||
      person.documents.some((doc) => fileIds.has(doc.file_id)) ||
      emails.has(person.email.trim().toLowerCase());
  }, [employees]);

  // null = default order (newest submission first).
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  const [search, setSearch] = useState("");
  const [mergeFilter, setMergeFilter] = useState<"all" | "unmerged" | "merged" | "duplicates">("all");
  const mergedCount = useMemo(() => records.filter(merged).length, [records, merged]);
  const duplicates = useMemo(() => findDuplicates(records), [records]);
  const list = useMemo(() => {
    const scoped =
      mergeFilter === "all"
        ? records
        : mergeFilter === "duplicates"
          ? records
              .filter((s) => duplicates.has(s.id))
              // Keep each group together (newest first within a group).
              .sort((a, b) => duplicates.get(a.id)! - duplicates.get(b.id)!)
          : records.filter((s) => merged(s) === (mergeFilter === "merged"));
    // Phone-like queries match on digits, ignoring spaces and the 0 / +971 prefix.
    const query = search.trim();
    const phoneDigits = /^[\d\s()+-]{6,}$/.test(query) ? localDigits(query) : "";
    // Otherwise every word must appear in one of the searchable fields.
    const words = phoneDigits ? [] : query.toLowerCase().split(/\s+/).filter(Boolean);
    const found = phoneDigits
      ? scoped.filter((s) => [s.phone, s.whatsapp].some((phone) => phone && localDigits(phone).includes(phoneDigits)))
      : words.length
      ? scoped.filter((s) => {
          const haystack = [s.full_name, s.email, s.phone, s.whatsapp, s.nationality, s.passport_number, s.emirates_id_number]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          const digits = haystack.replace(/[\s-]/g, "");
          return words.every((word) => haystack.includes(word) || digits.includes(word.replace(/[\s-]/g, "")));
        })
      : scoped;
    const column = sort && columns.find((c) => c.key === sort.key);
    if (!sort || !column?.value) return found;
    const read = column.value;
    return [...found].sort((a, b) => {
      const left = read(a);
      const right = read(b);
      // Blank values always sink to the bottom.
      if (left === null || left === "") return right === null || right === "" ? 0 : 1;
      if (right === null || right === "") return -1;
      const order =
        typeof left === "number" && typeof right === "number"
          ? left - right
          : String(left).localeCompare(String(right), undefined, { sensitivity: "base", numeric: true });
      return sort.dir === "asc" ? order : -order;
    });
  }, [records, sort, search, mergeFilter, merged, duplicates]);

  // Click cycles ascending → descending → default order.
  function toggleSort(key: SortKey) {
    setSort((current) =>
      current?.key !== key ? { key, dir: "asc" } : current.dir === "asc" ? { key, dir: "desc" } : null,
    );
  }

  // Resubmissions share one Drive folder; the server keeps it while another record uses it.
  function sharesFolder(person: IntakeSubmission) {
    return Boolean(
      person.drive_folder_id &&
        records.some((item) => item.id !== person.id && item.drive_folder_id === person.drive_folder_id),
    );
  }

  async function deleteSubmission(person: IntakeSubmission) {
    setDeleteError(null);
    setDeletingId(person.id);
    try {
      const response = await fetch(`/api/staff-intake/${person.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error();
      setRecords((current) => current.filter((item) => item.id !== person.id));
      setPendingDelete(null);
      const result = (await response.json()) as { archiveError?: boolean };
      if (result.archiveError) window.alert("The record was deleted, but its Drive folder could not be moved to ARCHIVE.");
    } catch {
      setDeleteError("The submission could not be deleted. Please try again.");
    } finally {
      setDeletingId(null);
    }
  }


  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-stone-950">Form Responses</h1>
          <p className="text-sm text-stone-500">Submissions collected from the staff form.</p>
        </div>
        <div className="flex items-center gap-3">
          <div role="group" aria-label="Show submissions" className="inline-flex items-center gap-0.5 rounded-lg border border-stone-200 bg-stone-100/80 p-0.5 text-xs">
            {(
              [
                { id: "all", label: "All", n: count },
                { id: "unmerged", label: "Not merged", n: count - mergedCount },
                { id: "merged", label: "Merged", n: mergedCount },
                { id: "duplicates", label: "Duplicates", n: duplicates.size },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={mergeFilter === option.id}
                onClick={() => setMergeFilter(option.id)}
                className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 font-medium ${
                  mergeFilter === option.id
                    ? "bg-white text-stone-950 shadow-sm ring-1 ring-stone-200"
                    : "text-stone-500 hover:text-stone-900"
                }`}
              >
                {option.id === "merged" ? <span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" /> : null}
                {option.id === "duplicates" ? <span className="size-2 rounded-full bg-violet-500" aria-hidden="true" /> : null}
                {option.label}
                <span className="text-stone-400">{option.n}</span>
              </button>
            ))}
          </div>
          <label className="relative block">
            <span className="sr-only">Search submissions</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-stone-400" aria-hidden="true">
              <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4" />
            </svg>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, phone, passport…"
              className="h-9 w-72 rounded-lg border border-stone-300 bg-white pl-8 pr-3 text-sm outline-none focus:border-stone-950"
            />
          </label>
          <p className="whitespace-nowrap text-sm text-stone-500">
            {search.trim() || mergeFilter !== "all" ? `${list.length} of ${count}` : `${count} submission${count === 1 ? "" : "s"}`}
          </p>
        </div>
      </div>

      {count === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-500">
          No submissions yet. Share the form link (<span className="font-mono">/onboarding</span>) with staff.
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-stone-200 bg-white">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-stone-50">
              <tr className="border-b border-stone-200">
                {columns.map((column, index) =>
                  column.key ? (
                    <th
                      key={column.key}
                      scope="col"
                      aria-sort={sort?.key === column.key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                      className={th}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(column.key!)}
                        className="-mx-1 inline-flex items-center gap-1.5 rounded px-1 hover:text-stone-950"
                      >
                        {column.label}
                        <SortArrows active={sort?.key === column.key} direction={sort?.dir ?? "asc"} />
                      </button>
                    </th>
                  ) : (
                    <th key={index} className={th} />
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-3 py-10 text-center text-sm text-stone-500">
                    {search.trim() ? <>No submissions match “{search.trim()}”.</> : mergeFilter === "merged" ? "No merged submissions yet." : mergeFilter === "duplicates" ? "No duplicate entries found." : "Every submission has been merged."}
                  </td>
                </tr>
              ) : null}
              {list.map((person) => {
                const isMerged = merged(person);
                const hasExpired = [person.passport_expiry, person.emirates_id_expiry, person.visa_expiry].some(isExpired);
                return (
                <tr
                  key={person.id}
                  className={`border-b border-stone-100 ${
                    // Expired documents take priority; merged rows keep a green edge.
                    hasExpired
                      ? `bg-red-50 hover:bg-red-100/70 ${isMerged ? "shadow-[inset_4px_0_0_#10b981]" : "shadow-[inset_4px_0_0_#dc2626]"}`
                      : isMerged
                        ? "bg-emerald-50 hover:bg-emerald-100/70"
                        : "hover:bg-stone-50/60"
                  }`}
                >
                  <td className={td}>
                    <div className="flex items-center gap-1.5 font-medium text-stone-950">
                      {person.full_name}
                      {duplicates.has(person.id) ? (
                        <button
                          type="button"
                          onClick={() => setMergeFilter("duplicates")}
                          title="Looks like the same person as another submission. Show duplicates."
                          className="rounded-full border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700 hover:bg-violet-100"
                        >
                          Duplicate · {duplicates.get(person.id)}
                        </button>
                      ) : null}
                    </div>
                    <div className="text-xs text-stone-400">
                      {formatSubmittedAt(person.created_at)}
                    </div>
                    {person.updated_at ? (
                      <div className="text-xs font-medium text-amber-700" title="The employee updated this submission using their code">
                        Edited {formatSubmittedAt(person.updated_at)}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <div className="flex items-center gap-1">
                      {person.drive_folder_id ? (
                        <a
                          href={`https://drive.google.com/drive/folders/${person.drive_folder_id}`}
                          target="_blank"
                          rel="noreferrer"
                          title="Open Drive folder"
                          aria-label="Open Drive folder"
                          className={`${iconButton} border border-stone-300 bg-white text-stone-700 hover:bg-stone-100`}
                        >
                          <Icon d={FOLDER_ICON} />
                        </a>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setMerging(person)}
                        title="Merge onto employee"
                        aria-label="Merge onto employee"
                        className={`${iconButton} bg-[#063f3b] text-white hover:bg-[#052f2c]`}
                      >
                        <Icon d={MERGE_ICON} />
                      </button>
                      <button
                        type="button"
                        disabled={deletingId === person.id}
                        onClick={() => {
                          setDeleteError(null);
                          setPendingDelete(person);
                        }}
                        title="Delete submission"
                        aria-label="Delete submission"
                        className={`${iconButton} border border-red-200 bg-white text-red-700 hover:bg-red-50`}
                      >
                        <Icon d={TRASH_ICON} />
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <div className="flex items-center gap-1.5">
                      {person.documents.map((doc) => (
                        <button
                          key={doc.file_id}
                          type="button"
                          title={doc.label}
                          onClick={() => setPreview(doc)}
                          className="size-9 shrink-0 overflow-hidden rounded border border-stone-200 bg-stone-100 hover:ring-2 hover:ring-[#063f3b]"
                        >
                          <DocThumb fileId={doc.file_id} label={doc.label} version={person.updated_at} className="h-full w-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className={td}>{person.email || "—"}</td>
                  <td className={td}>{person.phone || "—"}</td>
                  <td className={td}>{person.whatsapp || "—"}</td>
                  <td className={td}>{formatDate(person.date_of_birth)}</td>
                  <td className={td}>{person.nationality || "—"}</td>
                  <td className={td}>{person.passport_number || "—"}</td>
                  <ExpiryCell iso={person.passport_expiry} />
                  <td className={td}>{person.emirates_id_number || "—"}</td>
                  <ExpiryCell iso={person.emirates_id_expiry} />
                  <ExpiryCell iso={person.visa_expiry} />
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {merging ? (
        <MergeDialog submission={merging} onClose={() => setMerging(null)} />
      ) : null}

      {pendingDelete ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deletingId) setPendingDelete(null);
          }}
        >
          <div role="alertdialog" aria-labelledby="delete-title" className="w-[min(100%,28rem)] rounded-2xl border border-stone-200 bg-white p-5 shadow-xl">
            <h2 id="delete-title" className="text-base font-semibold text-stone-950">Delete this submission?</h2>
            <div className={`mt-3 rounded-lg border px-3 py-2 text-sm ${merged(pendingDelete) ? "border-emerald-200 bg-emerald-50" : "border-stone-200 bg-stone-50"}`}>
              <div className="font-medium text-stone-950">{pendingDelete.full_name}</div>
              <div className="text-xs text-stone-500">
                Submitted {formatSubmittedAt(pendingDelete.created_at)} · {pendingDelete.email}
              </div>
              <div className="mt-1 text-xs font-medium">
                {merged(pendingDelete) ? (
                  <span className="text-emerald-700">This is the merged submission.</span>
                ) : (
                  <span className="text-stone-600">Not merged.</span>
                )}
              </div>
            </div>
            <p className="mt-3 text-sm text-stone-600">
              {sharesFolder(pendingDelete)
                ? "Their Drive folder is shared with another submission from them, so it will be kept."
                : "Their Drive folder will be moved to ARCHIVE."}{" "}
              The employee record is not changed.
            </p>
            {deleteError ? <p className="mt-2 text-sm text-red-700">{deleteError}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={Boolean(deletingId)}
                onClick={() => setPendingDelete(null)}
                className="inline-flex h-9 items-center rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={Boolean(deletingId)}
                onClick={() => void deleteSubmission(pendingDelete)}
                className="inline-flex h-9 items-center rounded-lg bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60"
              >
                {deletingId ? "Deleting…" : "Delete submission"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {preview ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/70 p-4"
          onClick={() => setPreview(null)}
        >
          <div
            className="flex max-h-[90dvh] w-[min(100%,56rem)] flex-col overflow-hidden rounded-2xl bg-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-stone-200 px-4 py-2.5">
              <span className="text-sm font-medium text-stone-900">{preview.label}</span>
              <div className="flex items-center gap-2">
                <a
                  href={`/api/staff-intake/file/${preview.file_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-medium text-stone-600 underline"
                >
                  Open full
                </a>
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  className="text-stone-400 hover:text-stone-950"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto bg-stone-100">
              <DocPreview fileId={preview.file_id} fileName={preview.file_name} label={preview.label} version={records.find((r) => r.documents.some((d) => d.file_id === preview.file_id))?.updated_at} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
