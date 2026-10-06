"use client";

import { useMemo, useState } from "react";
import { DocThumb } from "@/components/form/doc-thumb";
import { useStaffDirectory } from "@/components/use-staff-directory";
import type { IntakeSubmission } from "@/lib/staff-intake-records";

export function StaffDocumentsScreen({ submissions }: { submissions: IntakeSubmission[] }) {
  const { employees } = useStaffDirectory();
  const [query, setQuery] = useState("");
  const merged = useMemo(() => {
    const submissionIds = new Set(employees.map((employee) => employee.intakeSubmissionId).filter(Boolean));
    const documentIds = new Set(employees.flatMap((employee) => employee.documents?.map((document) => document.fileId) ?? []));
    const legacyEmails = new Set(
      employees
        .filter((employee) => employee.importedAt && !employee.intakeSubmissionId && !employee.documents?.length)
        .map((employee) => employee.email?.trim().toLowerCase())
        .filter(Boolean),
    );
    return submissions.filter((person) =>
      submissionIds.has(person.id) ||
      person.documents.some((document) => documentIds.has(document.file_id)) ||
      legacyEmails.has(person.email.trim().toLowerCase()),
    );
  }, [employees, submissions]);
  const needle = query.trim().toLowerCase();
  const visible = needle ? merged.filter((person) => [person.full_name, person.email, person.phone, person.whatsapp, person.passport_number, person.emirates_id_number].some((value) => value?.toLowerCase().includes(needle))) : merged;
  return <div className="min-h-0 flex-1 overflow-y-auto"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-lg font-semibold text-stone-950">Staff Documents</h1><p className="text-sm text-stone-500">{merged.length} merged record{merged.length === 1 ? "" : "s"}</p></div><label className="relative w-full max-w-sm"><span className="sr-only">Search merged documents</span><svg aria-hidden="true" viewBox="0 0 24 24" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone-400" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></svg><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search name, email, phone or document ID" className="h-10 w-full rounded-xl border border-stone-300 bg-white pr-3 pl-9 text-sm outline-none focus:ring-2 focus:ring-stone-300"/></label></div>{visible.length===0?<p className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-500">{merged.length?"No merged document records match this search.":"No form submissions have been merged into an employee yet."}</p>:<div className="space-y-3">{visible.map((person)=><DocumentRecord key={person.id} person={person}/>)}</div>}</div>;
}

function DocumentRecord({ person }: { person: IntakeSubmission }) {
  const details=[["Email",person.email],["Date of birth",formatDate(person.date_of_birth)],["Phone",person.phone],["WhatsApp",person.whatsapp],["Joining date",formatDate(person.joining_date)],["Nationality",person.nationality],["Passport no.",person.passport_number],["Passport expiry",formatDate(person.passport_expiry)],["Emirates ID no.",person.emirates_id_number],["Emirates ID expiry",formatDate(person.emirates_id_expiry)],["Visa expiry",formatDate(person.visa_expiry)]];
  const profilePhoto=person.documents.find((document)=>/profile|photo/i.test(document.label));
  return <details className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm"><summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 bg-stone-50 px-4 py-3 marker:hidden hover:bg-stone-100"><div className="flex min-w-0 items-center gap-3">{profilePhoto?<DocThumb fileId={profilePhoto.file_id} label={profilePhoto.label} size={96} className="size-9 shrink-0 rounded-full object-cover"/>:<span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-stone-200 text-xs font-semibold text-stone-600">{initials(person.full_name)}</span>}<div className="min-w-0"><h2 className="truncate text-sm font-semibold text-stone-950">{person.full_name}</h2><p className="truncate text-xs text-stone-500">Submitted {new Date(person.created_at).toLocaleString("en-GB")}</p></div></div><span className="text-xs font-medium text-stone-600">Show details <span aria-hidden="true">⌄</span></span></summary><div className="border-t border-stone-200 p-4"><div className="overflow-x-auto"><table className="w-full min-w-[62rem] text-left text-xs"><thead className="bg-stone-100 text-stone-500"><tr>{details.map(([label])=><th key={label} className="whitespace-nowrap px-2 py-2 font-medium">{label}</th>)}</tr></thead><tbody><tr>{details.map(([label,value])=><td key={label} className="whitespace-nowrap border-t border-stone-200 px-2 py-2 font-medium text-stone-900">{value||"—"}</td>)}</tr></tbody></table></div><div className="mt-3 flex flex-wrap items-start gap-3">{person.drive_folder_id?<a href={`https://drive.google.com/drive/folders/${person.drive_folder_id}`} target="_blank" rel="noreferrer" className="inline-flex h-24 w-28 items-center justify-center rounded-xl border border-stone-300 bg-stone-50 px-3 text-center text-xs font-medium hover:bg-stone-100">Open Drive folder</a>:null}{person.documents.map((doc)=><a key={doc.file_id} href={`/api/staff-intake/file/${doc.file_id}`} target="_blank" rel="noreferrer" title={`Open ${doc.label}`} className="w-28 overflow-hidden rounded-xl border border-stone-200 bg-white"><DocThumb fileId={doc.file_id} label={doc.label} size={240} className="h-20 w-full object-cover"/><span className="block truncate px-2 py-1.5 text-center text-[11px] text-stone-600">{doc.label}</span></a>)}</div></div></details>;
}

function formatDate(iso:string|null){if(!iso)return"—";const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);return match?`${match[3]}/${match[2]}/${match[1]}`:iso;}
function initials(name:string){return name.trim().split(/\s+/).slice(0,2).map((part)=>part[0]?.toUpperCase()??"").join("")||"?";}
