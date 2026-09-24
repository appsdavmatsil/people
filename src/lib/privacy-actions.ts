"use server";

import { createClient } from "@/lib/supabase/server";
import {
  defaultPrivacySnapshot,
  defaultProtectedFeatures,
  positionKey,
  privacyFeatures,
  privacyPages,
  type PrivacyFeatureId,
  type PrivacyPageHref,
  type PrivacySnapshot,
} from "@/lib/privacy";

type PrivacyResult = { snapshot?: PrivacySnapshot; error?: string };

function textList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function parsePrivacySnapshot(value: unknown): PrivacySnapshot | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const row = value as Record<string, unknown>;

  if (typeof row.passwordEnabled !== "boolean" || typeof row.stamp !== "string") {
    return null;
  }

  return {
    passwordEnabled: row.passwordEnabled,
    stamp: row.stamp,
    isOwner: row.isOwner === true,
    showHiring: row.showHiring !== false,
    showPromotions: row.showPromotions !== false,
    hiddenSalaryPositions: textList(row.hiddenSalaryPositions),
    protectedPages: textList(row.protectedPages),
    protectedFeatures:
      row.protectedFeatures === undefined ? [...defaultProtectedFeatures] : textList(row.protectedFeatures),
  };
}

function message(error: { message: string }) {
  return error.message.replace(/^.*ERROR:\s*/i, "").trim() || "Could not save that change.";
}

async function client() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (typeof data?.claims?.sub !== "string") {
    return null;
  }

  return supabase;
}

export async function privacyStatusAction(): Promise<PrivacyResult> {
  const supabase = await client();

  if (!supabase) {
    return { error: "Sign in again." };
  }

  const { data, error } = await supabase.rpc("privacy_status");

  if (error) {
    return { error: message(error) };
  }

  const snapshot = parsePrivacySnapshot(data);
  return snapshot ? { snapshot } : { snapshot: defaultPrivacySnapshot, error: "Privacy settings are unavailable." };
}

export async function privacyUnlockAction(password: string): Promise<PrivacyResult & { ok?: boolean }> {
  const supabase = await client();

  if (!supabase) {
    return { error: "Sign in again." };
  }

  const { data, error } = await supabase.rpc("privacy_unlock", { candidate: password });

  if (error) {
    return { error: message(error) };
  }

  const snapshot = parsePrivacySnapshot(data);
  const ok = Boolean(data && typeof data === "object" && (data as { ok?: boolean }).ok);

  if (!snapshot) {
    return { error: "Privacy settings are unavailable." };
  }

  return { ok, snapshot };
}

export async function saveDashboardVisibilityAction(input: {
  password: string;
  showHiring: boolean;
  showPromotions: boolean;
  hiddenSalaryPositions: string[];
}): Promise<PrivacyResult> {
  const supabase = await client();

  if (!supabase) {
    return { error: "Sign in again." };
  }

  const hidden = [...new Set(input.hiddenSalaryPositions.map(positionKey).filter(Boolean))].slice(0, 200);
  const { data, error } = await supabase.rpc("save_dashboard_visibility", {
    candidate: input.password,
    show_hiring: input.showHiring,
    show_promotions: input.showPromotions,
    hidden_salary_positions: hidden,
  });

  if (error) {
    return { error: message(error) };
  }

  const snapshot = parsePrivacySnapshot(data);
  return snapshot ? { snapshot } : { error: "Could not save visibility." };
}

export async function setPrivacyPasswordAction(password: string): Promise<PrivacyResult> {
  const supabase = await client();

  if (!supabase) {
    return { error: "Sign in again." };
  }

  const next = password.trim();

  if (!next) {
    return { error: "Enter a password." };
  }

  const { data, error } = await supabase.rpc("set_privacy_password", { next_password: next });

  if (error) {
    return { error: message(error) };
  }

  const snapshot = parsePrivacySnapshot(data);
  return snapshot ? { snapshot } : { error: "Could not change the password." };
}

export async function setPrivacyEnabledAction(enabled: boolean): Promise<PrivacyResult> {
  const supabase = await client();

  if (!supabase) {
    return { error: "Sign in again." };
  }

  const { data, error } = await supabase.rpc("set_privacy_password_enabled", { enabled });

  if (error) {
    return { error: message(error) };
  }

  const snapshot = parsePrivacySnapshot(data);
  return snapshot ? { snapshot } : { error: "Could not update password protection." };
}

export async function setProtectedPagesAction(pages: string[]): Promise<PrivacyResult> {
  const supabase = await client();

  if (!supabase) {
    return { error: "Sign in again." };
  }

  const allowed = new Set<string>(privacyPages.map((page) => page.href));
  const cleaned = [...new Set(pages.filter((page): page is PrivacyPageHref => allowed.has(page)))];
  const { data, error } = await supabase.rpc("set_protected_pages", { pages: cleaned });

  if (error) {
    return { error: message(error) };
  }

  const snapshot = parsePrivacySnapshot(data);
  return snapshot ? { snapshot } : { error: "Could not save protected pages." };
}

export async function setProtectedFeaturesAction(features: string[]): Promise<PrivacyResult> {
  const supabase = await client();

  if (!supabase) {
    return { error: "Sign in again." };
  }

  const allowed = new Set<string>(privacyFeatures.map((feature) => feature.id));
  const cleaned = [...new Set(features.filter((feature): feature is PrivacyFeatureId => allowed.has(feature)))];
  const { data, error } = await supabase.rpc("set_protected_features", { features: cleaned });

  if (error) {
    return { error: message(error) };
  }

  const snapshot = parsePrivacySnapshot(data);
  return snapshot ? { snapshot } : { error: "Could not save protected features." };
}
