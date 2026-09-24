"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { readLocalAccessLog } from "@/lib/activity";
import {
  inviteTeamMemberAction,
  listTeamMembers,
  type InviteState,
} from "@/lib/auth/invite";
import { type AccessLogEntry, type TeamMember } from "@/lib/auth/team-model";
import { passwordChecks } from "@/lib/auth/password";
import {
  listAccessLogAction,
  removeTeamMemberAction,
  setTeamAccessAction,
  updateTeamMemberAction,
} from "@/lib/auth/team";

const fieldClass =
  "mt-1.5 h-9 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none focus:border-stone-950";
const primaryButtonClass =
  "inline-flex h-9 items-center justify-center rounded-lg bg-stone-950 px-3 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-60";
const iconButtonClass =
  "inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-stone-500 hover:bg-stone-100 hover:text-stone-950 disabled:cursor-not-allowed disabled:opacity-30";
const dialogClass =
  "m-auto h-fit max-h-[calc(100dvh-2rem)] overflow-hidden rounded-2xl border border-stone-200 bg-white p-0 text-stone-950 shadow-xl backdrop:bg-stone-950/40";
const dialogWidthClass = "w-[min(100%-2rem,28rem)]";

export function TeamAccess() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const editRef = useRef<HTMLDialogElement>(null);
  const logRef = useRef<HTMLDialogElement>(null);
  const removeRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [logging, setLogging] = useState<TeamMember | null>(null);
  const [removing, setRemoving] = useState<TeamMember | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;

    listTeamMembers().then((rows) => {
      if (active) {
        setMembers(rows);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  function openDialog() {
    setOpen(true);
    dialogRef.current?.showModal();
  }

  function addMember(member: TeamMember) {
    setMembers((current) => mergeMembers(current, [member], true));
  }

  function replaceMember(member: TeamMember) {
    setMembers((current) => current.map((item) => (item.id === member.id ? member : item)));
  }

  async function toggleBlock(member: TeamMember) {
    if (member.isOwner || member.isSelf) {
      return;
    }

    const blocked = member.status !== "blocked";
    setNotice("");
    const result = await setTeamAccessAction(member.id, blocked);
    if (result.error || !result.member) {
      setNotice(result.error || "That change could not be saved.");
      return;
    }

    replaceMember(result.member);
  }

  function openEdit(member: TeamMember) {
    setEditing(member);
    setNotice("");
    editRef.current?.showModal();
  }

  function openLog(member: TeamMember) {
    setLogging(member);
    logRef.current?.showModal();
  }

  function openRemove(member: TeamMember) {
    if (member.isOwner || member.isSelf) {
      return;
    }

    setRemoving(member);
    setNotice("");
    removeRef.current?.showModal();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3">
        {notice ? <p className="text-sm text-red-700">{notice}</p> : <span />}
        <button type="button" className={primaryButtonClass} onClick={openDialog}>
          Add Team member
        </button>
      </div>

      <div className="mt-4 min-h-0 flex-1 overflow-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full border-separate border-spacing-0 text-left text-sm">
          <thead className="sticky top-0 bg-stone-50 text-stone-500">
            <tr>
              <th className="border-b border-stone-200 px-3 py-2 font-medium">Name</th>
              <th className="border-b border-stone-200 px-3 py-2 font-medium">Email</th>
              <th className="border-b border-stone-200 px-3 py-2 font-medium">Status</th>
              <th className="border-b border-stone-200 px-3 py-2 text-right font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {members.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-stone-500">
                  No team members yet.
                </td>
              </tr>
            ) : (
              members.map((member) => {
                const locked = member.isOwner || member.isSelf;
                return (
                  <tr key={member.id} className="hover:bg-stone-50">
                    <td className="border-b border-stone-100 px-3 py-2 font-medium text-stone-950">
                      {member.name}
                    </td>
                    <td className="border-b border-stone-100 px-3 py-2 text-stone-700">
                      <span className="inline-flex items-center gap-2">
                        {member.isOwner ? (
                          <span className="inline-flex h-5 items-center rounded-full bg-stone-950 px-1.5 text-[11px] font-medium text-white">
                            Owner
                          </span>
                        ) : null}
                        <span className="break-all">{member.email || "—"}</span>
                      </span>
                    </td>
                    <td className="border-b border-stone-100 px-3 py-2">
                      <StatusTag member={member} />
                    </td>
                    <td className="border-b border-stone-100 px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          className={iconButtonClass}
                          aria-label={
                            member.status === "blocked"
                              ? `Restore access for ${member.name}`
                              : `Block ${member.name}`
                          }
                          disabled={locked}
                          onClick={() => toggleBlock(member)}
                        >
                          <BlockIcon />
                        </button>
                        <button
                          type="button"
                          className={iconButtonClass}
                          aria-label={`Remove ${member.name}`}
                          disabled={locked}
                          onClick={() => openRemove(member)}
                        >
                          <TrashIcon />
                        </button>
                        <button
                          type="button"
                          className={iconButtonClass}
                          aria-label={`Access log for ${member.name}`}
                          onClick={() => openLog(member)}
                        >
                          <LogIcon />
                        </button>
                        <button
                          type="button"
                          className={iconButtonClass}
                          aria-label={`Edit ${member.name}`}
                          onClick={() => openEdit(member)}
                        >
                          <PencilIcon />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <dialog
        ref={dialogRef}
        aria-labelledby="add-team-member-title"
        className={`${dialogClass} ${dialogWidthClass}`}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            event.currentTarget.close();
          }
        }}
      >
        {open ? (
          <InviteDialog
            onCreated={addMember}
            onClose={() => dialogRef.current?.close()}
          />
        ) : null}
      </dialog>

      <dialog
        ref={editRef}
        aria-labelledby="edit-team-member-title"
        className={`${dialogClass} ${dialogWidthClass}`}
        onClose={() => setEditing(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            event.currentTarget.close();
          }
        }}
      >
        {editing ? (
          <EditDialog
            member={editing}
            onSaved={replaceMember}
            onClose={() => editRef.current?.close()}
          />
        ) : null}
      </dialog>

      <dialog
        ref={logRef}
        aria-labelledby="team-access-log-title"
        className={`${dialogClass} w-[min(100%-2rem,40rem)]`}
        onClose={() => setLogging(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            event.currentTarget.close();
          }
        }}
      >
        {logging ? (
          <AccessLogDialog member={logging} onClose={() => logRef.current?.close()} />
        ) : null}
      </dialog>

      <dialog
        ref={removeRef}
        aria-labelledby="remove-team-member-title"
        className={`${dialogClass} ${dialogWidthClass}`}
        onClose={() => setRemoving(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            event.currentTarget.close();
          }
        }}
      >
        {removing ? (
          <RemoveDialog
            member={removing}
            onRemoved={(id) => {
              setMembers((current) => current.filter((item) => item.id !== id));
              removeRef.current?.close();
            }}
            onError={setNotice}
            onClose={() => removeRef.current?.close()}
          />
        ) : null}
      </dialog>
    </div>
  );
}

