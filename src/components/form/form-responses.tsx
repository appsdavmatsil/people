"use client";

import { useMemo, useState } from "react";
import type { IntakeSubmission } from "@/lib/staff-intake-records";
import { MergeDialog } from "@/components/form/merge-dialog";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function isImage(fileName: string): boolean {
  return /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(fileName);
}

export function FormResponses({ submissions }: { submissions: IntakeSubmission[] }) {
  const [merging, setMerging] = useState<IntakeSubmission | null>(null);
  const count = submissions.length;
  const list = useMemo(() => submissions, [submissions]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-10">
      <div className="mb-4 flex items-baseline justify-between">
        <div>
          <h1 className="text-lg font-semibold text-stone-950">Form Responses</h1>
          <p className="text-sm text-stone-500">Submissions collected from the staff form.</p>
        </div>
        <p className="text-sm text-stone-500">
          {count} submission{count === 1 ? "" : "s"}
        </p>
      </div>

      {count === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-500">
          No submissions yet. Share the form link (<span className="font-mono">/onboarding</span>) with staff.
        </p>
      ) : (
        <div className="space-y-6">
          {list.map((person) => (
            <section key={person.id} className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 bg-stone-50 px-5 py-3">
                <div>
                  <h2 className="text-base font-semibold text-stone-950">{person.full_name}</h2>
                  <p className="text-xs text-stone-500">
                    Submitted {new Date(person.created_at).toLocaleString("en-GB")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {person.drive_folder_id ? (
                    <a
                      href={`https://drive.google.com/drive/folders/${person.drive_folder_id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-8 items-center rounded-lg border border-stone-300 bg-white px-3 text-xs font-medium text-stone-800 hover:bg-stone-100"
                    >
                      Open Drive folder
                    </a>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setMerging(person)}
                    className="inline-flex h-8 items-center rounded-lg bg-[#063f3b] px-3 text-xs font-semibold text-white hover:bg-[#052f2c]"
                  >
                    Merge
                  </button>
                </div>
              </header>

              <div className="grid gap-5 px-5 py-4 lg:grid-cols-[320px_1fr]">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm lg:grid-cols-1">
                  <Detail label="Email" value={person.email} />
                  <Detail label="Date of birth" value={formatDate(person.date_of_birth)} />
                  <Detail label="Phone" value={person.phone ?? "—"} />
                  <Detail label="WhatsApp" value={person.whatsapp ?? "—"} />
                  <Detail label="Joining date" value={formatDate(person.joining_date)} />
                  <Detail label="Nationality" value={person.nationality ?? "—"} />
                  <Detail label="Passport no." value={person.passport_number ?? "—"} />
                  <Detail label="Passport expiry" value={formatDate(person.passport_expiry)} />
                  <Detail label="Emirates ID no." value={person.emirates_id_number ?? "—"} />
                  <Detail label="Emirates ID expiry" value={formatDate(person.emirates_id_expiry)} />
                  <Detail label="Visa expiry" value={formatDate(person.visa_expiry)} />
                </dl>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {person.documents.map((doc) => (
                    <figure key={doc.file_id} className="overflow-hidden rounded-xl border border-stone-200">
                      <div className="flex aspect-[3/4] items-center justify-center bg-stone-100">
                        {isImage(doc.file_name) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`/api/staff-intake/file/${doc.file_id}`}
                            alt={doc.label}
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <a
                            href={`/api/staff-intake/file/${doc.file_id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="px-3 text-center text-xs font-medium text-stone-600 underline"
                          >
                            Open {doc.label}
                          </a>
                        )}
                      </div>
                      <figcaption className="truncate px-2 py-1.5 text-center text-xs text-stone-600">
                        {doc.label}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </div>
            </section>
          ))}
        </div>
      )}

      {merging ? (
        <MergeDialog submission={merging} onClose={() => setMerging(null)} />
      ) : null}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-stone-500">{label}</dt>
      <dd className="font-medium text-stone-900">{value ?? "—"}</dd>
    </div>
  );
}
