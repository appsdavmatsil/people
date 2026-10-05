import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  challengeToken,
  lockedMessage,
  lockedMinutes,
  pickQuestion,
  recordFailure,
  type SubmissionRow,
} from "@/lib/staff-intake-edit";

export const runtime = "nodejs";

const WRONG = "That email and code don't match. Check the code HR gave you and try again.";

/**
 * Step 1 of a self-service edit: email + 6-digit edit code. Returns a security
 * question about the person's own earlier answers and a challenge token.
 * Errors never reveal whether the email exists.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json().catch(() => null)) as { email?: unknown; code?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const code = typeof body?.code === "string" ? body.code.replace(/\D/g, "") : "";
  if (!email || code.length !== 6) {
    return NextResponse.json({ error: "Enter your email and the 6-digit code from HR." }, { status: 400 });
  }

  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Updates are not available right now. Please contact HR." }, { status: 503 });
  }

  // All submissions for this email (a person may have submitted twice).
  const pattern = email.replace(/[\\%_]/g, (char) => `\\${char}`);
  const { data, error } = await supabase
    .from("staff_intake_submissions")
    .select("id, email, edit_code, edit_failed_attempts, edit_locked_until, date_of_birth, passport_number, emirates_id_number, phone, whatsapp")
    .ilike("email", pattern);
  if (error) {
    console.error("Staff edit lookup failed:", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  const rows = (data ?? []) as SubmissionRow[];
  if (!rows.length) {
    return NextResponse.json({ error: WRONG }, { status: 401 });
  }

  const locked = Math.max(...rows.map(lockedMinutes));
  if (locked) {
    return NextResponse.json({ error: lockedMessage(locked) }, { status: 429 });
  }

  const row = rows.find((item) => item.edit_code === code);
  if (!row) {
    // Count the wrong code against every submission for this email.
    const left = Math.min(...(await Promise.all(rows.map((item) => recordFailure(supabase, item)))));
    return NextResponse.json(
      { error: left > 0 ? WRONG : lockedMessage(15) },
      { status: left > 0 ? 401 : 429 },
    );
  }

  const question = pickQuestion(row);
  if (!question) {
    return NextResponse.json(
      { error: "We can't verify this submission automatically. Please contact HR to update your details." },
      { status: 409 },
    );
  }

  return NextResponse.json({ challenge: challengeToken(row.id, question.key), question });
}
