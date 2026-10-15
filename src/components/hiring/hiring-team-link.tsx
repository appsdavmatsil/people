"use client";

import { useState, useSyncExternalStore } from "react";
import { setHiringShareLinkAction } from "@/app/(app)/hiringform/actions";

const noSubscribe = () => () => {};

const btn =
  "inline-flex h-7 shrink-0 items-center rounded-lg border border-stone-300 bg-white px-2 text-xs font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-60 sm:h-8 sm:px-3";
const primary =
  "inline-flex h-7 shrink-0 items-center rounded-lg bg-[#063f3b] px-2.5 text-xs font-semibold text-white hover:bg-[#052f2c] disabled:opacity-60 sm:h-8 sm:px-3";

/** Creates, copies, replaces or turns off the no-login team link to Form Responses. */
export function HiringTeamLink({ token: initialToken }: { token: string | null }) {
  const [token, setToken] = useState(initialToken);
  const [open, setOpen] = useState(false);
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

  const toggle = (
    <button
      type="button"
      onClick={() => setOpen((value) => !value)}
      aria-expanded={open}
      aria-label={`Team link ${token ? "on" : "off"}`}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-1 text-xs font-semibold text-stone-900 hover:text-stone-600"
    >
      <span className={`size-2 rounded-full ${token ? "bg-emerald-500" : "bg-stone-300"}`} aria-hidden="true" />
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-4 text-stone-600 sm:hidden" aria-hidden="true">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
      <span className="hidden sm:inline">Team link</span>
      <span className="hidden font-normal text-stone-500 sm:inline">{token ? "On" : "Off"}</span>
      <svg viewBox="0 0 20 20" fill="currentColor" className={`hidden size-4 text-stone-400 transition-transform sm:block ${open ? "rotate-180" : ""}`} aria-hidden="true">
        <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
      </svg>
    </button>
  );

  const toggleBox = <div className="flex w-fit rounded-xl border border-stone-200 bg-stone-50 px-2 py-1">{toggle}</div>;
  if (!open) return toggleBox;

  return (
    <>
      {toggleBox}
      <div className="flex min-w-0 flex-[1_1_20rem] flex-wrap items-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-2 py-1 sm:gap-2">
        {token ? (
          <>
            <input
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="hidden min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 font-mono text-[11px] text-stone-700 sm:block"
            />
            <button type="button" onClick={copy} className={primary}>
              {copied ? "Copied!" : "Copy"}
            </button>
            <a href={url} target="_blank" rel="noreferrer" className={btn}>Open</a>
            <button type="button" onClick={() => update(true)} disabled={busy} className={btn}>
              New<span className="hidden sm:inline">&nbsp;link</span>
            </button>
            <button type="button" onClick={() => update(false)} disabled={busy} className={`${btn} text-red-600`}>
              <span className="sm:hidden">Off</span><span className="hidden sm:inline">Turn off</span>
            </button>
          </>
        ) : (
          <>
            <span className="hidden flex-1 text-xs text-stone-500 sm:block">
              Share this page with your team without a login. They can see every application and change statuses, but not delete.
            </span>
            <button type="button" onClick={() => update(true)} disabled={busy} className={primary}>
              {busy ? "Creating…" : "Create link"}
            </button>
          </>
        )}
        {error && <p className="w-full text-xs text-red-600">{error}</p>}
      </div>
    </>
  );
}
