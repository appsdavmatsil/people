import type { Metadata } from "next";
import { listIntakeSubmissions } from "@/lib/staff-intake-records";

export const metadata: Metadata = {
  title: "Staff Documents",
};

export const dynamic = "force-dynamic";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const [, y, m, d] = match;
  return `${d}/${m}/${y}`;
}

function isImage(fileName: string): boolean {
  return /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(fileName);
}

export default async function StaffDocumentsPage() {
  const submissions = await listIntakeSubmissions();

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-lg font-semibold text-stone-950">Staff Documents</h1>
        <p className="text-sm text-stone-500">
          {submissions.length} submission{submissions.length === 1 ? "" : "s"}
        </p>
      </div>

      {submissions.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-500">
          No submissions yet. Share the form link
          (<span className="font-mono">/onboarding</span>) with staff to collect
          their details and documents.
        </p>
      ) : (
        <div className="space-y-6">
          {submissions.map((person) => (
            <details
              key={person.id}
              className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm"
            >
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 bg-stone-50 px-5 py-3 marker:hidden hover:bg-stone-100">
                <div>
                  <h2 className="text-base font-semibold text-stone-950">
                    {person.full_name}
                  </h2>
                  <p className="text-xs text-stone-500">
                    Submitted {new Date(person.created_at).toLocaleString("en-GB")}
                  </p>
                </div>
                <span className="inline-flex items-center gap-2 text-xs font-medium text-stone-600">
                  Show details <span aria-hidden="true">⌄</span>
                </span>
              </summary>

              <div className="grid gap-5 border-t border-stone-200 px-5 py-4 lg:grid-cols-[320px_1fr]">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm lg:grid-cols-1 lg:gap-y-2">
                  {person.drive_folder_id ? (
                    <div className="col-span-full mb-2">
                      <a href={`https://drive.google.com/drive/folders/${person.drive_folder_id}`} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-lg border border-stone-300 bg-white px-3 text-xs font-medium text-stone-800 hover:bg-stone-100">Open Drive folder</a>
                    </div>
                  ) : null}
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
                    <figure
                      key={doc.file_id}
                      className="overflow-hidden rounded-xl border border-stone-200"
                    >
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
            </details>
          ))}
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-stone-500">{label}</dt>
      <dd className="font-medium text-stone-900">{value}</dd>
    </div>
  );
}
