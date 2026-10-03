"use client";

import { useMemo, useRef, useState } from "react";
import type { ConfigDocument, ConfigTextField } from "@/lib/form-config";
import { countryDialList, type CountryDial } from "@/lib/countries";

const fieldClass =
  "mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-950 outline-none focus:border-stone-950";
const primaryButtonClass =
  "inline-flex h-11 w-full items-center justify-center rounded-lg bg-[#063f3b] px-4 text-sm font-semibold text-white transition hover:bg-[#052f2c] disabled:cursor-not-allowed disabled:opacity-60";

type Status = "idle" | "submitting" | "success" | "error";

/**
 * Converts an image file to JPEG in the browser. This handles iPhone HEIC/HEIF
 * photos and shrinks large images so uploads succeed on mobile networks.
 * Non-image files (e.g. PDF) are returned unchanged.
 */
async function toUploadableFile(file: File): Promise<File> {
  if (!file.type.startsWith("image/") && file.type !== "") {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const maxEdge = 2000;
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      return file;
    }
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((result) => resolve(result), "image/jpeg", 0.9),
    );
    if (!blob) {
      return file;
    }

    const baseName = file.name.replace(/\.[^./\\]+$/, "") || "image";
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
  } catch {
    // If conversion fails (e.g. unsupported HEIC decode), fall back to original.
    return file;
  }
}

