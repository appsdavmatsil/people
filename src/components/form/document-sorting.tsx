"use client";

import { useState } from "react";
import { saveFormConfigAction } from "@/app/(app)/form/actions";
import type { FormConfig } from "@/lib/form-config";

const fieldClass =
  "mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-mono text-sm text-stone-950 outline-none focus:border-stone-950";
const primary =
  "inline-flex h-9 items-center justify-center rounded-lg bg-[#063f3b] px-4 text-sm font-semibold text-white hover:bg-[#052f2c] disabled:opacity-60";

function preview(pattern: string, label: string, name: string, date: string) {
  return pattern
    .replaceAll("{label}", label)
    .replaceAll("{name}", name)
    .replaceAll("{date}", date);
}

export function DocumentSorting({ config }: { config: FormConfig }) {
  const [folderPattern, setFolderPattern] = useState(config.naming.folderPattern);
  const [filePattern, setFilePattern] = useState(config.naming.filePattern);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");

  async function save() {
    setStatus("saving");
    setMessage("");
    const result = await saveFormConfigAction({
      ...config,
      naming: { folderPattern, filePattern },
    });
    if (result.ok) setStatus("saved");
    else {
      setStatus("error");
      setMessage(result.error ?? "Could not save.");
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-10">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-stone-950">Document Sorting</h1>
          <p className="text-sm text-stone-500">
            Auto-naming rules for the Google Drive folder and uploaded files.
          </p>
        </div>
        <button className={primary} onClick={save} disabled={status === "saving"}>
          {status === "saving" ? "Saving…" : "Save rules"}
        </button>
      </div>

      {status === "saved" ? (
        <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Saved.</p>
      ) : null}
      {status === "error" ? (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>
      ) : null}

      <div className="max-w-xl space-y-5">
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <p className="text-xs text-stone-500">
            Available placeholders:{" "}
            <code className="rounded bg-stone-100 px-1">{"{name}"}</code>{" "}
            <code className="rounded bg-stone-100 px-1">{"{label}"}</code>{" "}
            <code className="rounded bg-stone-100 px-1">{"{date}"}</code>
          </p>
          <p className="mt-1 text-xs text-stone-500">
            For passport / Emirates ID / visa, <code>{"{date}"}</code> is the
            expiry date entered on the form. For other documents it is the upload date.
          </p>
        </div>

        <label className="block text-sm font-medium text-stone-800">
          Folder name pattern
          <input
            className={fieldClass}
            value={folderPattern}
            onChange={(e) => setFolderPattern(e.target.value)}
          />
          <span className="mt-1 block text-xs text-stone-500">
            Preview: <strong>{preview(folderPattern, "Passport", "John Smith", "2031-05-15") || "—"}</strong>
          </span>
        </label>

        <label className="block text-sm font-medium text-stone-800">
          File name pattern
          <input
            className={fieldClass}
            value={filePattern}
            onChange={(e) => setFilePattern(e.target.value)}
          />
          <span className="mt-1 block text-xs text-stone-500">
            Preview: <strong>{preview(filePattern, "Passport", "John Smith", "2031-05-15") || "—"}.jpg</strong>
          </span>
        </label>
      </div>
    </div>
  );
}
