"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DocThumb } from "@/components/form/doc-thumb";
import { DialogHeading, PencilIcon, PlusIcon } from "@/components/directory-actions";
import { CountrySelect } from "@/components/country-select";
import { useDirectoryLookups } from "@/components/use-directory-lookups";
import { useLocations } from "@/components/use-locations";
import { type LookupPosition } from "@/lib/directory-lookups";
import {
  formatSalary,
  parseMoneyInput,
  resolvePay,
  roundMoney,
  splitFullName,
  splitSalary,
  sumSalary,
  type StaffDocument,
  type StaffEmployee,
} from "@/lib/staff";

const fieldClass =
  "mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-950 outline-none focus:border-stone-950";
const secondaryButtonClass =
  "inline-flex h-9 items-center justify-center rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium text-stone-800 hover:bg-stone-50";
const primaryButtonClass =
  "inline-flex h-9 items-center justify-center rounded-lg bg-stone-950 px-3 text-sm font-medium text-white hover:bg-stone-800";

const currentOption = "__current__";

function whatsappMessageUrl(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : "";
}

const emptyForm = {
  fullName: "",
  firstName: "",
  lastName: "",
  photo: null as string | null,
  nationality: "",
  email: "",
  phone: "",
  whatsapp: "",
  dateOfBirth: "",
  joiningDate: "",
  terminationDate: "",
  passportNumber: "",
  passportExpiry: "",
  emiratesIdNumber: "",
  emiratesIdExpiry: "",
  visaExpiry: "",
  positionId: "",
  position: "",
  venueId: "",
  venue: "",
  basicSalary: "",
  allowances: "",
  salary: "",
};

export type EmployeeFormSeed = Partial<typeof emptyForm>;

export type EmployeeFormRequest = {
  token: number;
  employee: StaffEmployee | null;
  seed?: EmployeeFormSeed;
  documents?: StaffDocument[];
  description?: string;
};

