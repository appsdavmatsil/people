"use client";

import { useMemo, useState } from "react";
import { useStaffDirectory } from "@/components/use-staff-directory";
import type { IntakeDocumentRecord, IntakeSubmission } from "@/lib/staff-intake-records";
import { splitFullName, type StaffEmployee } from "@/lib/staff";
import { nameScore, nameTokens } from "@/lib/name-match";

// Fields that can be merged from a submission onto an employee record.
const MERGE_FIELDS: {
  key: keyof StaffEmployee;
  label: string;
  from: (s: IntakeSubmission) => string | null | undefined;
}[] = [
  { key: "email", label: "Email", from: (s) => s.email },
  { key: "phone", label: "Phone", from: (s) => s.phone },
  { key: "whatsapp", label: "WhatsApp", from: (s) => s.whatsapp },
  { key: "dateOfBirth", label: "Date of birth", from: (s) => s.date_of_birth },
  { key: "nationality", label: "Nationality", from: (s) => s.nationality },
  { key: "joiningDate", label: "Joining date", from: (s) => s.joining_date },
  { key: "passportNumber", label: "Passport number", from: (s) => s.passport_number },
  { key: "passportExpiry", label: "Passport expiry", from: (s) => s.passport_expiry },
  { key: "emiratesIdNumber", label: "Emirates ID number", from: (s) => s.emirates_id_number },
  { key: "emiratesIdExpiry", label: "Emirates ID expiry", from: (s) => s.emirates_id_expiry },
  { key: "visaExpiry", label: "Visa expiry", from: (s) => s.visa_expiry },
];

function isImage(fileName: string): boolean {
  return /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(fileName);
}

