"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  recoverPasswordAction,
  setPasswordAction,
  signInAction,
  signUpAction,
  type AuthState,
} from "@/lib/auth/actions";
import { passwordChecks } from "@/lib/auth/password";

const fieldClass =
  "mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-950 outline-none focus:border-stone-950";
const buttonClass =
  "flex h-10 w-full items-center justify-center rounded-lg bg-stone-950 text-sm font-medium text-white disabled:opacity-60";

export function LoginForm({
  mode,
  canSetPassword,
  notice,
  initialEmail = "",
}: {
  mode: "sign-in" | "create" | "recover";
  canSetPassword: boolean;
  notice?: string;
  initialEmail?: string;
}) {
  return (
    <div className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      {canSetPassword ? (
        <SetPasswordForm />
      ) : mode === "create" ? (
        <CreateAccountForm />
      ) : mode === "recover" ? (
        <RecoverForm notice={notice} />
      ) : (
        <SignInForm notice={notice} initialEmail={initialEmail} />
      )}
    </div>
  );
}

function SignInForm({ notice, initialEmail }: { notice?: string; initialEmail: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    signInAction,
    null,
  );

  return (
    <form action={action} className="space-y-4">
      <EmailField defaultValue={initialEmail} />
      <PasswordField autoComplete="current-password" />
      <label className="flex items-center gap-2 text-sm text-stone-700">
        <input
          type="checkbox"
          name="remember"
          className="size-4 rounded border-stone-300 accent-stone-950"
        />
        Remember password
      </label>
      <FormFeedback error={state?.error} message={notice} />
      <button type="submit" className={buttonClass} disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <FormLinks />
    </form>
  );
}

function CreateAccountForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    signUpAction,
    null,
  );

  return (
    <form action={action} className="space-y-4">
      <p className="text-sm font-medium text-stone-950">Create account</p>
      <NameField />
      <EmailField />
      <PasswordField autoComplete="new-password" rules />
      <PasswordField
        name="confirmation"
        label="Confirm password"
        autoComplete="new-password"
      />
      <FormFeedback error={state?.error} message={state?.message} />
      <button type="submit" className={buttonClass} disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </button>
      <p className="text-sm text-stone-500">
        <Link href="/login" className="text-stone-950 underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}

function RecoverForm({ notice }: { notice?: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    recoverPasswordAction,
    null,
  );

  return (
    <form action={action} className="space-y-4">
      <p className="text-sm font-medium text-stone-950">Recover password</p>
      <EmailField />
      <FormFeedback
        error={state?.error ?? notice}
        message={state?.message}
      />
      <button type="submit" className={buttonClass} disabled={pending}>
        {pending ? "Sending…" : "Send recovery link"}
      </button>
      <p className="text-sm text-stone-500">
        <Link href="/login" className="text-stone-950 underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}

function SetPasswordForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    setPasswordAction,
    null,
  );

  return (
    <form action={action} className="space-y-4">
      <p className="text-sm font-medium text-stone-950">Choose a new password</p>
      <PasswordField autoComplete="new-password" rules />
      <PasswordField
        name="confirmation"
        label="Confirm password"
        autoComplete="new-password"
      />
      <FormFeedback error={state?.error} />
      <button type="submit" className={buttonClass} disabled={pending}>
        {pending ? "Saving…" : "Save password"}
      </button>
    </form>
  );
}

function NameField() {
  return (
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
  );
}

function EmailField({ defaultValue = "" }: { defaultValue?: string }) {
  return (
    <label className="block text-sm font-medium text-stone-800">
      Email
      <input
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={defaultValue}
        className={fieldClass}
      />
    </label>
  );
}

function PasswordField({
  name = "password",
  label = "Password",
  autoComplete,
  rules = false,
}: {
  name?: string;
  label?: string;
  autoComplete: string;
  rules?: boolean;
}) {
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const inputId = `${name}-input`;

  return (
    <div>
      <label htmlFor={inputId} className="block text-sm font-medium text-stone-800">
        {label}
      </label>
      <div className="relative mt-1.5">
        <input
          id={inputId}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required
          value={rules ? password : undefined}
          onChange={rules ? (event) => setPassword(event.target.value) : undefined}
          aria-describedby={rules && password.length > 0 ? "password-rules" : undefined}
          className="w-full rounded-lg border border-stone-300 bg-white py-2 pr-10 pl-3 text-sm text-stone-950 outline-none focus:border-stone-950"
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-stone-500 hover:text-stone-950"
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
      {rules && password.length > 0 ? <PasswordRules password={password} /> : null}
    </div>
  );
}

function PasswordRules({ password }: { password: string }) {
  return (
    <ul id="password-rules" className="mt-2 space-y-1" aria-live="polite">
      {passwordChecks.map((check) => {
        const met = check.test(password);

        return (
          <li
            key={check.label}
            className={`flex items-center gap-2 text-xs font-normal ${
              met ? "text-emerald-600" : "text-stone-400"
            }`}
          >
            <CheckIcon />
            {check.label}
          </li>
        );
      })}
    </ul>
  );
}

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M1.5 8s2.2-4 6.5-4 6.5 4 6.5 4-2.2 4-6.5 4S1.5 8 1.5 8Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="1.75" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2.5 2.5 13.5 13.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M6.3 6.5a1.8 1.8 0 0 0 2.5 2.6M3.1 4.7C2.1 5.6 1.5 6.7 1.5 8s2.2 4 6.5 4c1 0 2-.3 2.8-.7M6.7 4.1A8 8 0 0 1 8 4c4.3 0 6.5 4 6.5 4-.4.8-1.1 1.6-1.9 2.2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path
        d="M3 7.2 5.6 9.8 11 4.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FormLinks() {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <Link
        href="/login?mode=create"
        className="text-stone-950 underline-offset-4 hover:underline"
      >
        Create account
      </Link>
      <Link
        href="/login?mode=recover"
        className="text-stone-500 underline-offset-4 hover:text-stone-950 hover:underline"
      >
        Recover password
      </Link>
    </div>
  );
}

function FormFeedback({
  error,
  message,
}: {
  error?: string;
  message?: string;
}) {
  if (error) {
    return <p className="text-sm text-red-700">{error}</p>;
  }

  if (message) {
    return <p className="text-sm text-emerald-800">{message}</p>;
  }

  return null;
}