function FileField({
  doc,
  file,
  onSelect,
}: {
  doc: ConfigDocument;
  file: File | null;
  onSelect: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <p className="text-sm font-medium text-stone-800">
        {doc.label}
        {doc.required ? <span className="text-red-700"> *</span> : null}
      </p>
      {doc.help ? (
        <p className="mt-0.5 text-xs text-stone-500">{doc.help}</p>
      ) : null}
      <div className="mt-1.5 flex items-center gap-2">
        <button
          type="button"
          className="inline-flex h-9 items-center justify-center rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium text-stone-800 hover:bg-stone-50"
          onClick={() => inputRef.current?.click()}
        >
          {file ? "Change file" : "Choose file"}
        </button>
        <span className="truncate text-xs text-stone-500">
          {file ? file.name : "No file selected"}
        </span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.heic,.heif,application/pdf"
        className="sr-only"
        onChange={(event) => {
          onSelect(event.target.files?.[0] ?? null);
          event.target.value = "";
        }}
      />
    </div>
  );
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const selectClass =
  "w-full rounded-lg border border-stone-300 bg-white px-2 py-2 text-sm text-stone-950 outline-none focus:border-stone-950";

/**
 * Date entry as three dropdowns in day / month / year order (dd/mm/yyyy),
 * independent of browser locale. Stores the value as an ISO yyyy-MM-dd string.
 */
function DateField({
  label,
  required,
  help,
  value,
  minYear,
  maxYear,
  onChange,
}: {
  label: string;
  required: boolean;
  help?: string;
  value: string;
  minYear: number;
  maxYear: number;
  onChange: (iso: string) => void;
}) {
  // Hold each part independently so a partial selection is never wiped.
  const [parts, setParts] = useState<{ day: string; month: string; year: string }>(
    () => {
      if (value) {
        const [y, m, d] = value.split("-");
        return { day: String(Number(d)), month: String(Number(m)), year: y };
      }
      return { day: "", month: "", year: "" };
    },
  );

  const years: number[] = [];
  for (let y = maxYear; y >= minYear; y -= 1) {
    years.push(y);
  }
  const daysInMonth =
    parts.year && parts.month
      ? new Date(Number(parts.year), Number(parts.month), 0).getDate()
      : 31;

  function update(next: { day: string; month: string; year: string }) {
    setParts(next);
    if (next.day && next.month && next.year) {
      onChange(
        `${next.year}-${next.month.padStart(2, "0")}-${next.day.padStart(2, "0")}`,
      );
    } else {
      // Not yet complete: clear the emitted ISO value so required validation
      // still blocks submit, but keep the user's partial selections visible.
      onChange("");
    }
  }

  return (
    <div className="block text-sm font-medium text-stone-800">
      {label}
      {required ? <span className="text-red-700"> *</span> : null}
      <div className="mt-1.5 grid grid-cols-3 gap-2">
        <select
          aria-label={`${label} day`}
          value={parts.day}
          required={required}
          className={selectClass}
          onChange={(event) => update({ ...parts, day: event.target.value })}
        >
          <option value="">Day</option>
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select
          aria-label={`${label} month`}
          value={parts.month}
          required={required}
          className={selectClass}
          onChange={(event) => update({ ...parts, month: event.target.value })}
        >
          <option value="">Month</option>
          {MONTHS.map((name, i) => (
            <option key={name} value={i + 1}>
              {name}
            </option>
          ))}
        </select>
        <select
          aria-label={`${label} year`}
          value={parts.year}
          required={required}
          className={selectClass}
          onChange={(event) => update({ ...parts, year: event.target.value })}
        >
          <option value="">Year</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
      {help ? (
        <span className="mt-1 block text-xs font-normal text-stone-500">{help}</span>
      ) : null}
    </div>
  );
}

// All countries, with UAE and other common staff nationalities pinned to the
// top for quick selection. UAE (+971) is the default.
const DIAL_LIST = (() => {
  const all = countryDialList();
  const pinnedIso = ["AE", "IN", "PH", "PK", "NP", "GB", "EG"];
  const pinned = pinnedIso
    .map((iso) => all.find((c) => c.iso === iso))
    .filter((c): c is CountryDial => Boolean(c));
  const rest = all.filter((c) => !pinnedIso.includes(c.iso));
  return [...pinned, ...rest];
})();

/**
 * Phone input with a country-code picker. Stores the full value including the
 * dial code (e.g. "+971 501234567"). Defaults to UAE (+971).
 */
function PhoneField({
  label,
  required,
  onChange,
  help,
}: {
  label: string;
  required: boolean;
  onChange: (full: string) => void;
  help?: string;
}) {
  // Default to UAE. Keyed by ISO so shared dial codes (e.g. +1) stay distinct.
  const [iso, setIso] = useState<string>("AE");
  const [local, setLocal] = useState<string>("");

  const selected = DIAL_LIST.find((c) => c.iso === iso) ?? DIAL_LIST[0];

  function emit(nextDial: string, nextLocal: string) {
    const trimmed = nextLocal.trim();
    onChange(trimmed ? `${nextDial} ${trimmed}` : "");
  }

  return (
    <label className="block text-sm font-medium text-stone-800">
      {label}
      {required ? <span className="text-red-700"> *</span> : null}
      <div className="mt-1.5 flex gap-2">
        <select
          aria-label={`${label} country code`}
          value={iso}
          className="w-28 shrink-0 rounded-lg border border-stone-300 bg-white px-2 py-2 text-sm text-stone-950 outline-none focus:border-stone-950"
          onChange={(event) => {
            setIso(event.target.value);
            const next = DIAL_LIST.find((c) => c.iso === event.target.value);
            emit(next?.dial ?? "+971", local);
          }}
        >
          {DIAL_LIST.map((c: CountryDial) => (
            <option key={c.iso} value={c.iso}>
              {c.flag} {c.dial}
            </option>
          ))}
        </select>
        <input
          type="tel"
          inputMode="tel"
          required={required}
          value={local}
          placeholder="50 123 4567"
          className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-950 outline-none focus:border-stone-950"
          onChange={(event) => {
            setLocal(event.target.value);
            emit(selected?.dial ?? "+971", event.target.value);
          }}
        />
      </div>
      {help ? (
        <span className="mt-1 block text-xs font-normal text-stone-500">{help}</span>
      ) : null}
    </label>
  );
}

export function StaffIntakeForm({
  textFields,
  documents,
}: {
  textFields: ConfigTextField[];
  documents: ConfigDocument[];
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(textFields.map((field) => [field.name, ""])),
  );
  const [files, setFiles] = useState<Record<string, File | null>>(() =>
    Object.fromEntries(documents.map((doc) => [doc.field, null])),
  );
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  const currentYear = useMemo(() => new Date().getFullYear(), []);

  function setValue(name: string, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  function setFile(field: string, file: File | null) {
    setFiles((current) => ({ ...current, [field]: file }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setMessage("");

    try {
      const formData = new FormData();
      for (const field of textFields) {
        formData.append(field.name, values[field.name] ?? "");
      }
      for (const doc of documents) {
        const file = files[doc.field];
        if (file) {
          const uploadable = await toUploadableFile(file);
          formData.append(doc.field, uploadable, uploadable.name);
        }
      }

      const response = await fetch("/api/staff-intake", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        setStatus("error");
        setMessage(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      setStatus("success");
      setMessage("");
    } catch {
      setStatus("error");
      setMessage("Could not submit the form. Check your connection and try again.");
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M5 12.5l4 4 10-10"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h2 className="mt-4 text-lg font-semibold text-stone-950">Thank you</h2>
        <p className="mt-1 text-sm text-stone-600">
          Your details and documents have been submitted to HR.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6"
    >
      {textFields.map((field) => {
        if (field.type === "date") {
          // DOB: past only. Joining/expiry dates: allow a wide future range.
          const minYear = field.name === "dateOfBirth" ? currentYear - 80 : currentYear - 20;
          const maxYear = field.name === "dateOfBirth" ? currentYear : currentYear + 30;
          return (
            <DateField
              key={field.name}
              label={field.label}
              required={field.required}
              help={field.help}
              value={values[field.name] ?? ""}
              minYear={minYear}
              maxYear={maxYear}
              onChange={(iso) => setValue(field.name, iso)}
            />
          );
        }

        if (field.type === "phone") {
          return (
            <PhoneField
              key={field.name}
              label={field.label}
              required={field.required}
              help={field.help}
              onChange={(full) => setValue(field.name, full)}
            />
          );
        }

        return (
          <label key={field.name} className="block text-sm font-medium text-stone-800">
            {field.label}
            {field.required ? <span className="text-red-700"> *</span> : null}
            <input
              type={field.type === "email" ? "email" : "text"}
              value={values[field.name] ?? ""}
              onChange={(event) => setValue(field.name, event.target.value)}
              required={field.required}
              autoComplete={field.autoComplete}
              className={fieldClass}
            />
            {field.help ? (
              <span className="mt-1 block text-xs font-normal text-stone-500">{field.help}</span>
            ) : null}
          </label>
        );
      })}

      <div className="space-y-4 border-t border-stone-200 pt-4">
        <p className="text-sm font-semibold text-stone-900">Documents</p>
        {documents.map((doc) => (
          <FileField
            key={doc.field}
            doc={doc}
            file={files[doc.field]}
            onSelect={(file) => setFile(doc.field, file)}
          />
        ))}
      </div>

      {status === "error" && message ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>
      ) : null}

      <button type="submit" className={primaryButtonClass} disabled={status === "submitting"}>
        {status === "submitting" ? "Submitting…" : "Submit details"}
      </button>
      <p className="text-center text-xs text-stone-400">All fields marked * are required.</p>
    </form>
  );
}
