"use client";

import { useRef, useState } from "react";
import type { ConfigDocument, ConfigTextField, LandingConfig } from "@/lib/form-config";
import { CountrySelect } from "@/components/country-select";
import { PhoneNumberInput } from "@/components/phone-number-input";

const fieldClass =
  "mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-950 outline-none focus:border-stone-950";
const primaryButtonClass =
  "inline-flex h-11 w-full items-center justify-center rounded-lg bg-[#063f3b] px-4 text-sm font-semibold text-white transition hover:bg-[#052f2c] disabled:cursor-not-allowed disabled:opacity-60";

type Status = "idle" | "submitting" | "success" | "error";

/** Hosting rejects request bodies over ~4.5 MB, so all uploads together must stay under this. */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const tooLargeMessage = "Your files are too large to send together (4 MB max in total). Please upload a smaller or compressed version — for a PDF you can use a free compressor such as ilovepdf.com.";

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

function SocialIcon({ name }: { name: string }) {
  if (name === "Instagram") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-5">
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" />
      </svg>
    );
  }
  if (name === "Facebook") {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="size-5">
        <path d="M14 8.5V6.8c0-.8.2-1.3 1.4-1.3H17V2.2C16.6 2.1 15.5 2 14.3 2 11.7 2 10 3.6 10 6.4v2.1H7.3V12H10v10h4V12h2.8l.4-3.5H14Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-5">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z" />
    </svg>
  );
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
        <span className="truncate text-xs text-stone-500">{file ? `${file.name} · ${megabytes(file.size)}` : "No file selected"}</span>
        {file && (
          <button type="button" onClick={() => { onSelect(null); if (inputRef.current) inputRef.current.value = ""; }} className="shrink-0 text-xs text-stone-400 hover:text-stone-800" aria-label={`Remove ${doc.label}`}>
            Remove
          </button>
        )}
      </div>
      {file && !file.type.startsWith("image/") && file.size > MAX_UPLOAD_BYTES && (
        <p className="mt-1 text-xs font-medium text-red-600">This file is {megabytes(file.size)} — the limit is 4 MB. Please upload a smaller or compressed version.</p>
      )}
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
  landing,
  previewSuccess = false,
}: {
  textFields: ConfigTextField[];
  documents: ConfigDocument[];
  landing: LandingConfig;
  /** Opens straight on the thank-you screen, for checking it without submitting. */
  previewSuccess?: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [status, setStatus] = useState<Status>(previewSuccess ? "success" : "idle");
  const [error, setError] = useState("");
  const [step, setStep] = useState(0);
  const [started, setStarted] = useState(false);
  const [stage, setStage] = useState<"welcome" | "disclaimer">("welcome");
  const [showMissing, setShowMissing] = useState(false);
  const formTop = useRef<HTMLDivElement>(null);

  const pages: ConfigTextField[][] = [];
  for (const f of textFields) {
    if (pages.length === 0 || (f.pageBreak && pages.at(-1)!.length > 0)) pages.push([]);
    pages.at(-1)!.push(f);
  }
  if (pages.length === 0) pages.push([]);
  if (pages.length > 1 && documents.length > 0) pages.push([]);
  const pageTitles = pages.map((page) => (page.length ? page[0].section || "Details" : "Documents"));
  const lastStep = pages.length - 1;
  const currentStep = Math.min(step, lastStep);

  const isEmpty = (f: ConfigTextField) => f.required && !values[f.name]?.trim();
  const missingByStep = pages
    .map((page, index) => ({
      step: index,
      labels: [
        ...page.filter(isEmpty).map((f) => f.label),
        ...(index === lastStep ? documents.filter((d) => d.required && !files[d.field]).map((d) => d.label) : []),
      ],
    }))
    .filter((group) => group.labels.length > 0);

  function goTo(next: number) {
    setError("");
    setStep(next);
    requestAnimationFrame(() => formTop.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function setVal(name: string, v: string) {
    setValues((cur) => ({ ...cur, [name]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (currentStep < lastStep) {
      goTo(currentStep + 1);
      return;
    }

    if (missingByStep.length > 0) {
      setShowMissing(true);
      return;
    }

    setStatus("submitting");
    try {
      const fd = new FormData();
      fd.append("fields", JSON.stringify(values));
      let totalBytes = 0;
      for (const d of documents) {
        const raw = files[d.field];
        if (raw) {
          const prepared = await toWebp(raw);
          fd.append(d.field, prepared, prepared.name);
          fd.append(`${d.field}__label`, d.label);
          totalBytes += prepared.size;
        }
      }
      if (totalBytes > MAX_UPLOAD_BYTES) {
        setStatus("error");
        setError(`${tooLargeMessage} (Currently ${megabytes(totalBytes)}.)`);
        return;
      }
      const res = await fetch("/api/hiring", { method: "POST", body: fd });
      if (res.status === 413) throw new Error(tooLargeMessage);
      const json = await res.json().catch(() => ({ ok: false, error: "Submission failed. Please try again." }));
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Submission failed.");
      }
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Submission failed.");
    }
  }

  const header = landing.headerLogo ? (
    <h1>
      <img src={landing.headerLogo} alt="The Maine" className="mx-auto h-auto max-h-32 w-56 object-contain mix-blend-multiply" />
    </h1>
  ) : (
    <h1 className="text-center text-2xl font-semibold text-stone-950">Job Application Form</h1>
  );

  if (status === "success") {
    const links = [
      { label: "Website", href: landing.website },
      { label: "Instagram", href: landing.instagram },
      { label: "Facebook", href: landing.facebook },
    ].filter((link) => link.href.trim());
    return (
      <div className="space-y-6">
        {header}
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white text-center shadow-sm">
          <div className="bg-[#063f3b] px-6 py-8 text-white">
            <span className="mx-auto grid size-12 place-items-center rounded-full bg-white/15">
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="size-6">
                <path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.58l7.3-7.3a1 1 0 0 1 1.4 0Z" clipRule="evenodd" />
              </svg>
            </span>
            {landing.successTitle && <h2 className="mt-4 text-xl font-semibold">{landing.successTitle}</h2>}
            {landing.successMessage && <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-white/85">{landing.successMessage}</p>}
          </div>
          {(landing.successNote || links.length > 0) && (
            <div className="space-y-4 px-6 py-6">
              {landing.successNote && <p className="whitespace-pre-line text-sm leading-relaxed text-stone-600">{landing.successNote}</p>}
              {links.length > 0 && (
                <div className="flex justify-center gap-3">
                  {links.map((link) => (
                    <a
                      key={link.label}
                      href={/^https?:\/\//i.test(link.href) ? link.href : `https://${link.href}`}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={link.label}
                      title={link.label}
                      className="grid size-11 place-items-center rounded-full bg-[#063f3b] text-white transition hover:bg-[#052f2c]"
                    >
                      <SocialIcon name={link.label} />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  const stepTitles = ["Welcome", ...pageTitles];
  const activeStep = started ? currentStep + 1 : 0;

  function openStep(index: number) {
    if (index === 0) {
      setStarted(false);
      requestAnimationFrame(() => formTop.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
      return;
    }
    setStarted(true);
    goTo(index - 1);
  }

  const progress = (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <p className="font-semibold text-stone-900">{stepTitles[activeStep]}</p>
        <p className="shrink-0 font-medium text-stone-500">Step {activeStep + 1} of {stepTitles.length}</p>
      </div>
      <nav className="mt-1 flex gap-1.5" aria-label="Application steps">
        {stepTitles.map((title, index) => {
          const hasMissing = showMissing && missingByStep.some((group) => group.step === index - 1);
          return (
            <button
              key={index}
              type="button"
              onClick={() => openStep(index)}
              aria-current={index === activeStep ? "step" : undefined}
              aria-label={`Step ${index + 1}: ${title}`}
              title={title}
              className="group min-w-0 flex-1 cursor-pointer py-1.5 text-left"
            >
              <span className={`block h-1.5 rounded-full transition-colors group-hover:opacity-80 ${hasMissing ? "bg-red-400" : index <= activeStep ? "bg-[#063f3b]" : "bg-stone-200 group-hover:bg-stone-300"} ${index === activeStep ? "ring-2 ring-[#063f3b]/25 ring-offset-1" : ""}`} />
              <span className={`mt-1 hidden truncate text-[10px] sm:block ${index === activeStep ? "font-semibold text-stone-900" : hasMissing ? "text-red-600" : "text-stone-500 group-hover:text-stone-800"}`}>
                {title}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );

  if (!started && stage === "disclaimer") {
    return (
      <div className="space-y-6">
        <div ref={formTop} className="scroll-mt-6" />
        {header}
        {progress}
        <div className="overflow-hidden rounded-2xl border border-amber-300 bg-white shadow-sm">
          <div className="flex items-start gap-3 border-b border-amber-200 bg-amber-50 px-6 py-5">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-amber-600">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <div>
              {landing.disclaimerTitle && <h2 className="text-lg font-semibold text-amber-900">{landing.disclaimerTitle}</h2>}
              <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-amber-700">Please read carefully</p>
            </div>
          </div>
          <div className="px-6 py-6">
            {landing.disclaimerBody && (
              <p className="whitespace-pre-line text-sm leading-relaxed text-stone-700">{landing.disclaimerBody}</p>
            )}
            <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
              <button type="button" onClick={() => { setStarted(true); requestAnimationFrame(() => formTop.current?.scrollIntoView({ block: "start" })); }} className={primaryButtonClass}>
                I understand — Continue
              </button>
              <button type="button" onClick={() => { setStage("welcome"); requestAnimationFrame(() => formTop.current?.scrollIntoView({ block: "start" })); }}
                className="inline-flex h-11 items-center justify-center rounded-lg border border-stone-300 px-4 text-sm font-medium text-stone-700 hover:bg-stone-50">
                Back
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!started) {
    const requiredDocs = documents.filter((d) => d.required).map((d) => d.label);
    const optionalDocs = documents.filter((d) => !d.required).map((d) => d.label);
    return (
      <div className="space-y-6">
      <div ref={formTop} className="scroll-mt-6" />
      {header}
      {progress}
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="bg-[#063f3b] px-6 py-7 text-white">
          {landing.title && (
            <h2 className="mb-3 text-center text-lg font-semibold uppercase tracking-[0.08em] sm:text-xl">{landing.title}</h2>
          )}
          {landing.intro && <p className="whitespace-pre-line text-sm leading-relaxed text-white/85">{landing.intro}</p>}
          {landing.headline && <h3 className="mt-4 whitespace-pre-line text-xl font-semibold leading-snug">{landing.headline}</h3>}
          {landing.note && <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-white/80">{landing.note}</p>}
        </div>
        <div className="space-y-5 px-6 py-6">
          <div>
            <h3 className="text-sm font-semibold text-stone-900">What the application covers</h3>
            <ol className="mt-2 space-y-1.5">
              {pageTitles.map((title, index) => (
                <li key={title + index} className="flex items-center gap-2.5 text-sm text-stone-700">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-stone-100 text-xs font-semibold text-stone-700">{index + 1}</span>
                  {title}
                </li>
              ))}
            </ol>
          </div>
          {documents.length > 0 && (
            <div className="rounded-xl bg-stone-50 px-4 py-3">
              <h3 className="text-sm font-semibold text-stone-900">Have these ready</h3>
              <ul className="mt-1.5 space-y-1 text-sm text-stone-700">
                {requiredDocs.map((label) => <li key={label}>• {label}</li>)}
                {optionalDocs.map((label) => <li key={label} className="text-stone-500">• {label} (optional)</li>)}
              </ul>
            </div>
          )}
          <div className="space-y-2 text-xs text-stone-500">
            <p>It takes about 10–15 minutes. You can move between steps freely — nothing is sent until you press Submit on the last step.</p>
            <p className="flex gap-2 rounded-lg border border-stone-200 px-3 py-2 text-stone-600">
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="mt-px size-3.5 shrink-0 text-[#063f3b]">
                <path fillRule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z" clipRule="evenodd" />
              </svg>
              <span>
                <span className="font-semibold text-stone-700">Your privacy:</span> all your personal information is stored
                securely and internally by the company&apos;s HR department, and is never shared outside the organization.
              </span>
            </p>
          </div>
          <button type="button" onClick={() => {
            const hasDisclaimer = Boolean((landing.disclaimerTitle || "").trim() || (landing.disclaimerBody || "").trim());
            if (hasDisclaimer && stage === "welcome") {
              setStage("disclaimer");
            } else {
              setStarted(true);
            }
            requestAnimationFrame(() => formTop.current?.scrollIntoView({ block: "start" }));
          }} className={primaryButtonClass}>
            Start application
          </button>
        </div>
      </div>
      </div>
    );
  }

  // Group fields by section (preserving order of first appearance).
  const sections: { name: string; fields: ConfigTextField[] }[] = [];
  for (const f of pages[currentStep]) {
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
      {showMissing && isEmpty(f) && <p className="mt-0.5 text-xs font-medium text-red-600">This field is required</p>}

      {f.type === "textarea" ? (
        <textarea rows={3} className={fieldClass} value={values[f.name] ?? ""} onChange={(e) => setVal(f.name, e.target.value)} />
      ) : f.type === "select" ? (
        <select className={fieldClass} value={values[f.name] ?? ""} onChange={(e) => setVal(f.name, e.target.value)}>
          <option value="">Select…</option>
          {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : f.type === "radio" ? (
        <div role="radiogroup" aria-label={f.label} className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
          {(f.options ?? []).map((o) => (
            <label key={o} className="inline-flex cursor-pointer items-center gap-2 text-sm text-stone-800">
              <input
                type="radio"
                name={f.name}
                value={o}
                checked={values[f.name] === o}
                onChange={() => setVal(f.name, o)}
                className="size-4 cursor-pointer accent-stone-900"
              />
              {o}
            </label>
          ))}
        </div>
      ) : f.type === "country" ? (
        <div className="mt-1.5">
          <CountrySelect value={values[f.name] ?? ""} onChange={(v) => setVal(f.name, v)} />
        </div>
      ) : f.type === "phone" ? (
        <PhoneNumberInput className="mt-1.5" label={f.label} value={values[f.name] ?? ""} onChange={(v) => setVal(f.name, v)} />
      ) : (
        <input
          type={f.type}
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
                    <span className={showMissing && isEmpty(r) ? "text-red-600" : undefined}>{shared ? prefixes[index].slice(1).join(" — ") : r.label}</span> {r.required && <span className="text-red-500">*</span>}
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
      <div ref={formTop} className="scroll-mt-6" />
      <h1 className="text-center text-2xl font-semibold text-stone-950">Job Application Form</h1>
      {progress}
      {sections.map((sec) => (
        <section key={sec.name} className="space-y-4">
          {sec.name && (
            <h2 className="border-b border-stone-200 pb-1.5 text-sm font-semibold uppercase tracking-wide text-stone-500">{sec.name}</h2>
          )}
          {groupRadios(sec.fields).map((item) => (!Array.isArray(item) ? renderField(item) : item.length === 1 ? renderField(item[0]) : renderRadioGrid(item)))}
        </section>
      ))}

      {currentStep === lastStep && (
        <div className="space-y-4 border-t border-stone-200 pt-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Documents</h2>
          {documents.map((d) => (
            <div key={d.field}>
              <FileField doc={d} file={files[d.field] ?? null} onSelect={(file) => setFiles((cur) => ({ ...cur, [d.field]: file }))} />
              {showMissing && d.required && !files[d.field] && <p className="mt-1 text-xs font-medium text-red-600">Please upload this document</p>}
            </div>
          ))}
        </div>
      )}

      {showMissing && missingByStep.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          <p className="font-semibold">Please complete the required fields before submitting:</p>
          <ul className="mt-2 space-y-2">
            {missingByStep.map((group) => (
              <li key={group.step}>
                <button type="button" onClick={() => goTo(group.step)} className="text-xs font-semibold text-red-900 underline underline-offset-2 hover:text-red-700">
                  Step {group.step + 2}: {pageTitles[group.step]}
                </button>
                <p className="mt-0.5 text-xs text-red-700">{group.labels.join(" · ")}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex gap-3">
        <button type="button" onClick={() => openStep(activeStep - 1)} disabled={status === "submitting"} className="inline-flex h-11 shrink-0 items-center justify-center rounded-lg border border-stone-300 bg-white px-5 text-sm font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-60">
          Back
        </button>
        <button type="submit" className={primaryButtonClass} disabled={status === "submitting"}>
          {currentStep < lastStep ? "Next" : status === "submitting" ? "Submitting…" : "Submit application"}
        </button>
      </div>
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
