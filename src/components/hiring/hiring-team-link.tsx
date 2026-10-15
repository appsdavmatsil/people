"use client";

import { useState, useSyncExternalStore } from "react";
import { setHiringShareLinkAction } from "@/app/(app)/hiringform/actions";

const noSubscribe = () => () => {};

const btn =
  "inline-flex h-8 shrink-0 items-center rounded-lg border border-stone-300 bg-white px-3 text-xs font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-60";

/** Creates, copies, replaces or turns off the no-login team link to Form Responses. */
export function HiringTeamLink({ token: initialToken }: { token: string | null }) {
  const [token, setToken] = useState(initialToken);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const origin = useSyncExternalStore(noSubscribe, () => window.location.origin, () => "");
  const url = token ? `${origin}/hiring-team/${token}` : "";

  async function update(enabled: boolean) {
    if (token && !window.confirm(enabled
      ? "Create a new link? The current link will stop working for everyone who has it."
      : "Turn off the team link? Everyone who has it will lose access.")) return;
    setBusy(true);
    setError("");
    const result = await setHiringShareLinkAction(enabled);
    setBusy(false);
    if (result.ok) setToken(result.token ?? null);
    else setError(result.error ?? "Could not update the link.");
  }

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
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2">
      <span className="text-xs font-semibold text-stone-900">Team link</span>
      {token ? (
        <>
          <input
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 font-mono text-[11px] text-stone-700"
          />
          <button type="button" onClick={copy} className="inline-flex h-8 shrink-0 items-center rounded-lg bg-[#063f3b] px-3 text-xs font-semibold text-white hover:bg-[#052f2c]">
            {copied ? "Copied!" : "Copy"}
          </button>
          <a href={url} target="_blank" rel="noreferrer" className={btn}>Open</a>
          <button type="button" onClick={() => update(true)} disabled={busy} className={btn}>New link</button>
          <button type="button" onClick={() => update(false)} disabled={busy} className={`${btn} text-red-600`}>Turn off</button>
        </>
      ) : (
        <>
          <span className="flex-1 text-xs text-stone-500">
            Share this page with your team without a login. They can see every application and change statuses, but not delete.
          </span>
          <button type="button" onClick={() => update(true)} disabled={busy} className="inline-flex h-8 shrink-0 items-center rounded-lg bg-[#063f3b] px-3 text-xs font-semibold text-white hover:bg-[#052f2c] disabled:opacity-60">
            {busy ? "Creating…" : "Create link"}
          </button>
        </>
      )}
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
    </div>
  );
}
