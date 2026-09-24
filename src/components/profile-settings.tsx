"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { changePasswordAction, updateProfileAction, type ProfileState } from "@/lib/auth/profile";
import { passwordChecks } from "@/lib/auth/password";
import { profileAvatarEvent, profileAvatarKey } from "@/lib/profile-avatar";

const fieldClass =
  "mt-1.5 h-9 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none focus:border-stone-950";
const primaryButtonClass =
  "inline-flex h-9 items-center justify-center rounded-lg bg-stone-950 px-3 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-60";

export function ProfileSettings({
  userId,
  name,
  email,
}: {
  userId: string;
  name: string;
  email: string;
}) {
  const router = useRouter();
  const photoRef = useRef<HTMLInputElement>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState("");
  const [password, setPassword] = useState("");
  const [profileState, saveProfile, profilePending] = useActionState<ProfileState, FormData>(
    updateProfileAction,
    null,
  );
  const [passwordState, savePassword, passwordPending] = useActionState<ProfileState, FormData>(
    changePasswordAction,
    null,
  );

  useEffect(() => {
    setAvatar(window.localStorage.getItem(profileAvatarKey(userId)));
  }, [userId]);

  useEffect(() => {
    if (profileState?.message) {
      router.refresh();
    }
  }, [profileState, router]);

  function updatePhoto(file: File | null) {
    setPhotoError("");
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setPhotoError("Choose an image file.");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setPhotoError("Use an image under 2 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const photo = typeof reader.result === "string" ? reader.result : null;
      if (!photo) {
        setPhotoError("Could not read that image.");
        return;
      }

      window.localStorage.setItem(profileAvatarKey(userId), photo);
      window.dispatchEvent(new Event(profileAvatarEvent));
      setAvatar(photo);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="max-w-xl space-y-10">
      <form action={saveProfile} className="space-y-4">
        <div>
          <p className="text-sm font-medium text-stone-800">Profile picture</p>
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              className="flex size-16 items-center justify-center overflow-hidden rounded-full bg-stone-900 text-sm font-medium text-white"
              aria-label={avatar ? "Update profile picture" : "Upload profile picture"}
              onClick={() => photoRef.current?.click()}
            >
              {avatar ? (
                <img src={avatar} alt="" className="size-full object-cover" />
              ) : (
                initials(name, email)
              )}
            </button>
            <button
              type="button"
              className="text-sm font-medium text-stone-700 underline-offset-4 hover:text-stone-950 hover:underline"
              onClick={() => photoRef.current?.click()}
            >
              {avatar ? "Update" : "Upload"}
            </button>
          </div>
          {photoError ? <p className="mt-2 text-sm text-red-700">{photoError}</p> : null}
          <input
            ref={photoRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(event) => updatePhoto(event.target.files?.[0] ?? null)}
          />
        </div>
        <label className="block text-sm font-medium text-stone-800">
          Name
          <input
            name="name"
            type="text"
            autoComplete="name"
            required
            defaultValue={name}
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
            defaultValue={email}
            className={fieldClass}
          />
        </label>
        {profileState?.error ? <p className="text-sm text-red-700">{profileState.error}</p> : null}
        {profileState?.message ? (
          <p className="text-sm text-emerald-800">{profileState.message}</p>
        ) : null}
        <button type="submit" className={primaryButtonClass} disabled={profilePending}>
          {profilePending ? "Saving…" : "Save profile"}
        </button>
      </form>

      <form action={savePassword} className="space-y-4 border-t border-stone-200 pt-8">
        <p className="text-sm font-medium text-stone-950">Change password</p>
        <label className="block text-sm font-medium text-stone-800">
          New password
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-describedby={password.length > 0 ? "profile-password-rules" : undefined}
            className={fieldClass}
          />
          {password.length > 0 ? (
            <ul id="profile-password-rules" className="mt-2 space-y-1" aria-live="polite">
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
        <label className="block text-sm font-medium text-stone-800">
          Confirm password
          <input
            name="confirmation"
            type="password"
            autoComplete="new-password"
            required
            className={fieldClass}
          />
        </label>
        {passwordState?.error ? (
          <p className="text-sm text-red-700">{passwordState.error}</p>
        ) : null}
        {passwordState?.message ? (
          <p className="text-sm text-emerald-800">{passwordState.message}</p>
        ) : null}
        <button type="submit" className={primaryButtonClass} disabled={passwordPending}>
          {passwordPending ? "Saving…" : "Change password"}
        </button>
      </form>
    </div>
  );
}

function initials(name: string, email: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
  }

  if (parts[0]) {
    return parts[0].charAt(0).toUpperCase();
  }

  return email.charAt(0).toUpperCase() || "?";
}