export function MergeDialog({
  submission,
  employee,
  onClose,
}: {
  submission: IntakeSubmission;
  /** Preselects the employee to merge onto. */
  employee?: StaffEmployee;
  onClose: () => void;
}) {
  const { employees, update } = useStaffDirectory();
  const [search, setSearch] = useState(employee?.fullName ?? "");
  const [selectedId, setSelectedId] = useState<string | null>(employee?.id ?? null);
  const [nameValue, setNameValue] = useState(employee?.fullName ?? "");
  const [open, setOpen] = useState(true);
  const [done, setDone] = useState(false);
  const [preview, setPreview] = useState<IntakeDocumentRecord | null>(null);

  // Which fields to apply (all on by default, only those with a value).
  const applicable = useMemo(
    () => MERGE_FIELDS.filter((f) => {
      const v = f.from(submission);
      return v != null && v !== "";
    }),
    [submission],
  );
  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(applicable.map((f) => [f.key, true])),
  );

  // Best-matching employee for the submitted name (or the same email).
  const suggested = useMemo(() => {
    const submitted = nameTokens(submission.full_name);
    const email = submission.email.trim().toLowerCase();
    let best: { employee: StaffEmployee; score: number } | null = null;
    for (const e of employees) {
      if (e.archived) continue;
      const score = nameScore(submitted, e.fullName) + (email && e.email?.trim().toLowerCase() === email ? 1 : 0);
      if (score >= 0.5 && (!best || score > best.score)) best = { employee: e, score };
    }
    return best?.employee ?? null;
  }, [employees, submission]);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    const active = employees.filter((e) => !e.archived);
    if (!q) {
      const rest = active.filter((e) => e !== suggested);
      return (suggested ? [suggested, ...rest] : rest).slice(0, 25);
    }
    return active.filter((e) => e.fullName.toLowerCase().includes(q)).slice(0, 25);
  }, [employees, search, suggested]);

  const selected = employees.find((e) => e.id === selectedId) ?? null;

  function applyMerge() {
    if (!selected) return;
    update((current) =>
      current.map((e) => {
        if (e.id !== selected.id) return e;
        const next: StaffEmployee = { ...e };
        const name = nameValue.trim().replace(/\s+/g, " ");
        if (name && name !== e.fullName) {
          const parts = splitFullName(name);
          next.fullName = name;
          next.firstName = parts.firstName;
          next.lastName = parts.lastName;
        }
        for (const f of applicable) {
          if (checked[f.key]) {
            const v = f.from(submission);
            if (v != null) {
              // @ts-expect-error assigning string to typed optional field
              next[f.key] = v;
            }
          }
        }
        next.importedAt = new Date().toISOString();
        next.intakeSubmissionId = submission.id;
        next.documents = submission.documents.map((document) => ({
          label: document.label,
          fileId: document.file_id,
          fileName: document.file_name,
          webViewLink: document.web_view_link,
        }));
        return next;
      }),
    );
    setDone(true);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          setOpen(false);
          onClose();
        }
      }}
    >
      <div className="max-h-[calc(100dvh-2rem)] w-[min(100%,58rem)] overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-3">
          <h2 className="text-base font-semibold text-stone-950">
            Merge “{submission.full_name}”
          </h2>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onClose();
            }}
            className="text-stone-400 hover:text-stone-950"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {done ? (
          <div className="p-8 text-center">
            <p className="text-sm text-stone-700">
              Merged onto <strong>{selected?.fullName}</strong>.
            </p>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onClose();
              }}
              className="mt-4 inline-flex h-9 items-center rounded-lg bg-[#063f3b] px-4 text-sm font-semibold text-white"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="max-h-[calc(100dvh-9rem)] overflow-y-auto px-5 py-4">
            <label className="block text-sm font-medium text-stone-800">
              Merge onto employee
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setSelectedId(null);
                }}
                placeholder="Search by full name…"
                className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-950"
              />
            </label>

            {!selected ? (
              <ul className="mt-2 divide-y divide-stone-100 rounded-lg border border-stone-200">
                {matches.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-stone-500">No matching employees.</li>
                ) : (
                  matches.map((e) => (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(e.id);
                          setNameValue(e.fullName);
                          setSearch(e.fullName);
                        }}
                        className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${e === suggested ? "bg-emerald-50 hover:bg-emerald-100/70" : "hover:bg-stone-50"}`}
                      >
                        <span className="flex items-center gap-2 font-medium text-stone-900">
                          {e.fullName}
                          {e === suggested ? (
                            <span className="rounded-full bg-[#063f3b] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Suggested</span>
                          ) : null}
                        </span>
                        <span className="text-xs text-stone-500">{e.position}</span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            ) : (
              <>
                <div className="mt-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-stone-800">Employee name</span>
                    <div className="inline-flex rounded-lg border border-stone-300 p-0.5 text-xs font-medium">
                      {[
                        { label: "Keep current", value: selected.fullName },
                        { label: "Use submitted", value: submission.full_name.trim() },
                      ].map((option) => (
                        <button
                          key={option.label}
                          type="button"
                          onClick={() => setNameValue(option.value)}
                          title={option.value}
                          className={`rounded-md px-2.5 py-1 ${nameValue === option.value ? "bg-[#063f3b] text-white" : "text-stone-600 hover:bg-stone-100"}`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <input
                    value={nameValue}
                    onChange={(e) => setNameValue(e.target.value)}
                    placeholder={selected.fullName}
                    className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-950"
                  />
                  <p className="mt-1 text-xs text-stone-500">
                    Current: <span className="text-stone-700">{selected.fullName}</span> · Submitted:{" "}
                    <span className="text-stone-700">{submission.full_name}</span>
                  </p>
                </div>

                <p className="mt-3 text-xs text-stone-500">Choose each value to import. Unchecked rows keep the current employee value.</p>
                <div className="mt-2 overflow-hidden rounded-xl border border-stone-200">
                  <div className="grid grid-cols-[2rem_9rem_1fr_1fr] gap-3 bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-500">
                    <span />
                    <span>Field</span>
                    <span>Current value</span>
                    <span>Importing value</span>
                  </div>
                  {applicable.map((f) => (
                    <label
                      key={f.key}
                      className="grid grid-cols-[2rem_9rem_1fr_1fr] items-center gap-3 border-t border-stone-100 px-3 py-2 text-sm hover:bg-stone-50"
                    >
                      <input type="checkbox" checked={checked[f.key] ?? false} onChange={(e) => setChecked((c) => ({ ...c, [f.key]: e.target.checked }))} />
                      <span className="font-medium text-stone-700">{f.label}</span>
                      <span className="truncate text-stone-500">{String(selected[f.key] ?? "—") || "—"}</span>
                      <span className="truncate font-medium text-stone-950">{f.from(submission) || "—"}</span>
                    </label>
                  ))}
                </div>

                {submission.documents.length ? (
                  <div className="mt-4">
                    <h3 className="text-sm font-semibold text-stone-950">Importing documents</h3>
                    <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
                      {submission.documents.map((document) => (
                        <button key={document.file_id} type="button" onClick={() => setPreview(document)} className="overflow-hidden rounded-lg border border-stone-200 bg-stone-50 text-left hover:ring-2 hover:ring-[#063f3b]">
                          {isImage(document.file_name) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={`/api/staff-intake/file/${document.file_id}?thumb=1`} alt={document.label} className="aspect-square w-full object-cover" />
                          ) : (
                            <span className="flex aspect-square items-center justify-center px-2 text-center text-xs font-medium text-stone-500">Preview document</span>
                          )}
                          <span className="block truncate px-2 py-1 text-xs text-stone-600">{document.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    className="inline-flex h-9 items-center rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium text-stone-800 hover:bg-stone-50"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={applyMerge}
                    className="inline-flex h-9 items-center rounded-lg bg-[#063f3b] px-4 text-sm font-semibold text-white hover:bg-[#052f2c]"
                  >
                    Merge selected fields
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      {preview ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-950/70 p-4" onClick={() => setPreview(null)}>
          <div className="max-h-[90dvh] w-[min(100%,56rem)] overflow-hidden rounded-2xl bg-white" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3"><span className="font-medium">{preview.label}</span><button type="button" onClick={() => setPreview(null)} aria-label="Close preview">✕</button></div>
            {isImage(preview.file_name) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/staff-intake/file/${preview.file_id}`} alt={preview.label} className="mx-auto max-h-[80dvh] w-auto object-contain" />
            ) : (
              <iframe src={`/api/staff-intake/file/${preview.file_id}`} title={preview.label} className="h-[80dvh] w-full" />
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