export function EmployeeFormDialog({
  request,
  onSave,
}: {
  request: EmployeeFormRequest | null;
  onSave: (employee: StaffEmployee, previousId: string | null) => void;
}) {
  const { lookups } = useDirectoryLookups();
  const { locations } = useLocations();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const [session, setSession] = useState<{ token: number; editingId: string | null } | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [description, setDescription] = useState("First and last name are picked up from the full name.");
  const [formError, setFormError] = useState("");
  const [photoError, setPhotoError] = useState("");
  const editingId = session?.editingId ?? null;

  if (request && request.token !== session?.token) {
    setSession({ token: request.token, editingId: request.employee?.id ?? null });
    setForm(
      request.employee
        ? formFromEmployee(request.employee, lookups.positions, locations)
        : { ...emptyForm, ...request.seed },
    );
    setDescription(request.description ?? "First and last name are picked up from the full name.");
    setFormError("");
    setPhotoError("");
  }
  const positionGroups = useMemo(
    () =>
      lookups.departments
        .map((department) => ({
          department,
          positions: lookups.positions.filter((position) => position.departmentId === department.id),
        }))
        .filter((group) => group.positions.length > 0),
    [lookups.departments, lookups.positions],
  );
  const selectedPosition = lookups.positions.find((position) => position.id === form.positionId);

  useEffect(() => {
    if (!request) {
      return;
    }

    const node = dialogRef.current;
    if (node && !node.open) {
      node.showModal();
    }
  }, [request]);

  function updateSalary(salary: string) {
    const amount = parseMoneyInput(salary);
    if (amount == null) {
      setForm((current) => ({
        ...current,
        salary,
        basicSalary: "",
        allowances: "",
      }));
      return;
    }

    const split = splitSalary(amount);
    setForm((current) => ({
      ...current,
      salary,
      basicSalary: String(split.basicSalary),
      allowances: String(split.allowances),
    }));
  }

  function updateBasicSalary(basicSalary: string) {
    setForm((current) => salaryFromParts(current, "basicSalary", basicSalary));
  }

  function updateAllowances(allowances: string) {
    setForm((current) => salaryFromParts(current, "allowances", allowances));
  }

  function selectVenue(venueId: string) {
    const next = locations.find((location) => location.id === venueId);
    setForm((current) => ({
      ...current,
      venueId,
      venue: next?.venueName ?? "",
    }));
  }

  function selectPosition(positionId: string) {
    setForm((current) => {
      const previous = lookups.positions.find((position) => position.id === current.positionId);
      const next = lookups.positions.find((position) => position.id === positionId);
      return {
        ...current,
        positionId,
        position: next?.name ?? "",
        ...payFieldsForPosition(current, previous, next),
      };
    });
  }

  function updateFullName(fullName: string) {
    const parts = splitFullName(fullName);
    setForm((current) => ({
      ...current,
      fullName,
      firstName: parts.firstName,
      lastName: parts.lastName,
    }));
  }

  function updatePhoto(file: File | null) {
    setPhotoError("");
    if (!file) {
      setForm((current) => ({ ...current, photo: null }));
      return;
    }

    if (!file.type.startsWith("image/")) {
      setPhotoError("Choose an image file.");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setPhotoError("Use an image under 2 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const photo = typeof reader.result === "string" ? reader.result : null;
      setForm((current) => ({ ...current, photo }));
    };
    reader.readAsDataURL(file);
  }

  function saveEmployee(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const error = validateEmployee(form, editingId == null);
    if (error) {
      setFormError(error);
      return;
    }

    const previous = request?.employee ?? null;
    const employee: StaffEmployee = {
      id: editingId ?? crypto.randomUUID(),
      fullName: form.fullName.trim().replace(/\s+/g, " "),
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      photo: form.photo,
      nationality: form.nationality.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      whatsapp: form.whatsapp.trim(),
      dateOfBirth: form.dateOfBirth,
      joiningDate: form.joiningDate,
      terminationDate: form.terminationDate,
      passportNumber: form.passportNumber.trim(),
      passportExpiry: form.passportExpiry,
      emiratesIdNumber: form.emiratesIdNumber.trim(),
      emiratesIdExpiry: form.emiratesIdExpiry,
      visaExpiry: form.visaExpiry,
      position: form.position.trim(),
      venue: form.venue.trim(),
      archived: previous?.archived,
      importedAt: previous?.importedAt,
      documents: previous?.documents ?? request?.documents,
      ...resolvePay(
        parseMoneyInput(form.basicSalary),
        parseMoneyInput(form.allowances),
        parseMoneyInput(form.salary),
      ),
    };
    onSave(employee, editingId);
    dialogRef.current?.close();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="employee-form-title"
      className="m-auto h-fit max-h-[calc(100dvh-2rem)] w-[min(100%-2rem,40rem)] overflow-hidden rounded-2xl border border-stone-200 bg-white p-0 text-stone-950 shadow-xl backdrop:bg-stone-950/40"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          event.currentTarget.close();
        }
      }}
    >
      <form onSubmit={saveEmployee} className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <DialogHeading
          titleId="employee-form-title"
          title={editingId ? form.fullName.trim() || "Edit employee" : "New employee"}
          description={description}
          icon={editingId ? <PencilIcon /> : <PlusIcon />}
          onClose={() => dialogRef.current?.close()}
        />

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-stone-100 text-stone-500"
              onClick={() => photoRef.current?.click()}
              aria-label={form.photo ? "Update profile picture" : "Upload profile picture"}
            >
              {form.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.photo} alt="" className="size-full object-cover" />
              ) : (
                <UserIcon />
              )}
            </button>
            <div>
              <p className="text-sm font-medium text-stone-800">Profile picture</p>
              <div className="mt-1.5 flex items-center gap-2">
                <button
                  type="button"
                  className="text-sm font-medium text-stone-950 underline-offset-4 hover:underline"
                  onClick={() => photoRef.current?.click()}
                >
                  {form.photo ? "Update" : "Upload"}
                </button>
                {form.photo ? (
                  <button
                    type="button"
                    className="text-sm text-stone-500 underline-offset-4 hover:text-stone-950 hover:underline"
                    onClick={() => updatePhoto(null)}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              {photoError ? <p className="mt-1 text-xs text-red-700">{photoError}</p> : null}
            </div>
            <input
              ref={photoRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => {
                updatePhoto(event.target.files?.[0] ?? null);
                event.target.value = "";
              }}
            />
          </div>

          <label className="block text-sm font-medium text-stone-800">
            Full name
            <input
              value={form.fullName}
              onChange={(event) => updateFullName(event.target.value)}
              autoComplete="name"
              required
              autoFocus
              className={fieldClass}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-stone-800">
              First name
              <input
                value={form.firstName}
                onChange={(event) =>
                  setForm((current) => ({ ...current, firstName: event.target.value }))
                }
                autoComplete="given-name"
                className={fieldClass}
              />
            </label>
            <label className="block text-sm font-medium text-stone-800">
              Last name
              <input
                value={form.lastName}
                onChange={(event) =>
                  setForm((current) => ({ ...current, lastName: event.target.value }))
                }
                autoComplete="family-name"
                className={fieldClass}
              />
            </label>
          </div>

          <label className="block text-sm font-medium text-stone-800">
            Country
            <CountrySelect
              value={form.nationality}
              onChange={(next) => setForm((current) => ({ ...current, nationality: next }))}
              required={editingId == null}
              options={lookups.countries.map((c) => c.name)}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-stone-800">
              Email
              <input
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm((current) => ({ ...current, email: event.target.value }))
                }
                autoComplete="email"
                className={fieldClass}
              />
            </label>
            <label className="block text-sm font-medium text-stone-800">
              Phone number
              <input
                type="tel"
                value={form.phone}
                onChange={(event) =>
                  setForm((current) => ({ ...current, phone: event.target.value }))
                }
                autoComplete="tel"
                className={fieldClass}
              />
            </label>
          </div>

          <label className="block text-sm font-medium text-stone-800">
            WhatsApp phone number
            <span className="relative block">
              <input
                type="tel"
                value={form.whatsapp}
                onChange={(event) =>
                  setForm((current) => ({ ...current, whatsapp: event.target.value }))
                }
                className={`${fieldClass} pr-11`}
              />
              {whatsappMessageUrl(form.whatsapp) ? (
                <a
                  href={whatsappMessageUrl(form.whatsapp)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Message ${form.fullName || "employee"} on WhatsApp`}
                  title="Open WhatsApp message"
                  className="absolute right-2 bottom-1.5 inline-flex size-8 items-center justify-center rounded-full text-[#128c7e] hover:bg-[#128c7e]/10 focus:outline-none focus:ring-2 focus:ring-[#128c7e]/30"
                >
                  <WhatsAppIcon />
                </a>
              ) : null}
            </span>
          </label>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-sm font-medium text-stone-800">
              Date of birth
              <input
                type="date"
                value={form.dateOfBirth}
                onChange={(event) =>
                  setForm((current) => ({ ...current, dateOfBirth: event.target.value }))
                }
                required={editingId == null}
                max={todayIso()}
                className={fieldClass}
              />
            </label>
            <label className="block text-sm font-medium text-stone-800">
              Joining date
              <input
                type="date"
                value={form.joiningDate}
                onChange={(event) =>
                  setForm((current) => ({ ...current, joiningDate: event.target.value }))
                }
                required={editingId == null}
                className={fieldClass}
              />
            </label>
            <label className="block text-sm font-medium text-stone-800">
              Termination date
              <input
                type="date"
                value={form.terminationDate}
                onChange={(event) =>
                  setForm((current) => ({ ...current, terminationDate: event.target.value }))
                }
                className={fieldClass}
              />
            </label>
          </div>

          <label className="block text-sm font-medium text-stone-800">
            Current position
            {positionGroups.length > 0 ? (
              <select
                value={form.positionId || (form.position ? currentOption : "")}
                onChange={(event) => {
                  if (event.target.value === currentOption) {
                    return;
                  }
                  selectPosition(event.target.value);
                }}
                required
                className={fieldClass}
              >
                <option value="">Select a position</option>
                {form.position && !form.positionId ? (
                  <option value={currentOption}>{form.position}</option>
                ) : null}
                {positionGroups.map((group) => (
                  <optgroup key={group.department.id} label={group.department.name}>
                    {group.positions.map((position) => (
                      <option key={position.id} value={position.id}>
                        {position.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            ) : (
              <input
                value={form.position}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    positionId: "",
                    position: event.target.value,
                  }))
                }
                required
                className={fieldClass}
              />
            )}
          </label>

          <label className="block text-sm font-medium text-stone-800">
            Current venue
            {locations.length > 0 ? (
              <select
                value={form.venueId || (form.venue ? currentOption : "")}
                onChange={(event) => {
                  if (event.target.value === currentOption) {
                    return;
                  }
                  selectVenue(event.target.value);
                }}
                required
                className={fieldClass}
              >
                <option value="">Select a venue</option>
                {form.venue && !form.venueId ? (
                  <option value={currentOption}>{form.venue}</option>
                ) : null}
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.nickname} — {location.venueName}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={form.venue}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    venueId: "",
                    venue: event.target.value,
                  }))
                }
                required
                className={fieldClass}
              />
            )}
          </label>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-sm font-medium text-stone-800">
              Basic salary
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={form.basicSalary}
                onChange={(event) => updateBasicSalary(event.target.value)}
                className={fieldClass}
              />
            </label>
            <label className="block text-sm font-medium text-stone-800">
              Allowances
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={form.allowances}
                onChange={(event) => updateAllowances(event.target.value)}
                className={fieldClass}
              />
            </label>
            <label className="block text-sm font-medium text-stone-800">
              Current salary
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={form.salary}
                onChange={(event) => updateSalary(event.target.value)}
                className={fieldClass}
              />
            </label>
          </div>
          <p className="-mt-2 text-xs text-stone-500">
            {selectedPosition?.defaultSalary != null
              ? `Default salary for ${selectedPosition.name} is ${formatSalary(selectedPosition.defaultSalary)}. Change any amount to use a different salary for this employee. Current salary is basic salary plus allowances.`
              : "Current salary is basic salary plus allowances. Entering a current salary splits it into 60% basic salary and 40% allowances."}
          </p>

          <div className="rounded-xl border border-stone-200 bg-stone-100 p-4">
            <h3 className="text-sm font-semibold text-stone-950">Identity documents</h3>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-stone-800">
                Passport number
                <input
                  value={form.passportNumber}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, passportNumber: event.target.value }))
                  }
                  className={fieldClass}
                />
              </label>
              <label className="block text-sm font-medium text-stone-800">
                Passport expiry date
                <input
                  type="date"
                  value={form.passportExpiry}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, passportExpiry: event.target.value }))
                  }
                  className={fieldClass}
                />
              </label>
              <label className="block text-sm font-medium text-stone-800">
                Emirates ID number
                <input
                  value={form.emiratesIdNumber}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, emiratesIdNumber: event.target.value }))
                  }
                  className={fieldClass}
                />
              </label>
              <label className="block text-sm font-medium text-stone-800">
                Emirates ID expiry date
                <input
                  type="date"
                  value={form.emiratesIdExpiry}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, emiratesIdExpiry: event.target.value }))
                  }
                  className={fieldClass}
                />
              </label>
              <label className="block text-sm font-medium text-stone-800 sm:col-span-2">
                Residence visa expiry date
                <input
                  type="date"
                  value={form.visaExpiry}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, visaExpiry: event.target.value }))
                  }
                  className={fieldClass}
                />
              </label>
            </div>
          </div>

          {(request?.employee?.documents ?? request?.documents)?.length ? (
            <div className="border-t border-stone-200 pt-4">
              <h3 className="text-sm font-semibold text-stone-950">Merged employee documents</h3>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {(request.employee?.documents ?? request.documents ?? []).map((document) => (
                  <a key={document.fileId} href={`/api/staff-intake/file/${document.fileId}`} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-xl border border-stone-200 bg-stone-50">
                    <DocThumb fileId={document.fileId} label={document.label} className="aspect-[4/3] w-full object-cover" />
                    <span className="block truncate px-2 py-1.5 text-center text-xs font-medium text-stone-600 group-hover:text-stone-950">{document.label}</span>
                  </a>
                ))}
              </div>
            </div>
          ) : null}

          {formError ? <p className="text-sm text-red-700">{formError}</p> : null}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-stone-200 px-5 py-4">
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={() => dialogRef.current?.close()}
          >
            Cancel
          </button>
          <button type="submit" className={primaryButtonClass}>
            {editingId ? "Save" : "Add employee"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function formFromEmployee(
  employee: StaffEmployee,
  positions: LookupPosition[],
  locations: { id: string; venueName: string }[],
) {
  const position = positions.find(
    (item) => item.name.trim().toLowerCase() === employee.position.trim().toLowerCase(),
  );
  const venue = locations.find(
    (item) => item.venueName.trim().toLowerCase() === employee.venue.trim().toLowerCase(),
  );

  return {
    fullName: employee.fullName,
    firstName: employee.firstName,
    lastName: employee.lastName,
    photo: employee.photo,
    nationality: employee.nationality,
    email: employee.email ?? "",
    phone: employee.phone ?? "",
    whatsapp: employee.whatsapp ?? "",
    dateOfBirth: employee.dateOfBirth,
    joiningDate: employee.joiningDate,
    terminationDate: employee.terminationDate ?? "",
    passportNumber: employee.passportNumber ?? "",
    passportExpiry: employee.passportExpiry ?? "",
    emiratesIdNumber: employee.emiratesIdNumber ?? "",
    emiratesIdExpiry: employee.emiratesIdExpiry ?? "",
    visaExpiry: employee.visaExpiry ?? "",
    positionId: position?.id ?? "",
    position: employee.position,
    venueId: venue?.id ?? "",
    venue: employee.venue,
    basicSalary: employee.basicSalary == null ? "" : String(employee.basicSalary),
    allowances: employee.allowances == null ? "" : String(employee.allowances),
    salary: employee.salary == null ? "" : String(employee.salary),
  };
}

function validateEmployee(form: typeof emptyForm, requireProfile = true) {
  if (!form.fullName.trim()) {
    return "Enter a full name.";
  }

  if (requireProfile && !form.nationality.trim()) {
    return "Enter a country.";
  }

  if (requireProfile && !form.dateOfBirth) {
    return "Enter a date of birth.";
  }

  if (form.dateOfBirth && form.dateOfBirth > todayIso()) {
    return "Date of birth can't be in the future.";
  }

  if (requireProfile && !form.joiningDate) {
    return "Enter a joining date.";
  }

  if (!form.position.trim()) {
    return "Enter a current position.";
  }

  if (!form.venue.trim()) {
    return "Enter a current venue.";
  }

  const basicSalary = parseMoneyInput(form.basicSalary);
  const allowances = parseMoneyInput(form.allowances);
  const salary = parseMoneyInput(form.salary);
  if ([basicSalary, allowances, salary].some((amount) => amount != null && amount < 0)) {
    return "Salary can't be negative.";
  }

  if (resolvePay(basicSalary, allowances, salary).salary == null) {
    return "Enter a current salary, or basic salary and allowances.";
  }

  return "";
}

function payFieldsForPosition(
  current: { basicSalary: string; allowances: string; salary: string },
  previous: Pick<LookupPosition, "defaultSalary"> | undefined,
  next: Pick<LookupPosition, "defaultSalary"> | undefined,
) {
  if (!formMatchesDefault(current, previous?.defaultSalary ?? null)) {
    return {
      basicSalary: current.basicSalary,
      allowances: current.allowances,
      salary: current.salary,
    };
  }

  if (next?.defaultSalary == null) {
    return { basicSalary: "", allowances: "", salary: "" };
  }

  const split = splitSalary(next.defaultSalary);
  return {
    basicSalary: String(split.basicSalary),
    allowances: String(split.allowances),
    salary: String(split.salary),
  };
}

function formMatchesDefault(
  form: { basicSalary: string; allowances: string; salary: string },
  defaultSalary: number | null,
) {
  if (defaultSalary == null) {
    return (
      parseMoneyInput(form.basicSalary) == null &&
      parseMoneyInput(form.allowances) == null &&
      parseMoneyInput(form.salary) == null
    );
  }

  const split = splitSalary(defaultSalary);
  return (
    sameAmount(form.basicSalary, split.basicSalary) &&
    sameAmount(form.allowances, split.allowances) &&
    sameAmount(form.salary, split.salary)
  );
}

function sameAmount(input: string, amount: number | null) {
  const parsed = parseMoneyInput(input);
  if (parsed == null || amount == null) {
    return parsed == null && amount == null;
  }

  return roundMoney(parsed) === roundMoney(amount);
}

function salaryFromParts(
  current: typeof emptyForm,
  key: "basicSalary" | "allowances",
  value: string,
) {
  const next = { ...current, [key]: value };
  const pay = sumSalary(parseMoneyInput(next.basicSalary), parseMoneyInput(next.allowances));
  return {
    ...next,
    salary: pay.salary == null ? "" : String(pay.salary),
  };
}

function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function UserIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <circle cx="11" cy="8" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M4.5 18.2c1.2-2.6 3.4-3.9 6.5-3.9s5.3 1.3 6.5 3.9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 fill-current">
      <path d="M12.04 2a9.84 9.84 0 0 0-8.52 14.76L2 22l5.38-1.41A9.96 9.96 0 0 0 12.04 22 9.98 9.98 0 0 0 12.04 2Zm0 18.18a8.1 8.1 0 0 1-4.13-1.13l-.3-.18-3.19.84.85-3.1-.2-.32a8.12 8.12 0 1 1 6.97 3.89Zm4.45-6.08c-.24-.12-1.44-.71-1.66-.79-.22-.08-.38-.12-.55.12-.16.24-.63.79-.77.95-.14.16-.28.18-.53.06-.24-.12-1.03-.38-1.96-1.21a7.35 7.35 0 0 1-1.36-1.69c-.14-.24-.01-.37.11-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.55-1.32-.75-1.81-.2-.48-.4-.41-.55-.42h-.46c-.16 0-.42.06-.65.3-.22.24-.85.83-.85 2.03 0 1.19.87 2.35.99 2.51.12.16 1.71 2.61 4.14 3.66.58.25 1.03.4 1.38.51.58.18 1.11.16 1.53.1.47-.07 1.44-.59 1.64-1.16.2-.57.2-1.06.14-1.16-.06-.1-.22-.16-.46-.28Z" />
    </svg>
  );
}
