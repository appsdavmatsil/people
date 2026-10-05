"use client";

import { useMemo, useState } from "react";
import type { IntakeSubmission, IntakeDocumentRecord } from "@/lib/staff-intake-records";
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

const th = "whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-stone-500";
const td = "whitespace-nowrap px-3 py-2 text-sm text-stone-900 align-middle";

export function FormResponses({ submissions }: { submissions: IntakeSubmission[] }) {
  const [records, setRecords] = useState(submissions);
  const [merging, setMerging] = useState<IntakeSubmission | null>(null);
  const [preview, setPreview] = useState<IntakeDocumentRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const count = records.length;
  const list = useMemo(() => records, [records]);

  async function deleteSubmission(person: IntakeSubmission) {
    if (!window.confirm(`Delete ${person.full_name}'s submission record? The Drive files will be kept.`)) return;
    setDeletingId(person.id);
    const response = await fetch(`/api/staff-intake/${person.id}`, { method: "DELETE" });
    if (response.ok) setRecords((current) => current.filter((item) => item.id !== person.id));
    else window.alert("The submission record could not be deleted.");
    setDeletingId(null);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
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
        <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-stone-200 bg-white">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-stone-50">
              <tr className="border-b border-stone-200">
                <th className={th}>Name</th>
                <th className={th}>Documents</th>
                <th className={th}>Email</th>
                <th className={th}>Phone</th>
                <th className={th}>WhatsApp</th>
                <th className={th}>DOB</th>
                <th className={th}>Nationality</th>
                <th className={th}>Passport no.</th>
                <th className={th}>Passport exp.</th>
                <th className={th}>EID no.</th>
                <th className={th}>EID exp.</th>
                <th className={th}>Visa exp.</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {list.map((person) => (
                <tr key={person.id} className="border-b border-stone-100 hover:bg-stone-50/60">
                  <td className={td}>
                    <div className="font-medium text-stone-950">{person.full_name}</div>
                    <div className="text-xs text-stone-400">
                      {new Date(person.created_at).toLocaleDateString("en-GB")}
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
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`/api/staff-intake/file/${doc.file_id}?thumb=1`}
                            alt={doc.label}
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
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
                  <td className={td}>{formatDate(person.passport_expiry)}</td>
                  <td className={td}>{person.emirates_id_number || "—"}</td>
                  <td className={td}>{formatDate(person.emirates_id_expiry)}</td>
                  <td className={td}>{formatDate(person.visa_expiry)}</td>
                  <td className="px-3 py-2 align-middle">
                    <div className="flex items-center gap-1.5">
                      {person.drive_folder_id ? (
                        <a
                          href={`https://drive.google.com/drive/folders/${person.drive_folder_id}`}
                          target="_blank"
                          rel="noreferrer"
                          title="Open Drive folder"
                          className="inline-flex h-7 items-center rounded-lg border border-stone-300 bg-white px-2 text-xs font-medium text-stone-700 hover:bg-stone-100"
                        >
                          Drive
                        </a>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setMerging(person)}
                        className="inline-flex h-7 items-center rounded-lg bg-[#063f3b] px-2.5 text-xs font-semibold text-white hover:bg-[#052f2c]"
                      >
                        Merge
                      </button>
                      <button type="button" disabled={deletingId === person.id} onClick={() => void deleteSubmission(person)} className="inline-flex h-7 items-center rounded-lg border border-red-200 bg-white px-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">
                        {deletingId === person.id ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {merging ? (
        <MergeDialog submission={merging} onClose={() => setMerging(null)} />
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
              {isImage(preview.file_name) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/staff-intake/file/${preview.file_id}`}
                  alt={preview.label}
                  className="mx-auto block max-h-[80dvh] w-auto"
                />
              ) : (
                <iframe
                  src={`/api/staff-intake/file/${preview.file_id}`}
                  title={preview.label}
                  className="h-[80dvh] w-full"
                />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
