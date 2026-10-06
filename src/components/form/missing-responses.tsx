"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { IntakeSubmission } from "@/lib/staff-intake-records";
import type { StaffEmployee } from "@/lib/staff";
import { useStaffDirectory } from "@/components/use-staff-directory";
import { namesMatch } from "@/lib/name-match";
import { MergeDialog } from "@/components/form/merge-dialog";
import { EmployeeFormDialog, type EmployeeFormRequest } from "@/components/employee-form-dialog";
import { SnapshotButton } from "@/components/snapshot-button";
import { formatSubmittedAt } from "@/lib/submitted-at";

type Status = "missing" | "submitted" | "merged";

const statusOrder: Record<Status, number> = { missing: 0, submitted: 1, merged: 2 };

const statusPill: Record<Status, { label: string; className: string }> = {
  missing: { label: "Missing", className: "border border-red-200 bg-white text-red-700" },
  submitted: { label: "Submitted · not merged", className: "border border-amber-200 bg-amber-50 text-amber-800" },
  merged: { label: "Merged", className: "bg-[#063f3b] text-white" },
};

const th = "whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-stone-500";
const td = "whitespace-nowrap px-3 py-2 text-sm text-stone-900 align-middle";

// Snapshots can leave out the Code column (cells marked data-snapshot-code).
const CODES_OPTION = { label: "codes", selector: "[data-snapshot-code]" };

/** Edit code an employee uses to update their submission on the public form. */
function CodeCell({ code }: { code: string | null }) {
  return (
    <td className={`${td} text-right`} data-snapshot-code>
      {code ? (
        <span className="rounded-md bg-stone-100 px-2 py-0.5 font-mono text-sm font-semibold tracking-widest text-stone-900">
          {code}
        </span>
      ) : (
        <span className="text-stone-300">—</span>
      )}
    </td>
  );
}

