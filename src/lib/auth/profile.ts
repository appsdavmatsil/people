"use server";

import { passwordError } from "@/lib/auth/password";
import { recordActivityAction } from "@/lib/auth/team";
import { createClient } from "@/lib/supabase/server";

export type ProfileState = {
  error?: string;
  message?: string;
} | null;

function text(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function updateProfileAction(
  _state: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (!user) {
    return { error: "Sign in again, then save your profile." };
  }

  const name = text(formData, "name").replace(/\s+/g, " ");
  const email = text(formData, "email").toLowerCase();

  if (!name) {
    return { error: "Enter your name." };
  }

  if (!email) {
    return { error: "Enter an email address." };
  }

  const { error: nameError } = await supabase
    .from("users")
    .update({ name })
    .eq("id", user.id);

  if (nameError) {
    return { error: nameError.message };
  }

  const { error: metadataError } = await supabase.auth.updateUser({
    data: { name },
  });

  if (metadataError) {
    return { error: metadataError.message };
  }

  if (email === user.email) {
    await recordActivityAction("edit", "Updated their profile", crypto.randomUUID());
    return { message: "Profile saved." };
  }

  const { data: updated, error: emailError } = await supabase.auth.updateUser({
    email,
  });

  if (emailError) {
    return { error: emailError.message };
  }

  if (updated.user?.email !== email) {
    await recordActivityAction("edit", "Updated their profile", crypto.randomUUID());
    return { message: "Check your email to confirm the new address." };
  }

  await recordActivityAction("edit", "Updated their profile", crypto.randomUUID());
  return { message: "Profile saved." };
}

export async function changePasswordAction(
  _state: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (typeof data?.claims?.sub !== "string") {
    return { error: "Sign in again, then change your password." };
  }

  const password = text(formData, "password");
  const confirmation = text(formData, "confirmation");
  const invalid = passwordError(password, confirmation);

  if (invalid) {
    return { error: invalid };
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { error: error.message };
  }

  await recordActivityAction("edit", "Changed their password", crypto.randomUUID());
  return { message: "Password changed." };
}
