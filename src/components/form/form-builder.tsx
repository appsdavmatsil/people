"use client";

import { useState } from "react";
import { saveFormConfigAction } from "@/app/(app)/form/actions";
import type {
  ConfigDocument,
  ConfigTextField,
  FieldType,
  FormConfig,
} from "@/lib/form-config";

const fieldClass =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-950 outline-none focus:border-stone-950";
const btn =
  "inline-flex h-9 items-center justify-center rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium text-stone-800 hover:bg-stone-50";
const primary =
  "inline-flex h-9 items-center justify-center rounded-lg bg-[#063f3b] px-4 text-sm font-semibold text-white hover:bg-[#052f2c] disabled:opacity-60";

const FIELD_TYPES: FieldType[] = ["text", "email", "phone", "date"];

export function FormBuilder({ config }: { config: FormConfig }) {
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
      { name: `field${n}`, label: `New field ${n}`, type: "text", required: false },
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
    const result = await saveFormConfigAction({ textFields: fields, documents: docs, naming: config.naming });
    if (result.ok) {
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
            Edit the fields and documents shown on the public staff form.
          </p>
        </div>
        <button className={primary} onClick={save} disabled={status === "saving"}>
          {status === "saving" ? "Saving…" : "Save changes"}
        </button>
      </div>

      <ShareLink />

      {status === "saved" ? (
        <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Saved. The public form is updated.
        </p>
      ) : null}
      {status === "error" ? (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>
      ) : null}

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold text-stone-900">Fields</h2>
        <div className="space-y-2">
          {fields.map((f, i) => (
            <div
              key={i}
              className="grid grid-cols-1 gap-2 rounded-xl border border-stone-200 bg-white p-3 sm:grid-cols-[1fr_1fr_auto_auto_auto]"
            >
              <input
                className={fieldClass}
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
              <label className="flex items-center gap-1.5 px-2 text-xs text-stone-600">
                <input
                  type="checkbox"
                  checked={f.required}
                  onChange={(e) => updateField(i, { required: e.target.checked })}
                />
                Required
              </label>
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
            </div>
          ))}
        </div>
        <button type="button" className={`${btn} mt-2`} onClick={addField}>
          + Add field
        </button>
      </section>

      <section>
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
      </div>
    </div>
  );
}

function ShareLink() {
  const [copied, setCopied] = useState(false);
  const [url] = useState(() =>
    typeof window !== "undefined" ? `${window.location.origin}/staff-details` : "/staff-details",
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
      <p className="text-sm font-semibold text-stone-900">Shareable form link</p>
      <p className="mt-0.5 text-xs text-stone-500">
        Send this link to staff. No login needed — they fill in their details and upload documents.
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
