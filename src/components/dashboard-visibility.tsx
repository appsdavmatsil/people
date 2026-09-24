"use client";

import { useEffect, useRef, useState } from "react";
import { useDirectoryLookups } from "@/components/use-directory-lookups";
import { usePrivacy } from "@/components/privacy-provider";
import {
  privacyUnlockAction,
  saveDashboardVisibilityAction,
  setPrivacyEnabledAction,
  setPrivacyPasswordAction,
  setProtectedFeaturesAction,
  setProtectedPagesAction,
} from "@/lib/privacy-actions";
import { featureIsProtected, positionKey, privacyFeatures, privacyPages, salaryHidden } from "@/lib/privacy";

const fieldClass =
  "h-9 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none focus:border-stone-950";
const primaryButtonClass =
  "inline-flex h-9 items-center justify-center rounded-lg bg-stone-950 px-3 text-sm font-medium text-white hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-400";

const dialogClass =
  "m-auto h-fit max-h-[calc(100dvh-2rem)] w-[min(100%-2rem,32rem)] overflow-hidden rounded-2xl border border-stone-200 bg-white p-0 text-stone-950 shadow-xl backdrop:bg-stone-950/40";

export function PrivacySettings() {
  const privacy = usePrivacy();
  const { snapshot } = privacy;
  const [enabled, setEnabled] = useState(snapshot.passwordEnabled);
  const [features, setFeatures] = useState(snapshot.protectedFeatures);
  const [pages, setPages] = useState(snapshot.protectedPages);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState("");

  useEffect(() => {
    setEnabled(snapshot.passwordEnabled);
    setFeatures(snapshot.protectedFeatures);
    setPages(snapshot.protectedPages);
  }, [snapshot.passwordEnabled, snapshot.protectedFeatures, snapshot.protectedPages, snapshot.stamp]);

  function apply(result: { snapshot?: typeof snapshot; error?: string }, success: string) {
    if (result.snapshot) {
      privacy.applySnapshot(result.snapshot);
    }

    if (result.error || !result.snapshot) {
      setEnabled(privacy.snapshot.passwordEnabled);
      setMessage("");
      setError(result.error ?? "Could not save that change.");
      return;
    }

    setError("");
    setMessage(success);
  }

  async function toggle(next: boolean) {
    setPending("toggle");
    const result = await setPrivacyEnabledAction(next);
    setPending("");
    apply(result, next ? "Password protection is on." : "Password protection is off.");

    if (result.snapshot && !result.snapshot.passwordEnabled) {
      privacy.lock();
    }
  }

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (password !== confirmation) {
      setMessage("");
      setError("Passwords do not match.");
      return;
    }

    setPending("password");
    const result = await setPrivacyPasswordAction(password);
    setPending("");
    apply(result, "Password changed.");

    if (result.snapshot) {
      privacy.lock();
      setPassword("");
      setConfirmation("");
    }
  }

  async function saveFeatures(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending("features");
    const result = await setProtectedFeaturesAction(features);
    setPending("");
    apply(result, "Protected features saved.");
  }

  async function savePages(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending("pages");
    const result = await setProtectedPagesAction(pages);
    setPending("");
    apply(result, "Protected pages saved.");
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pt-5">
      <div className="mx-auto flex max-w-xl flex-col gap-8 pb-8">
        <section>
          <h2 className="text-sm font-semibold text-stone-950">Shared password</h2>
          <p className="mt-1 text-sm text-stone-500">
            Only the account owner can turn this password on, change it, or remove it. It is separate from each
            person’s sign-in password.
          </p>
          <label className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-stone-200 px-4 py-3">
            <span className="text-sm font-medium text-stone-950">Require the password</span>
            <input
              type="checkbox"
              checked={enabled}
              disabled={pending === "toggle"}
              onChange={(event) => {
                setEnabled(event.target.checked);
                void toggle(event.target.checked);
              }}
              className="size-4 accent-stone-950"
            />
          </label>
          <form onSubmit={changePassword} className="mt-4 space-y-3">
            <label className="block text-sm font-medium text-stone-800">
              New password
              <input
                type="password"
                name="privacy-new-password"
                autoComplete="off"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={`${fieldClass} mt-1`}
              />
            </label>
            <label className="block text-sm font-medium text-stone-800">
              Confirm password
              <input
                type="password"
                name="privacy-confirm-password"
                autoComplete="off"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                className={`${fieldClass} mt-1`}
              />
            </label>
            <button type="submit" disabled={pending === "password"} className={primaryButtonClass}>
              {pending === "password" ? "Saving…" : "Change password"}
            </button>
          </form>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-stone-950">Protected features</h2>
          <p className="mt-1 text-sm text-stone-500">
            Choose which actions ask for the shared password while protection is on.
          </p>
          <form onSubmit={saveFeatures} className="mt-4">
            <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200">
              {privacyFeatures.map((feature) => {
                const checked = features.includes(feature.id);
                return (
                  <li key={feature.id}>
                    <label className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm text-stone-800">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-stone-300 bg-white text-stone-800">
                          {feature.id === "board-visibility" ? <CrossedEyeIcon /> : <LockIcon />}
                        </span>
                        <span>{feature.title}</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setFeatures((current) =>
                            checked ? current.filter((id) => id !== feature.id) : [...current, feature.id],
                          );
                        }}
                        className="size-4 accent-stone-950"
                      />
                    </label>
                  </li>
                );
              })}
            </ul>
            <button type="submit" disabled={pending === "features"} className={`${primaryButtonClass} mt-4`}>
              {pending === "features" ? "Saving…" : "Save features"}
            </button>
          </form>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-stone-950">Protected pages</h2>
          <p className="mt-1 text-sm text-stone-500">
            Choose which pages ask for the shared password. You can open these pages without it.
          </p>
          <form onSubmit={savePages} className="mt-4">
            <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200">
              {privacyPages.map((page) => {
                const checked = pages.includes(page.href);
                return (
                  <li key={page.href}>
                    <label className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm text-stone-800">
                      <span>{page.title}</span>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setPages((current) =>
                            checked ? current.filter((href) => href !== page.href) : [...current, page.href],
                          );
                        }}
                        className="size-4 accent-stone-950"
                      />
                    </label>
                  </li>
                );
              })}
            </ul>
            <button type="submit" disabled={pending === "pages"} className={`${primaryButtonClass} mt-4`}>
              {pending === "pages" ? "Saving…" : "Save pages"}
            </button>
          </form>
        </section>

        {message ? <p className="text-sm text-emerald-800">{message}</p> : null}
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
      </div>
    </div>
  );
}

