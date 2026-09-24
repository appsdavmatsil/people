"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { privacyUnlockAction } from "@/lib/privacy-actions";
import { pageIsProtected } from "@/lib/privacy";
import { usePrivacy } from "@/components/privacy-provider";

const fieldClass =
  "h-10 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none focus:border-stone-950";
const primaryButtonClass =
  "inline-flex h-10 items-center justify-center rounded-lg bg-stone-950 px-3 text-sm font-medium text-white hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-400";

export function PrivacyGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const privacy = usePrivacy();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const locked =
    privacy.ready &&
    privacy.snapshot.passwordEnabled &&
    !privacy.snapshot.isOwner &&
    !privacy.unlocked &&
    pageIsProtected(pathname, privacy.snapshot.protectedPages);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const result = await privacyUnlockAction(password);
    setPending(false);

    if (result.snapshot) {
      privacy.applySnapshot(result.snapshot);
    }

    if (!result.ok || !result.snapshot) {
      setError(result.error && result.error !== "Incorrect password" ? result.error : "Incorrect password.");
      return;
    }

    privacy.unlock(result.snapshot.stamp);
    setPassword("");
  }

  if (!privacy.ready) {
    return <div className="min-h-0 flex-1 bg-white" />;
  }

  if (!locked) {
    return children;
  }

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-10">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"
      >
        <h2 className="text-base font-semibold tracking-tight text-stone-950">This page is protected</h2>
        <p className="mt-1 text-sm text-stone-500">Enter the shared password to continue on this device.</p>
        <label className="mt-4 block text-sm font-medium text-stone-800">
          Password
          <input
            type="password"
            name="privacy-password"
            autoComplete="off"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoFocus
            required
            className={`${fieldClass} mt-1`}
          />
        </label>
        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
        <button type="submit" disabled={pending} className={`${primaryButtonClass} mt-4 w-full`}>
          {pending ? "Checking…" : "Continue"}
        </button>
      </form>
    </div>
  );
}
