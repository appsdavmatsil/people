"use client";

import { useMemo, useState } from "react";
import type { IntakeSubmission, IntakeDocumentRecord } from "@/lib/staff-intake-records";
import { MergeDialog } from "@/components/form/merge-dialog";
import { useStaffDirectory } from "@/components/use-staff-directory";

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
  const count = records.length;
  const list = useMemo(() => records, [records]);
  const { employees } = useStaffDirectory();
  // A submission counts as merged when an employee records its id, holds any of
  // its documents, or was imported with the same email (older merges stored neither).
  const merged = useMemo(() => {
    const submissionIds = new Set<string>();
    const fileIds = new Set<string>();
    const emails = new Set<string>();
    for (const e of employees) {
      if (e.intakeSubmissionId) submissionIds.add(e.intakeSubmissionId);
      for (const d of e.documents ?? []) fileIds.add(d.fileId);
      if (e.importedAt && e.email) emails.add(e.email.trim().toLowerCase());
    }
    return (person: IntakeSubmission) =>
      submissionIds.has(person.id) ||
      person.documents.some((doc) => fileIds.has(doc.file_id)) ||
      emails.has(person.email.trim().toLowerCase());
  }, [employees]);

  async function deleteSubmission(person: IntakeSubmission) {
    if (!window.confirm(`Delete ${person.full_name}'s submission record? Their Drive folder will be moved to ARCHIVE.`)) return;
    setDeletingId(person.id);
    const response = await fetch(`/api/staff-intake/${person.id}`, { method: "DELETE" });
    if (response.ok) {
      setRecords((current) => current.filter((item) => item.id !== person.id));
      const result = (await response.json()) as { archiveError?: boolean };
      if (result.archiveError) window.alert("The record was deleted, but its Drive folder could not be moved to ARCHIVE.");
    } else window.alert("The submission record could not be deleted.");
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
                <th className={th}></th>
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
              </tr>
            </thead>
            <tbody>
              {list.map((person) => {
                const isMerged = merged(person);
                return (
                <tr
                  key={person.id}
                  className={`border-b border-stone-100 ${isMerged ? "bg-emerald-50 hover:bg-emerald-100/70" : "hover:bg-stone-50/60"}`}
                >
                  <td className={td}>
                    <div className="font-medium text-stone-950">{person.full_name}</div>
                    <div className="text-xs text-stone-400">
                      {new Date(person.created_at).toLocaleDateString("en-GB")}
                    </div>
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
                        onClick={() => void deleteSubmission(person)}
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