export function DashboardVisibilityButton() {
  const privacy = usePrivacy();
  const { lookups } = useDirectoryLookups();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState<"closed" | "password" | "visibility">("closed");
  const [password, setPassword] = useState("");
  const [showHiring, setShowHiring] = useState(true);
  const [showPromotions, setShowPromotions] = useState(true);
  const [visiblePositions, setVisiblePositions] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const positions = lookups.positions;
  const groups = lookups.departments
    .map((department) => ({
      department,
      positions: positions.filter((item) => item.departmentId === department.id),
    }))
    .filter((group) => group.positions.length > 0);
  const ungrouped = positions.filter(
    (item) => !lookups.departments.some((department) => department.id === item.departmentId),
  );

  function open() {
    setError("");
    setPassword("");
    setShowHiring(privacy.snapshot.showHiring);
    setShowPromotions(privacy.snapshot.showPromotions);
    setVisiblePositions(
      positions
        .filter((item) => !salaryHidden(privacy.snapshot.hiddenSalaryPositions, item.name))
        .map((item) => positionKey(item.name)),
    );

    const visibilityProtected =
      privacy.snapshot.passwordEnabled &&
      featureIsProtected("board-visibility", privacy.snapshot.protectedFeatures);

    if (!visibilityProtected) {
      setStep("visibility");
      return;
    }

    setStep("password");
  }

  async function unlock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const result = await privacyUnlockAction(password);
    setPending(false);

    if (result.snapshot) {
      privacy.applySnapshot(result.snapshot);
    }

    if (!result.ok) {
      setError("Incorrect password.");
      return;
    }

    if (result.snapshot) {
      privacy.unlock(result.snapshot.stamp);
      setShowHiring(result.snapshot.showHiring);
      setShowPromotions(result.snapshot.showPromotions);
      setVisiblePositions(
        positions
          .filter((item) => !salaryHidden(result.snapshot!.hiddenSalaryPositions, item.name))
          .map((item) => positionKey(item.name)),
      );
    }

    setStep("visibility");
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const hidden = positions
      .map((item) => positionKey(item.name))
      .filter((key) => key && !visiblePositions.includes(key));
    const result = await saveDashboardVisibilityAction({
      password:
        privacy.snapshot.passwordEnabled &&
        featureIsProtected("board-visibility", privacy.snapshot.protectedFeatures)
          ? password
          : "",
      showHiring,
      showPromotions,
      hiddenSalaryPositions: hidden,
    });
    setPending(false);

    if (result.error || !result.snapshot) {
      setError(result.error ?? "Could not save visibility.");
      return;
    }

    privacy.applySnapshot(result.snapshot);
    setPassword("");
    setStep("closed");
  }

  useEffect(() => {
    const node = dialogRef.current;

    if (!node) {
      return;
    }

    if (step === "closed") {
      if (node.open) {
        node.close();
      }
      return;
    }

    if (!node.open) {
      node.showModal();
    }
  }, [step]);

  function togglePosition(key: string) {
    setVisiblePositions((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  }

  return (
    <>
      <button
        type="button"
        aria-label="Choose what is visible on the location board"
        title="Choose what is visible"
        className="inline-flex size-9 items-center justify-center rounded-lg border border-stone-300 bg-white text-stone-800 hover:bg-stone-50"
        onClick={open}
      >
        <CrossedEyeIcon />
      </button>
      {step === "closed" ? null : (
        <dialog
          ref={dialogRef}
          className={dialogClass}
          aria-labelledby="board-visibility-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setPassword("");
              setStep("closed");
            }
          }}
          onClose={() => setStep("closed")}
        >
          {step === "password" ? (
            <form onSubmit={unlock}>
              <div className="border-b border-stone-200 px-5 py-4">
                <h2 id="board-visibility-title" className="text-base font-semibold tracking-tight">
                  Visibility settings
                </h2>
                <p className="mt-1 text-sm text-stone-500">Enter the shared password to change what people see.</p>
              </div>
              <div className="space-y-3 px-5 py-4">
                <label className="block text-sm font-medium text-stone-800">
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
                {error ? <p className="text-sm text-red-700">{error}</p> : null}
              </div>
              <div className="flex justify-end gap-2 border-t border-stone-200 px-5 py-3">
                <button
                  type="button"
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium text-stone-800 hover:bg-stone-50"
                  onClick={() => setStep("closed")}
                >
                  Cancel
                </button>
                <button type="submit" disabled={pending} className={primaryButtonClass}>
                  {pending ? "Checking…" : "Continue"}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={save} className="flex max-h-[calc(100dvh-2rem)] flex-col">
              <div className="border-b border-stone-200 px-5 py-4">
                <h2 id="board-visibility-title" className="text-base font-semibold tracking-tight">
                  Visibility
                </h2>
                <p className="mt-1 text-sm text-stone-500">
                  These choices apply for everyone, on every device.
                </p>
              </div>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
                <label className="flex items-center justify-between gap-4 text-sm font-medium text-stone-800">
                  Hiring cards
                  <input
                    type="checkbox"
                    checked={showHiring}
                    onChange={(event) => setShowHiring(event.target.checked)}
                    className="size-4 accent-stone-950"
                  />
                </label>
                <label className="flex items-center justify-between gap-4 text-sm font-medium text-stone-800">
                  Promotion details
                  <input
                    type="checkbox"
                    checked={showPromotions}
                    onChange={(event) => setShowPromotions(event.target.checked)}
                    className="size-4 accent-stone-950"
                  />
                </label>
                <fieldset>
                  <legend className="text-sm font-medium text-stone-800">Salary by position</legend>
                  <p className="mt-1 text-sm text-stone-500">Checked positions show their salary on the board.</p>
                  <div className="mt-3 space-y-3">
                    {groups.map((group) => (
                      <div key={group.department.id}>
                        <p className="text-xs font-medium tracking-wide text-stone-500 uppercase">
                          {group.department.name}
                        </p>
                        <ul className="mt-1">
                          {group.positions.map((item) => (
                            <PositionChoice
                              key={item.id}
                              name={item.name}
                              checked={visiblePositions.includes(positionKey(item.name))}
                              onChange={() => togglePosition(positionKey(item.name))}
                            />
                          ))}
                        </ul>
                      </div>
                    ))}
                    {ungrouped.length > 0 ? (
                      <ul>
                        {ungrouped.map((item) => (
                          <PositionChoice
                            key={item.id}
                            name={item.name}
                            checked={visiblePositions.includes(positionKey(item.name))}
                            onChange={() => togglePosition(positionKey(item.name))}
                          />
                        ))}
                      </ul>
                    ) : null}
                    {positions.length === 0 ? (
                      <p className="text-sm text-stone-500">Add positions in Directory Lookups first.</p>
                    ) : null}
                  </div>
                </fieldset>
                {error ? <p className="text-sm text-red-700">{error}</p> : null}
              </div>
              <div className="flex justify-end gap-2 border-t border-stone-200 px-5 py-3">
                <button
                  type="button"
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium text-stone-800 hover:bg-stone-50"
                  onClick={() => {
                    setPassword("");
                    setStep("closed");
                  }}
                >
                  Cancel
                </button>
                <button type="submit" disabled={pending} className={primaryButtonClass}>
                  {pending ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          )}
        </dialog>
      )}
    </>
  );
}

function PositionChoice({
  name,
  checked,
  onChange,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <li>
      <label className="flex items-center justify-between gap-4 py-1.5 text-sm text-stone-800">
        <span className="min-w-0 truncate">{name}</span>
        <input type="checkbox" checked={checked} onChange={onChange} className="size-4 accent-stone-950" />
      </label>
    </li>
  );
}

function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none">
      <rect x="3.25" y="7" width="9.5" height="6.5" rx="1.4" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5.25 7V5.1a2.75 2.75 0 0 1 5.5 0V7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function CrossedEyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none">
      <path
        d="M2 8s2.2-3.5 6-3.5S14 8 14 8s-2.2 3.5-6 3.5S2 8 2 8Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="1.6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3 13 13 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
