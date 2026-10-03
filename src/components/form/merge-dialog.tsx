"use client";

import { useMemo, useState } from "react";
import { useStaffDirectory } from "@/components/use-staff-directory";
import type { IntakeSubmission } from "@/lib/staff-intake-records";
import type { StaffEmployee } from "@/lib/staff";

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

export function MergeDialog({
  submission,
  onClose,
}: {
  submission: IntakeSubmission;
  onClose: () => void;
}) {
  const { employees, update } = useStaffDirectory();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  const [done, setDone] = useState(false);

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

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    const active = employees.filter((e) => !e.archived);
    if (!q) return active.slice(0, 25);
    return active.filter((e) => e.fullName.toLowerCase().includes(q)).slice(0, 25);
  }, [employees, search]);

  const selected = employees.find((e) => e.id === selectedId) ?? null;

  function applyMerge() {
    if (!selected) return;
    update((current) =>
      current.map((e) => {
        if (e.id !== selected.id) return e;
        const next: StaffEmployee = { ...e };
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
      <div className="max-h-[calc(100dvh-2rem)] w-[min(100%,34rem)] overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl">
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
                          setSearch(e.fullName);
                        }}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-stone-50"
                      >
                        <span className="font-medium text-stone-900">{e.fullName}</span>
                        <span className="text-xs text-stone-500">{e.position}</span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            ) : (
              <>
                <p className="mt-3 text-xs text-stone-500">
                  Choose which fields to copy onto <strong>{selected.fullName}</strong>.
                  Uncheck anything that looks like a mistake.
                </p>
                <div className="mt-2 space-y-1.5">
                  {applicable.map((f) => (
                    <label
                      key={f.key}
                      className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 px-3 py-2 text-sm"
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked[f.key] ?? false}
                          onChange={(e) =>
                            setChecked((c) => ({ ...c, [f.key]: e.target.checked }))
                          }
                        />
                        <span className="text-stone-700">{f.label}</span>
                      </span>
                      <span className="truncate text-xs text-stone-500">{f.from(submission)}</span>
                    </label>
                  ))}
                </div>

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
    </div>
  );
}
