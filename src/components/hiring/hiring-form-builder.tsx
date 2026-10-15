"use client";

import { Fragment, useRef, useState } from "react";
import { saveHiringConfigAction } from "@/app/(app)/hiringform/actions";
import type {
  ConfigDocument,
  ConfigTextField,
  FieldType,
  FormConfig,
  LandingConfig,
} from "@/lib/form-config";

const fieldClass =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-950 outline-none focus:border-stone-950";
const labelFieldClass =
  "w-full rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-stone-950 outline-none focus:border-stone-950";
const btn =
  "inline-flex h-9 items-center justify-center rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium text-stone-800 hover:bg-stone-50";
const primary =
  "inline-flex h-9 items-center justify-center rounded-lg bg-[#063f3b] px-4 text-sm font-semibold text-white hover:bg-[#052f2c] disabled:opacity-60";

const FIELD_TYPES: FieldType[] = ["text", "email", "phone", "date", "textarea", "select", "radio", "country"];

export function HiringFormBuilder({ config, landing: initialLanding, version }: { config: FormConfig; landing: LandingConfig; version: string | null }) {
  const [savedVersion, setSavedVersion] = useState(version);
  const [landing, setLanding] = useState<LandingConfig>(initialLanding);
  const [fields, setFields] = useState<ConfigTextField[]>(config.textFields);
  const [docs, setDocs] = useState<ConfigDocument[]>(config.documents);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");

  function updateField(i: number, patch: Partial<ConfigTextField>) {
    setFields((cur) => cur.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }
  function moveField(i: number, dir: -1 | 1) {
    setFields((cur) => {
      const next = [...cur];
      const j = i + dir;
      if (j < 0 || j >= next.length) return cur;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function removeField(i: number) {
    setFields((cur) => cur.filter((_, idx) => idx !== i));
  }
  function addField() {
    const n = fields.length + 1;
    setFields((cur) => [
      ...cur,
      { name: `field${n}`, label: `New field ${n}`, type: "text", required: false, section: cur.at(-1)?.section },
    ]);
  }

  function updateDoc(i: number, patch: Partial<ConfigDocument>) {
    setDocs((cur) => cur.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }
  function removeDoc(i: number) {
    setDocs((cur) => cur.filter((_, idx) => idx !== i));
  }
  function addDoc() {
    const n = docs.length + 1;
    setDocs((cur) => [
      ...cur,
      { field: `document${n}`, label: `New document ${n}`, required: false },
    ]);
  }

  async function save() {
    setStatus("saving");
    setMessage("");
    const result = await saveHiringConfigAction({ textFields: fields, documents: docs, naming: config.naming, landing }, savedVersion);
    if (result.ok) {
      setSavedVersion(result.version ?? savedVersion);
      setStatus("saved");
    } else {
      setStatus("error");
      setMessage(result.error ?? "Could not save.");
    }
  }

  const dateFields = fields.filter((f) => f.type === "date");

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-10">
      <div className="mx-auto w-full max-w-4xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-stone-950">Form Builder</h1>
          <p className="text-sm text-stone-500">
            Edit the fields and documents shown on the public hiring form.
          </p>
        </div>
        <button className={primary} onClick={save} disabled={status === "saving"}>
          {status === "saving" ? "Saving…" : "Save changes"}
        </button>
      </div>

      <ShareLink />

      {status === "saved" ? (
        <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Saved. The public hiring form is updated.
        </p>
      ) : null}
      {status === "error" ? (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>
      ) : null}

      <LandingEditor landing={landing} onChange={(patch) => setLanding((cur) => ({ ...cur, ...patch }))} />

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold text-stone-900">Fields</h2>
        <div className="space-y-2">
          {fields.map((f, i) => (
            <Fragment key={i}>
              {i === 0 && fields.some((field, index) => index > 0 && field.pageBreak) && <PageDivider page={1} />}
              {i > 0 && (f.pageBreak ? (
                <PageDivider
                  page={fields.slice(1, i + 1).filter((field) => field.pageBreak).length + 1}
                  onRemove={() => updateField(i, { pageBreak: undefined })}
                />
              ) : (
                <div className="group/insert relative -my-1 flex h-3 items-center justify-center">
                  <button
                    type="button"
                    onClick={() => updateField(i, { pageBreak: true })}
                    className="relative z-10 rounded-full border border-dashed border-stone-300 bg-white px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-500 opacity-0 transition hover:border-[#063f3b] hover:text-[#063f3b] focus-visible:opacity-100 group-hover/insert:opacity-100"
                  >
                    + Page break
                  </button>
                </div>
              ))}
              {(i === 0 || fields[i - 1].section !== f.section) && f.section && (
                <h3 className="mt-4 border-b border-stone-200 pb-1 text-xs font-semibold uppercase tracking-wide text-[#063f3b] first:mt-0">
                  {f.section}
                </h3>
              )}
            <div
              className="grid grid-cols-1 gap-2 rounded-xl border border-stone-200 bg-white p-3 sm:grid-cols-[1fr_1fr_auto_auto_auto]"
            >
              <input
                className={labelFieldClass}
                value={f.label}
                placeholder="Label"
                onChange={(e) => updateField(i, { label: e.target.value })}
              />
              <input
                className={fieldClass}
                value={f.name}
                placeholder="field_key"
                onChange={(e) => updateField(i, { name: e.target.value.replace(/\s+/g, "") })}
              />
              <select
                className={fieldClass}
                value={f.type}
                onChange={(e) => updateField(i, { type: e.target.value as FieldType })}
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <div className="flex flex-col justify-center gap-0.5 px-2 text-xs text-stone-600">
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={f.required}
                    onChange={(e) => updateField(i, { required: e.target.checked })}
                  />
                  Required
                </label>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" className={btn} onClick={() => moveField(i, -1)} aria-label="Move up">↑</button>
                <button type="button" className={btn} onClick={() => moveField(i, 1)} aria-label="Move down">↓</button>
                <button type="button" className={btn} onClick={() => removeField(i)} aria-label="Remove">✕</button>
              </div>
              <input
                className={`${fieldClass} sm:col-span-5`}
                value={f.help ?? ""}
                placeholder="Instruction text shown under the field (optional)"
                onChange={(e) => updateField(i, { help: e.target.value })}
              />
              {(f.type === "select" || f.type === "radio") && (
                <div className="space-y-1.5 sm:col-span-5">
                  <OptionTags
                    options={f.options ?? []}
                    locked={f.optionsSource === "directory-positions"}
                    onChange={(options) => updateField(i, { options })}
                  />
                  <label className="flex items-center gap-1.5 text-xs text-stone-600">
                    <input
                      type="checkbox"
                      checked={f.optionsSource === "directory-positions"}
                      onChange={(e) =>
                        updateField(i, e.target.checked
                          ? { optionsSource: "directory-positions", optionsDepartment: "Culinary" }
                          : { optionsSource: undefined, optionsDepartment: undefined })
                      }
                    />
                    Use Staff Directory positions{f.optionsDepartment ? ` (${f.optionsDepartment})` : ""}, in directory order
                    {f.optionsSource === "directory-positions" && <span className="text-stone-400">— edit them in Settings; changes appear on the form automatically</span>}
                  </label>
                </div>
              )}
            </div>
            </Fragment>
          ))}
        </div>
        <button type="button" className={`${btn} mt-2`} onClick={addField}>
          + Add field
        </button>
      </section>

      <section>
        {fields.some((field, index) => index > 0 && field.pageBreak) && (
          <PageDivider page={fields.filter((field, index) => index > 0 && field.pageBreak).length + 2} />
        )}
        <h2 className="mb-2 text-sm font-semibold text-stone-900">Documents</h2>
        <div className="space-y-2">
          {docs.map((d, i) => (
            <div
              key={i}
              className="grid grid-cols-1 gap-2 rounded-xl border border-stone-200 bg-white p-3 sm:grid-cols-[1fr_1fr_1fr_auto_auto]"
            >
              <input
                className={fieldClass}
                value={d.label}
                placeholder="Label (filename prefix)"
                onChange={(e) => updateDoc(i, { label: e.target.value })}
              />
              <input
                className={fieldClass}
                value={d.field}
                placeholder="field_key"
                onChange={(e) => updateDoc(i, { field: e.target.value.replace(/\s+/g, "") })}
              />
              <select
                className={fieldClass}
                value={d.dateField ?? ""}
                onChange={(e) => updateDoc(i, { dateField: e.target.value || undefined })}
              >
                <option value="">Date in filename: upload date</option>
                {dateFields.map((df) => (
                  <option key={df.name} value={df.name}>
                    Date in filename: {df.label}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 px-2 text-xs text-stone-600">
                <input
                  type="checkbox"
                  checked={d.required}
                  onChange={(e) => updateDoc(i, { required: e.target.checked })}
                />
                Required
              </label>
              <button type="button" className={btn} onClick={() => removeDoc(i)} aria-label="Remove">✕</button>
              <input
                className={`${fieldClass} sm:col-span-5`}
                value={d.help ?? ""}
                placeholder="Instruction text shown under the document (optional)"
                onChange={(e) => updateDoc(i, { help: e.target.value })}
              />
            </div>
          ))}
        </div>
        <button type="button" className={`${btn} mt-2`} onClick={addDoc}>
          + Add document
        </button>
      </section>

      <SuccessEditor landing={landing} onChange={(patch) => setLanding((cur) => ({ ...cur, ...patch }))} />

      <div className="mt-6 flex justify-end">
        <button className={primary} onClick={save} disabled={status === "saving"}>
          {status === "saving" ? "Saving…" : "Save changes"}
        </button>
      </div>
      </div>
    </div>
  );
}

function ShareLink() {
  const [copied, setCopied] = useState(false);
  const [url] = useState(() =>
    typeof window !== "undefined" ? `${window.location.origin}/hiring-details` : "/hiring-details",
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <div className="mb-5 rounded-xl border border-stone-200 bg-stone-50 p-4">
      <p className="text-sm font-semibold text-stone-900">Shareable hiring form link</p>
      <p className="mt-0.5 text-xs text-stone-500">
        Send this link to applicants. No login needed — they fill in their details and upload their CV and photo.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 font-mono text-xs text-stone-800"
        />
        <button
          type="button"
          onClick={copy}
          className="inline-flex h-9 shrink-0 items-center rounded-lg bg-[#063f3b] px-3 text-sm font-semibold text-white hover:bg-[#052f2c]"
        >
          {copied ? "Copied!" : "Copy link"}
        </button>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-9 shrink-0 items-center rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium text-stone-800 hover:bg-stone-100"
        >
          Open
        </a>
      </div>
    </div>
  );
}

const DEFAULT_LOGO = "/the-maine-seal.png";
const DEFAULT_HEADER_LOGO = "/the-maine-logo.png";

/** Shrinks an uploaded logo so it can be stored inside the form config. */
async function logoDataUrl(file: File): Promise<string> {
  if (file.type === "image/svg+xml") {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 800 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const png = canvas.toDataURL("image/png");
  return png.length < 300_000 ? png : canvas.toDataURL("image/webp", 0.9);
}

function ImageField({ label, help, value, defaultValue, onChange }: { label: string; help: string; value: string; defaultValue: string; onChange: (value: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");

  async function pick(file: File | undefined) {
    if (!file) return;
    setError("");
    try {
      onChange(await logoDataUrl(file));
    } catch {
      setError("Could not read that image. Try a PNG, JPG or SVG.");
    }
  }

  return (
    <div className="min-w-0 rounded-lg border border-stone-200 p-3">
      <p className="text-xs font-medium text-stone-600">{label}</p>
      <p className="text-[11px] text-stone-400">{help}</p>
      <div className="mt-2 flex h-24 items-center justify-center overflow-hidden rounded-lg border border-stone-200 bg-stone-100 p-2">
        {value ? (
          <img src={value} alt={label} className="block max-h-full max-w-full object-contain mix-blend-multiply" />
        ) : (
          <span className="text-xs text-stone-400">No image</span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" className={btn} onClick={() => fileRef.current?.click()}>Change</button>
        {value && <button type="button" className={btn} onClick={() => onChange("")}>Remove</button>}
        {value !== defaultValue && (
          <button type="button" className="text-xs font-medium text-stone-500 underline hover:text-stone-900" onClick={() => onChange(defaultValue)}>
            Use default
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }}
        />
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function LandingEditor({ landing, onChange }: { landing: LandingConfig; onChange: (patch: Partial<LandingConfig>) => void }) {
  return (
    <section className="mb-8">
      <h2 className="mb-2 text-sm font-semibold text-stone-900">Landing page</h2>
      <div className="space-y-3 rounded-xl border border-stone-200 bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <ImageField
            label="Logo"
            help="Top of the welcome and thank-you screens"
            value={landing.headerLogo}
            defaultValue={DEFAULT_HEADER_LOGO}
            onChange={(headerLogo) => onChange({ headerLogo })}
          />
          <ImageField
            label="Footer"
            help="Bottom of every page"
            value={landing.logo}
            defaultValue={DEFAULT_LOGO}
            onChange={(logo) => onChange({ logo })}
          />
        </div>
        <label className="block">
          <span className="text-xs font-medium text-stone-600">Title</span>
          <input className={`${labelFieldClass} mt-1`} value={landing.title} onChange={(e) => onChange({ title: e.target.value })} />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-stone-600">Introduction</span>
          <textarea rows={3} className={`${fieldClass} mt-1`} value={landing.intro} onChange={(e) => onChange({ intro: e.target.value })} />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-stone-600">Headline (large text)</span>
          <textarea rows={2} className={`${fieldClass} mt-1`} value={landing.headline} onChange={(e) => onChange({ headline: e.target.value })} />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-stone-600">Closing note</span>
          <textarea rows={2} className={`${fieldClass} mt-1`} value={landing.note} onChange={(e) => onChange({ note: e.target.value })} />
        </label>

        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/50 p-3">
          <p className="text-xs font-semibold text-amber-800">Disclaimer screen (shown after Welcome)</p>
          <p className="mt-0.5 text-[11px] text-amber-700">Applicants see this alert and press Continue before the form. Leave both empty to skip it.</p>
          <label className="mt-2 block">
            <span className="text-xs font-medium text-stone-600">Disclaimer title</span>
            <input className={`${labelFieldClass} mt-1`} value={landing.disclaimerTitle} onChange={(e) => onChange({ disclaimerTitle: e.target.value })} />
          </label>
          <label className="mt-2 block">
            <span className="text-xs font-medium text-stone-600">Disclaimer text</span>
            <textarea rows={4} className={`${fieldClass} mt-1`} value={landing.disclaimerBody} onChange={(e) => onChange({ disclaimerBody: e.target.value })} />
          </label>
        </div>

        <p className="text-xs text-stone-400">Leave a box empty to hide it. The step list and documents list are added automatically.</p>
      </div>
    </section>
  );
}

function SuccessEditor({ landing, onChange }: { landing: LandingConfig; onChange: (patch: Partial<LandingConfig>) => void }) {
  return (
    <section className="mt-8">
      <h2 className="mb-2 text-sm font-semibold text-stone-900">After submitting</h2>
      <p className="mb-2 text-xs text-stone-500">The thank-you screen candidates see once their application is sent.</p>
      <div className="space-y-3 rounded-xl border border-stone-200 bg-white p-4">
        <label className="block">
          <span className="text-xs font-medium text-stone-600">Title</span>
          <input className={`${labelFieldClass} mt-1`} value={landing.successTitle} onChange={(e) => onChange({ successTitle: e.target.value })} />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-stone-600">Thank-you message</span>
          <textarea rows={2} className={`${fieldClass} mt-1`} value={landing.successMessage} onChange={(e) => onChange({ successMessage: e.target.value })} />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-stone-600">Follow-up note</span>
          <textarea rows={2} className={`${fieldClass} mt-1`} value={landing.successNote} onChange={(e) => onChange({ successNote: e.target.value })} />
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          {([
            ["website", "Website", "https://…"],
            ["instagram", "Instagram", "https://instagram.com/…"],
            ["facebook", "Facebook", "https://facebook.com/…"],
          ] as const).map(([key, label, placeholder]) => (
            <label key={key} className="block">
              <span className="text-xs font-medium text-stone-600">{label} link</span>
              <input type="url" className={`${fieldClass} mt-1`} value={landing[key]} placeholder={placeholder} onChange={(e) => onChange({ [key]: e.target.value.trim() })} />
            </label>
          ))}
        </div>
        <p className="text-xs text-stone-400">Each link appears as a button on the thank-you screen. Leave it empty to hide that button.</p>
      </div>
    </section>
  );
}

function OptionTags({ options, locked, onChange }: { options: string[]; locked: boolean; onChange: (options: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const additions = raw.split(",").map((o) => o.trim()).filter((o) => o && !options.includes(o));
    if (additions.length) onChange([...options, ...additions]);
    setDraft("");
  };
  return (
    <div className={`flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border px-2 py-1.5 ${locked ? "border-stone-200 bg-stone-50" : "border-stone-300 bg-white focus-within:border-stone-950"}`}>
      {options.map((option) => (
        <span key={option} className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-stone-100 py-0.5 pr-1.5 pl-2.5 text-xs font-medium text-stone-800">
          {option}
          {!locked && (
            <button type="button" onClick={() => onChange(options.filter((o) => o !== option))} aria-label={`Remove ${option}`} className="text-stone-400 hover:text-stone-900">
              ×
            </button>
          )}
        </span>
      ))}
      {!locked && (
        <input
          value={draft}
          onChange={(e) => (e.target.value.includes(",") ? add(e.target.value) : setDraft(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && !draft && options.length) {
              onChange(options.slice(0, -1));
            }
          }}
          onBlur={() => draft.trim() && add(draft)}
          placeholder={options.length ? "Add choice…" : "Type a choice and press Enter"}
          className="min-w-32 flex-1 bg-transparent px-1 py-0.5 text-sm outline-none"
        />
      )}
    </div>
  );
}

function PageDivider({ page, onRemove }: { page: number; onRemove?: () => void }) {
  return (
    <div className={`flex items-center gap-3 ${page > 1 ? "pt-6 pb-2" : "pb-2"}`}>
      <span className="h-0.5 flex-1 rounded-full bg-[#063f3b]" />
      <span className="inline-flex items-center gap-2 rounded-full bg-[#063f3b] px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
        Page {page}
        {onRemove && (
          <button type="button" onClick={onRemove} aria-label={`Remove page break before page ${page}`} title="Remove this page break" className="text-white/70 hover:text-white">
            ×
          </button>
        )}
      </span>
      <span className="h-0.5 flex-1 rounded-full bg-[#063f3b]" />
    </div>
  );
}