function InviteDialog({
  onCreated,
  onClose,
}: {
  onCreated: (member: TeamMember) => void;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState<InviteState, FormData>(
    inviteTeamMemberAction,
    null,
  );
  const [password, setPassword] = useState("");
  const [copied, setCopied] = useState(false);
  const recorded = useRef(false);

  useEffect(() => {
    if (!state?.member || recorded.current) {
      return;
    }

    recorded.current = true;
    onCreated(state.member);
  }, [onCreated, state?.member]);

  const created = Boolean(state?.website && state.email && state.password);

  async function copyDetails() {
    if (!state?.website || !state.email || !state.password) {
      return;
    }

    const value = [
      `Website: ${state.website}`,
      `Login email: ${state.email}`,
      `Temporary password: ${state.password}`,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const area = document.createElement("textarea");
      area.value = value;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.left = "-9999px";
      document.body.append(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }

    setCopied(true);
  }

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (created) {
          event.preventDefault();
        }
      }}
    >
      <div className="flex items-start justify-between gap-4 border-b border-stone-200 px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-700">
            <PlusIcon />
          </span>
          <div className="min-w-0">
          <h2 id="add-team-member-title" className="text-base font-semibold tracking-tight">
            {created ? "Access created" : "Add Team member"}
          </h2>
          <p className="mt-1 text-sm text-stone-500">
            {created
              ? "Share these details. They sign in, then choose a new password."
              : "Creates their Supabase sign-in. They change this password after they sign in."}
          </p>
          </div>
        </div>
        <button
          type="button"
          className="flex size-8 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-950"
          aria-label="Close"
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </div>
      <div className="space-y-4 px-5 py-4">
        {created ? (
          <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
            <div className="flex items-start justify-between gap-3">
              <dl className="min-w-0 space-y-3 text-sm">
                <AccessDetail label="Website" value={state?.website ?? ""} />
                <AccessDetail label="Login email" value={state?.email ?? ""} />
                <AccessDetail label="Temporary password" value={state?.password ?? ""} />
              </dl>
              <button
                type="button"
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-stone-500 hover:bg-white hover:text-stone-950"
                aria-label={copied ? "Details copied" : "Copy details"}
                onClick={copyDetails}
              >
                {copied ? <CheckIcon /> : <CopyIcon />}
              </button>
            </div>
            {state?.message ? <p className="mt-3 text-sm text-stone-600">{state.message}</p> : null}
          </div>
        ) : (
          <>
            <label className="block text-sm font-medium text-stone-800">
              Name
              <input
                name="name"
                type="text"
                autoComplete="name"
                required
                className={fieldClass}
              />
            </label>
            <label className="block text-sm font-medium text-stone-800">
              Email
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                className={fieldClass}
              />
            </label>
            <label className="block text-sm font-medium text-stone-800">
              Password
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-describedby={password.length > 0 ? "invite-password-rules" : undefined}
                className={fieldClass}
              />
              {password.length > 0 ? (
                <ul id="invite-password-rules" className="mt-2 space-y-1" aria-live="polite">
                  {passwordChecks.map((check) => {
                    const met = check.test(password);
                    return (
                      <li
                        key={check.label}
                        className={`text-xs font-normal ${met ? "text-emerald-600" : "text-stone-400"}`}
                      >
                        {check.label}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </label>
          </>
        )}
        {state?.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
        {created ? (
          <div className="flex justify-end">
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium text-stone-800 hover:bg-stone-50"
              onClick={onClose}
            >
              Done
            </button>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium text-stone-800 hover:bg-stone-50"
              onClick={onClose}
            >
              Cancel
            </button>
            <button type="submit" className={primaryButtonClass} disabled={pending}>
              {pending ? "Creating access…" : "Create access"}
            </button>
          </div>
        )}
      </div>
    </form>
  );
}

function mergeMembers(current: TeamMember[], extra: TeamMember[], incomingWins: boolean) {
  const byEmail = new Map<string, TeamMember>();

  for (const member of current) {
    const email = member.email.toLowerCase();
    if (email) {
      byEmail.set(email, member);
    }
  }

  for (const member of extra) {
    const email = member.email.toLowerCase();
    if (!email) {
      continue;
    }

    const existing = byEmail.get(email);
    if (!existing) {
      byEmail.set(email, member);
      continue;
    }

    if (incomingWins) {
      byEmail.set(email, { ...member, isSelf: existing.isSelf, isOwner: existing.isOwner });
    }
  }

  return [...byEmail.values()].sort((left, right) => {
    if (left.isOwner !== right.isOwner) {
      return left.isOwner ? -1 : 1;
    }

    return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
  });
}

function AccessDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-stone-500">{label}</dt>
      <dd className="mt-0.5 break-all text-stone-950">{value}</dd>
    </div>
  );
}

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10.5 5.5V3.8A1.3 1.3 0 0 0 9.2 2.5H3.8A1.3 1.3 0 0 0 2.5 3.8v5.4A1.3 1.3 0 0 0 3.8 10.5H5.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.5 8.2 6.4 11 12.5 4.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M3 3l8 8M11 3 3 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function StatusTag({ member }: { member: TeamMember }) {
  const blocked = member.status === "blocked";
  const temporary = !blocked && member.mustChangePassword;
  const label = blocked ? "Blocked" : temporary ? "Temporary" : "Active";

  return (
    <span
      className={`inline-flex h-6 items-center rounded-full px-2 text-xs font-medium ${
        blocked
          ? "bg-red-50 text-red-700"
          : temporary
            ? "bg-amber-50 text-amber-800"
            : "bg-emerald-50 text-emerald-700"
      }`}
    >
      {label}
    </span>
  );
}

function EditDialog({
  member,
  onSaved,
  onClose,
}: {
  member: TeamMember;
  onSaved: (member: TeamMember) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(member.name);
  const [email, setEmail] = useState(member.email);
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [issued, setIssued] = useState<{ website: string; email: string; password: string } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const result = await updateTeamMemberAction({
      id: member.id,
      name,
      email,
      password,
    });
    setPending(false);

    if (result.error || !result.member) {
      setError(result.error || "That change could not be saved.");
      return;
    }

    onSaved(result.member);
    if (result.password && result.website) {
      setIssued({ website: result.website, email: result.member.email, password: result.password });
      return;
    }

    onClose();
  }

  async function copyDetails() {
    if (!issued) {
      return;
    }

    const value = [
      `Website: ${issued.website}`,
      `Login email: ${issued.email}`,
      `Temporary password: ${issued.password}`,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const area = document.createElement("textarea");
      area.value = value;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.left = "-9999px";
      document.body.append(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }

    setCopied(true);
  }

  return (
    <form onSubmit={save}>
      <div className="flex items-start justify-between gap-4 border-b border-stone-200 px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-700">
            <PencilIcon />
          </span>
          <div className="min-w-0">
          <h2 id="edit-team-member-title" className="text-base font-semibold tracking-tight">
            {issued ? "Temporary password ready" : `Edit ${member.name}`}
          </h2>
          <p className="mt-1 text-sm text-stone-500">
            {issued
              ? "Share these details. They sign in, then choose a new password."
              : "Update their details. A password here replaces the current one until they change it."}
          </p>
          </div>
        </div>
        <button
          type="button"
          className="flex size-8 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-950"
          aria-label="Close"
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </div>
      <div className="space-y-4 px-5 py-4">
        {issued ? (
          <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
            <div className="flex items-start justify-between gap-3">
              <dl className="min-w-0 space-y-3 text-sm">
                <AccessDetail label="Website" value={issued.website} />
                <AccessDetail label="Login email" value={issued.email} />
                <AccessDetail label="Temporary password" value={issued.password} />
              </dl>
              <button
                type="button"
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-stone-500 hover:bg-white hover:text-stone-950"
                aria-label={copied ? "Details copied" : "Copy details"}
                onClick={copyDetails}
              >
                {copied ? <CheckIcon /> : <CopyIcon />}
              </button>
            </div>
          </div>
        ) : (
          <>
            <label className="block text-sm font-medium text-stone-800">
              Name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                required
                className={fieldClass}
              />
            </label>
            <label className="block text-sm font-medium text-stone-800">
              Email
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                autoComplete="email"
                required
                className={fieldClass}
              />
            </label>
            <label className="block text-sm font-medium text-stone-800">
              Temporary password
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete="new-password"
                placeholder="Leave blank to keep the current password"
                aria-describedby={password.length > 0 ? "edit-password-rules" : undefined}
                className={fieldClass}
              />
              {password.length > 0 ? (
                <ul id="edit-password-rules" className="mt-2 space-y-1" aria-live="polite">
                  {passwordChecks.map((check) => {
                    const met = check.test(password);
                    return (
                      <li
                        key={check.label}
                        className={`text-xs font-normal ${met ? "text-emerald-600" : "text-stone-400"}`}
                      >
                        {check.label}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </label>
          </>
        )}
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        {issued ? (
          <div className="flex justify-end">
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium text-stone-800 hover:bg-stone-50"
              onClick={onClose}
            >
              Done
            </button>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium text-stone-800 hover:bg-stone-50"
              onClick={onClose}
            >
              Cancel
            </button>
            <button type="submit" className={primaryButtonClass} disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        )}
      </div>
    </form>
  );
}

function AccessLogDialog({ member, onClose }: { member: TeamMember; onClose: () => void }) {
  const [entries, setEntries] = useState<AccessLogEntry[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    listAccessLogAction(member.id).then((rows) => {
      if (!active) {
        return;
      }

      const byId = new Map<string, AccessLogEntry>();
      for (const entry of [...readLocalAccessLog(member.id), ...rows]) {
        byId.set(entry.id, entry);
      }

      setEntries(
        [...byId.values()].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)),
      );
      setReady(true);
    });

    return () => {
      active = false;
    };
  }, [member.id]);

  return (
    <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-stone-200 px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-700">
            <LogIcon />
          </span>
          <div className="min-w-0">
          <h2 id="team-access-log-title" className="text-base font-semibold tracking-tight">
            Access log
          </h2>
          <p className="mt-1 text-sm text-stone-500">
            {member.name}
            {member.email ? ` · ${member.email}` : ""}
          </p>
          </div>
        </div>
        <button
          type="button"
          className="flex size-8 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-950"
          aria-label="Close"
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!ready ? (
          <p className="px-5 py-8 text-sm text-stone-500">Loading the record…</p>
        ) : entries.length === 0 ? (
          <p className="px-5 py-8 text-sm text-stone-500">No access or edits recorded yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-stone-50 text-stone-500">
              <tr>
                <th className="border-b border-stone-200 px-5 py-2 font-medium">When</th>
                <th className="border-b border-stone-200 px-5 py-2 font-medium">Record</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="border-b border-stone-100 px-5 py-2 align-top whitespace-nowrap text-stone-600">
                    {formatWhen(entry.occurredAt)}
                  </td>
                  <td className="border-b border-stone-100 px-5 py-2 text-stone-950">
                    <span
                      className={`mr-2 inline-flex h-5 items-center rounded-full px-1.5 text-[11px] font-medium ${
                        entry.kind === "edit"
                          ? "bg-stone-100 text-stone-700"
                          : "bg-sky-50 text-sky-800"
                      }`}
                    >
                      {entry.kind === "edit" ? "Edited" : "Access"}
                    </span>
                    {entry.summary}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function RemoveDialog({
  member,
  onRemoved,
  onError,
  onClose,
}: {
  member: TeamMember;
  onRemoved: (id: string) => void;
  onError: (message: string) => void;
  onClose: () => void;
}) {
  const [pending, setPending] = useState(false);

  async function remove() {
    setPending(true);
    const result = await removeTeamMemberAction(member.id);
    setPending(false);
    if (result.error) {
      onError(result.error);
      onClose();
      return;
    }

    onRemoved(member.id);
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4 border-b border-stone-200 px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-700">
            <TrashIcon />
          </span>
          <div className="min-w-0">
          <h2 id="remove-team-member-title" className="text-base font-semibold tracking-tight">
            Remove {member.name}
          </h2>
          <p className="mt-1 text-sm text-stone-500">
            Their sign-in is deleted. This cannot be undone.
          </p>
          </div>
        </div>
        <button
          type="button"
          className="flex size-8 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-950"
          aria-label="Close"
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </div>
      <div className="flex justify-end gap-2 px-5 py-4">
        <button
          type="button"
          className="inline-flex h-9 items-center justify-center rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium text-stone-800 hover:bg-stone-50"
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          type="button"
          className="inline-flex h-9 items-center justify-center rounded-lg bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-60"
          disabled={pending}
          onClick={remove}
        >
          {pending ? "Removing…" : "Remove"}
        </button>
      </div>
    </div>
  );
}

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 3.2v9.6M3.2 8h9.6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function BlockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="5.25" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4.3 11.7 11.7 4.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3.2 4.4h9.6M6.2 4.3V2.8h3.6v1.5M4.4 4.4l.5 8.4h6.2l.5-8.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LogIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="3" y="2.5" width="10" height="11" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5.5 6h5M5.5 8.5h5M5.5 11h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M9.8 2.6 13.4 6.2 5.6 14H2v-3.6L9.8 2.6Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M8.4 4 12 7.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
