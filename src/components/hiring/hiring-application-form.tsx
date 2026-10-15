"use client";

import { useRef, useState } from "react";
import type { ConfigDocument, ConfigTextField } from "@/lib/form-config";
import { CountrySelect } from "@/components/country-select";

const fieldClass =
  "mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-950 outline-none focus:border-stone-950";
const primaryButtonClass =
  "inline-flex h-11 w-full items-center justify-center rounded-lg bg-[#063f3b] px-4 text-sm font-semibold text-white transition hover:bg-[#052f2c] disabled:cursor-not-allowed disabled:opacity-60";

type Status = "idle" | "submitting" | "success" | "error";

/**
 * Converts an image to WebP in the browser (handles iPhone HEIC + shrinks large
 * phone photos to a few KB). Non-images (PDF/doc) returned unchanged.
 */
async function toWebp(file: File): Promise<File> {
  if (!file.type.startsWith("image/") && file.type !== "") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const maxEdge = 1000; // profile photos don't need to be large
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((r) => resolve(r), "image/webp", 0.82));
    if (!blob) return file;
    const base = file.name.replace(/\.[^./\\]+$/, "") || "photo";
    return new File([blob], `${base}.webp`, { type: "image/webp" });
  } catch {
    return file;
  }
}

function FileField({ doc, file, onSelect }: { doc: ConfigDocument; file: File | null; onSelect: (f: File | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isPhoto = /photo/i.test(doc.label) || /photo/i.test(doc.field);
  return (
    <div>
      <label className="text-sm font-medium text-stone-800">
        {doc.label} {doc.required && <span className="text-red-500">*</span>}
      </label>
      {doc.help && <p className="mt-0.5 text-xs text-stone-500">{doc.help}</p>}
      <div className="mt-1.5 flex items-center gap-3">
        <button type="button" onClick={() => inputRef.current?.click()} className="inline-flex h-9 items-center rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium text-stone-800 hover:bg-stone-50">
          Choose file
        </button>
        <span className="truncate text-xs text-stone-500">{file ? file.name : "No file selected"}</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={isPhoto ? "image/*,.heic,.heif" : ".pdf,.doc,.docx,image/*"}
        className="hidden"
        onChange={(e) => onSelect(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}

export function HiringApplicationForm({
  textFields,
  documents,
}: {
  textFields: ConfigTextField[];
  documents: ConfigDocument[];
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  function setVal(name: string, v: string) {
    setValues((cur) => ({ ...cur, [name]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    // Required validation
    for (const f of textFields) {
      if (f.required && !values[f.name]?.trim()) {
        setError(`Please fill in: ${f.label}`);
        return;
      }
    }
    for (const d of documents) {
      if (d.required && !files[d.field]) {
        setError(`Please upload: ${d.label}`);
        return;
      }
    }

    setStatus("submitting");
    try {
      const fd = new FormData();
      fd.append("fields", JSON.stringify(values));
      for (const d of documents) {
        const raw = files[d.field];
        if (raw) {
          const prepared = await toWebp(raw);
          fd.append(d.field, prepared, prepared.name);
          fd.append(`${d.field}__label`, d.label);
        }
      }
      const res = await fetch("/api/hiring", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Submission failed.");
      }
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Submission failed.");
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <h2 className="text-lg font-semibold text-emerald-800">Application received</h2>
        <p className="mt-2 text-sm text-emerald-700">Thank you for applying to The Maine. Our team will review your application and be in touch.</p>
      </div>
    );
  }

  // Group fields by section (preserving order of first appearance).
  const sections: { name: string; fields: ConfigTextField[] }[] = [];
  for (const f of textFields) {
    const key = f.section || "";
    let g = sections.find((s) => s.name === key);
    if (!g) { g = { name: key, fields: [] }; sections.push(g); }
    g.fields.push(f);
  }

  const renderField = (f: ConfigTextField) => (
    <div key={f.name}>
      <label className="text-sm font-medium text-stone-800">
        {f.label} {f.required && <span className="text-red-500">*</span>}
      </label>
      {f.help && <p className="mt-0.5 text-xs text-stone-500">{f.help}</p>}

      {f.type === "textarea" ? (
        <textarea rows={3} className={fieldClass} value={values[f.name] ?? ""} onChange={(e) => setVal(f.name, e.target.value)} />
      ) : f.type === "select" ? (
        <select className={fieldClass} value={values[f.name] ?? ""} onChange={(e) => setVal(f.name, e.target.value)}>
          <option value="">Select…</option>
          {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : f.type === "country" ? (
        <div className="mt-1.5">
          <CountrySelect value={values[f.name] ?? ""} onChange={(v) => setVal(f.name, v)} />
        </div>
      ) : (
        <input
          type={f.type === "phone" ? "tel" : f.type}
          className={fieldClass}
          autoComplete={f.autoComplete}
          value={values[f.name] ?? ""}
          onChange={(e) => setVal(f.name, e.target.value)}
        />
      )}
    </div>
  );

  const renderRadioGrid = (rows: ConfigTextField[]) => {
    const options = rows[0].options ?? [];
    const prefixes = rows.map((r) => r.label.split(/\s+[—–-]\s+/));
    const shared = prefixes.every((p) => p.length > 1 && p[0] === prefixes[0][0]) ? prefixes[0][0] : null;
    return (
      <fieldset key={rows.map((r) => r.name).join("|")}>
        {shared && <legend className="text-sm font-medium text-stone-800">{shared}</legend>}
        <div className="mt-1.5 overflow-x-auto rounded-lg border border-stone-200">
          <table className="w-full min-w-[28rem] text-sm">
            <thead>
              <tr className="bg-stone-50 text-xs text-stone-500">
                <th className="px-3 py-2 text-left font-medium" />
                {options.map((o) => <th key={o} className="px-2 py-2 text-center font-medium">{o}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, index) => (
                <tr key={r.name} className="border-t border-stone-100">
                  <th scope="row" className="px-3 py-2 text-left font-medium text-stone-800">
                    {shared ? prefixes[index].slice(1).join(" — ") : r.label} {r.required && <span className="text-red-500">*</span>}
                    {r.help && <span className="block text-xs font-normal text-stone-500">{r.help}</span>}
                  </th>
                  {options.map((o) => (
                    <td key={o} className="px-2 py-2 text-center">
                      <input
                        type="radio"
                        name={r.name}
                        value={o}
                        aria-label={`${r.label}: ${o}`}
                        checked={values[r.name] === o}
                        onChange={() => setVal(r.name, o)}
                        className="size-4 cursor-pointer accent-stone-900"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </fieldset>
    );
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {sections.map((sec) => (
        <section key={sec.name} className="space-y-4">
          {sec.name && (
            <h2 className="border-b border-stone-200 pb-1.5 text-sm font-semibold uppercase tracking-wide text-stone-500">{sec.name}</h2>
          )}
          {groupRadios(sec.fields).map((item) => (Array.isArray(item) ? renderRadioGrid(item) : renderField(item)))}
        </section>
      ))}

      <div className="space-y-4 border-t border-stone-200 pt-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Documents</h2>
        {documents.map((d) => (
          <FileField key={d.field} doc={d} file={files[d.field] ?? null} onSelect={(file) => setFiles((cur) => ({ ...cur, [d.field]: file }))} />
        ))}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <button type="submit" className={primaryButtonClass} disabled={status === "submitting"}>
        {status === "submitting" ? "Submitting…" : "Submit application"}
      </button>
    </form>
  );
}

/** Groups consecutive radio questions that share the same choices into one grid. */
function groupRadios(fields: ConfigTextField[]): (ConfigTextField | ConfigTextField[])[] {
  const out: (ConfigTextField | ConfigTextField[])[] = [];
  for (const f of fields) {
    if (f.type !== "radio") {
      out.push(f);
      continue;
    }
    const last = out.at(-1);
    if (Array.isArray(last) && (last[0].options ?? []).join("|") === (f.options ?? []).join("|")) last.push(f);
    else out.push([f]);
  }
  return out;
}
