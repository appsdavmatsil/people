import "server-only";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Self-service editing of a staff-details submission.
 *
 * 1. start:  email + 6-digit edit code (handed out by HR) -> a security
 *            question drawn from the person's own earlier answers, plus a
 *            short-lived signed "challenge" token.
 * 2. verify: challenge token + answer -> a signed "edit" token and the
 *            submission's current values.
 * 3. save:   edit token + the updated form -> the same submission is updated.
 *
 * Tokens are stateless (HMAC-signed). Wrong codes or answers count against the
 * submission and lock it for a while after MAX_ATTEMPTS.
 */

export const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const EDIT_TTL_MS = 30 * 60 * 1000;

export type SubmissionRow = Record<string, unknown> & {
  id: string;
  email: string;
  edit_code: string | null;
  edit_failed_attempts: number | null;
  edit_locked_until: string | null;
};

// ---------------------------------------------------------------- tokens ----

type TokenPayload = { sid: string; stage: "challenge" | "edit"; q?: QuestionKey; exp: number };

function signingKey(): Buffer {
  const base = process.env.STAFF_EDIT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base) throw new Error("No secret configured for staff edit tokens.");
  // Derived key, so the service-role key itself is never used directly.
  return createHmac("sha256", base).update("staff-intake-edit:v1").digest();
}

function b64url(data: Buffer | string): string {
  return Buffer.from(data).toString("base64url");
}

function mac(body: string): Buffer {
  return createHmac("sha256", signingKey()).update(body).digest();
}

function signToken(payload: TokenPayload): string {
  const body = b64url(JSON.stringify(payload));
  return `${body}.${b64url(mac(body))}`;
}

export function verifyToken(token: unknown, stage: TokenPayload["stage"]): TokenPayload | null {
  if (typeof token !== "string") return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = mac(body);
  const given = Buffer.from(signature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TokenPayload;
    if (payload.stage !== stage || typeof payload.sid !== "string" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function challengeToken(sid: string, q: QuestionKey): string {
  return signToken({ sid, stage: "challenge", q, exp: Date.now() + CHALLENGE_TTL_MS });
}

export function editToken(sid: string): string {
  return signToken({ sid, stage: "edit", exp: Date.now() + EDIT_TTL_MS });
}

// ------------------------------------------------------------- questions ----

export type QuestionKey = "dob" | "passport4" | "eid4" | "phone4" | "whatsapp4";

type Question = {
  key: QuestionKey;
  label: string;
  kind: "date" | "text";
  /** The expected answer from the stored submission, or null if not available. */
  answer: (row: SubmissionRow) => string | null;
};

const lettersAndDigits = (value: unknown) =>
  typeof value === "string" ? value.toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
const digits = (value: unknown) => (typeof value === "string" ? value.replace(/\D/g, "") : "");
const lastFour = (value: string) => (value.length >= 4 ? value.slice(-4) : null);

const QUESTIONS: Question[] = [
  {
    key: "dob",
    label: "What is your date of birth?",
    kind: "date",
    answer: (row) => (typeof row.date_of_birth === "string" && row.date_of_birth ? row.date_of_birth : null),
  },
  {
    key: "passport4",
    label: "What are the last 4 characters of your passport number?",
    kind: "text",
    answer: (row) => lastFour(lettersAndDigits(row.passport_number)),
  },
  {
    key: "eid4",
    label: "What are the last 4 digits of your Emirates ID number?",
    kind: "text",
    answer: (row) => lastFour(digits(row.emirates_id_number)),
  },
  {
    key: "phone4",
    label: "What are the last 4 digits of your phone number?",
    kind: "text",
    answer: (row) => lastFour(digits(row.phone)),
  },
  {
    key: "whatsapp4",
    label: "What are the last 4 digits of your WhatsApp number?",
    kind: "text",
    answer: (row) => lastFour(digits(row.whatsapp)),
  },
];

/** A random question the submission can answer, or null if it has no usable details. */
export function pickQuestion(row: SubmissionRow): { key: QuestionKey; label: string; kind: "date" | "text" } | null {
  const usable = QUESTIONS.filter((question) => question.answer(row));
  if (!usable.length) return null;
  const { key, label, kind } = usable[randomInt(usable.length)];
  return { key, label, kind };
}

export function questionByKey(key: QuestionKey | undefined) {
  const question = QUESTIONS.find((item) => item.key === key);
  return question ? { key: question.key, label: question.label, kind: question.kind } : null;
}

export function answerMatches(row: SubmissionRow, key: QuestionKey | undefined, given: unknown): boolean {
  const question = QUESTIONS.find((item) => item.key === key);
  const expected = question?.answer(row);
  if (!question || !expected || typeof given !== "string") return false;
  const answer = question.kind === "date" ? given.trim() : lettersAndDigits(given);
  const a = Buffer.from(answer);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// --------------------------------------------------------------- lockout ----

export function lockedMinutes(row: SubmissionRow): number {
  const until = row.edit_locked_until ? Date.parse(row.edit_locked_until) : 0;
  return until > Date.now() ? Math.ceil((until - Date.now()) / 60000) : 0;
}

/** Counts a failed attempt; locks the submission after MAX_ATTEMPTS. Returns attempts left. */
export async function recordFailure(supabase: SupabaseClient, row: SubmissionRow): Promise<number> {
  const attempts = (row.edit_failed_attempts ?? 0) + 1;
  const locked = attempts >= MAX_ATTEMPTS;
  await supabase
    .from("staff_intake_submissions")
    .update({
      edit_failed_attempts: locked ? 0 : attempts,
      edit_locked_until: locked ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() : row.edit_locked_until,
    })
    .eq("id", row.id);
  return locked ? 0 : MAX_ATTEMPTS - attempts;
}

export async function clearFailures(supabase: SupabaseClient, row: SubmissionRow): Promise<void> {
  if (!row.edit_failed_attempts && !row.edit_locked_until) return;
  await supabase
    .from("staff_intake_submissions")
    .update({ edit_failed_attempts: 0, edit_locked_until: null })
    .eq("id", row.id);
}

export function lockedMessage(minutes: number): string {
  return `Too many attempts. Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}, or contact HR.`;
}