export function MissingResponses({ submissions }: { submissions: IntakeSubmission[] }) {
  const { employees, update } = useStaffDirectory();

  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [merging, setMerging] = useState<{ submission: IntakeSubmission; employee: StaffEmployee } | null>(null);
  const [creating, setCreating] = useState<{ submission: IntakeSubmission; request: EmployeeFormRequest } | null>(null);

  const { venues, unmatched } = useMemo(() => {
    function matches(s: IntakeSubmission, e: StaffEmployee): boolean {
      const email = e.email?.trim().toLowerCase();
      return (
        e.intakeSubmissionId === s.id ||
        Boolean(email && s.email.trim().toLowerCase() === email) ||
        s.documents.some((doc) => e.documents?.some((d) => d.fileId === doc.file_id)) ||
        namesMatch(s.full_name, e.fullName)
      );
    }

    // Merged employees carry import data; otherwise look for a matching
    // submission (the newest one, as submissions come newest first). The linked
    // submission also supplies the employee's edit code.
    function statusOf(e: StaffEmployee): { status: Status; submission?: IntakeSubmission } {
      const submission =
        submissions.find((s) => s.id === e.intakeSubmissionId) ?? submissions.find((s) => matches(s, e));
      if (e.intakeSubmissionId || e.importedAt) return { status: "merged", submission };
      return submission ? { status: "submitted", submission } : { status: "missing" };
    }

    const groups = new Map<string, { employee: StaffEmployee; status: Status; submission?: IntakeSubmission }[]>();
    for (const employee of employees) {
      if (employee.archived) continue;
      const venue = employee.venue.trim() || "No venue";
      const list = groups.get(venue) ?? [];
      list.push({ employee, ...statusOf(employee) });
      groups.set(venue, list);
    }

    return {
      venues: [...groups.entries()]
        .sort(([a], [b]) => (a === "No venue" ? 1 : b === "No venue" ? -1 : a.localeCompare(b)))
        .map(([venue, rows]) => ({
          venue,
          rows: rows.sort(
            (a, b) =>
              statusOrder[a.status] - statusOrder[b.status] ||
              a.employee.fullName.localeCompare(b.employee.fullName),
          ),
          missing: rows.filter((r) => r.status === "missing").length,
        })),
      // Submissions that no employee in the directory could be matched to.
      unmatched: submissions.filter((s) => !employees.some((e) => !e.archived && matches(s, e))),
    };
  }, [employees, submissions]);

  const today = new Date().toISOString().slice(0, 10);
  const totalMissing = venues.reduce((sum, v) => sum + v.missing, 0);
  const total = venues.reduce((sum, v) => sum + v.rows.length, 0);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-10">
      <div className="mb-4 flex items-baseline justify-between">
        <div>
          <h1 className="text-lg font-semibold text-stone-950">Missing Responses</h1>
          <p className="text-sm text-stone-500">
            Active employees by venue. Missing first; merged employees are highlighted in green. Codes let
            staff update their own submission on the form.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-sm text-stone-500">
            {totalMissing} of {total} missing
          </p>
          <button
            type="button"
            disabled={refreshing}
            onClick={() => startRefresh(() => router.refresh())}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 text-xs font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-60"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-2.64-6.36M21 4v5h-5" />
            </svg>
            {refreshing ? "Refreshing…" : "Refresh matching"}
          </button>
        </div>
      </div>

      {unmatched.length ? (
        <section className="mb-5 overflow-hidden rounded-xl border border-amber-200 bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-3 py-2">
            <h2 className="text-sm font-semibold text-amber-900">Unmatched submissions</h2>
            <div className="flex items-center gap-3">
              <span className="text-xs text-amber-800">
                {unmatched.length} not linked to any employee
              </span>
              <SnapshotButton fileName={`Unmatched submissions ${today}`} optional={CODES_OPTION} />
            </div>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-stone-200">
                <th className={th}>Submitted name</th>
                <th className={th}>Email</th>
                <th className={th}>Submitted</th>
                <th className={`${th} text-right`} data-snapshot-ignore>Action</th>
                <th className={`${th} text-right`} data-snapshot-code>Code</th>
              </tr>
            </thead>
            <tbody>
              {unmatched.map((s) => (
                <tr key={s.id} className="border-b border-stone-100 last:border-b-0 hover:bg-stone-50/60">
                  <td className={`${td} font-medium text-stone-950`}>{s.full_name}</td>
                  <td className={`${td} text-stone-600`}>{s.email || "—"}</td>
                  <td className={`${td} text-stone-600`}>{formatSubmittedAt(s.created_at)}</td>
                  <td className={`${td} text-right`} data-snapshot-ignore><button type="button" onClick={()=>setCreating({submission:s,request:employeeRequestFromSubmission(s)})} className="inline-flex h-7 items-center rounded-lg bg-stone-950 px-2.5 text-xs font-semibold text-white hover:bg-stone-800">Create employee</button></td>
                  <CodeCell code={s.edit_code} />
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {total === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-500">
          No active employees in the staff directory.
        </p>
      ) : (
        <div className="space-y-5">
          {venues.map(({ venue, rows, missing }) => (
            <section key={venue} className="overflow-hidden rounded-xl border border-stone-200 bg-white">
              <div className="flex items-center justify-between gap-3 border-b border-stone-200 bg-stone-50 px-3 py-2">
                <h2 className="text-sm font-semibold text-stone-950">{venue}</h2>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-stone-500">
                    {missing} of {rows.length} missing
                  </span>
                  <SnapshotButton fileName={`Missing responses - ${venue} ${today}`} optional={CODES_OPTION} />
                </div>
              </div>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-stone-200">
                    <th className={th}>Name</th>
                    <th className={th}>Position</th>
                    <th className={th}>Status</th>
                    <th className={`${th} text-right`} data-snapshot-code>Code</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ employee, status, submission }) => (
                    <tr
                      key={employee.id}
                      className={`border-b border-stone-100 last:border-b-0 ${status === "merged" ? "bg-emerald-50 hover:bg-emerald-100/70" : "hover:bg-stone-50/60"}`}
                    >
                      <td className={`${td} font-medium text-stone-950`}>{employee.fullName}</td>
                      <td className={`${td} text-stone-600`}>{employee.position || "—"}</td>
                      <td className={td}>
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusPill[status].className}`}>
                            {statusPill[status].label}
                          </span>
                          {status === "submitted" && submission ? (
                            <button
                              type="button"
                              data-snapshot-ignore
                              onClick={() => setMerging({ submission, employee })}
                              title={`Merge ${submission.full_name}'s submission onto ${employee.fullName}`}
                              className="inline-flex h-6 items-center gap-1 rounded-lg bg-[#063f3b] px-2 text-xs font-semibold text-white hover:bg-[#052f2c]"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden="true">
                                <path d="M6 3v6a6 6 0 0 0 6 6h6M6 21v-6M15 12l3 3-3 3" />
                              </svg>
                              Merge
                            </button>
                          ) : null}
                        </div>
                      </td>
                      <CodeCell code={submission?.edit_code ?? null} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}
      {merging ? (
        <MergeDialog
          submission={merging.submission}
          employee={merging.employee}
          onClose={() => setMerging(null)}
        />
      ) : null}
      <EmployeeFormDialog request={creating?.request??null} onSave={(employee)=>{const submission=creating?.submission;if(!submission)return;update((current)=>[...current,{...employee,intakeSubmissionId:submission.id,importedAt:new Date().toISOString(),documents:submission.documents.map((document)=>({label:document.label,fileId:document.file_id,fileName:document.file_name,webViewLink:document.web_view_link}))}]);setCreating(null);}} />
    </div>
  );
}

function employeeRequestFromSubmission(submission:IntakeSubmission):EmployeeFormRequest {const names=submission.full_name.trim().split(/\s+/);return{token:Date.now(),employee:null,description:"Complete the role, venue and salary, then save this submitted person to the directory.",seed:{fullName:submission.full_name,firstName:names[0]??"",lastName:names.slice(1).join(" "),nationality:submission.nationality??"",email:submission.email,phone:submission.phone??"",whatsapp:submission.whatsapp??"",dateOfBirth:submission.date_of_birth??"",joiningDate:submission.joining_date??"",passportNumber:submission.passport_number??"",passportExpiry:submission.passport_expiry??"",emiratesIdNumber:submission.emirates_id_number??"",emiratesIdExpiry:submission.emirates_id_expiry??"",visaExpiry:submission.visa_expiry??""},documents:submission.documents.map((document)=>({label:document.label,fileId:document.file_id,fileName:document.file_name,webViewLink:document.web_view_link}))};}
