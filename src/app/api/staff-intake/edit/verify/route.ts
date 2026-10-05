import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { loadFormConfig } from "@/lib/form-config";
import { valuesFromRow, type StoredDocument } from "@/lib/staff-intake-submit";
import {
  answerMatches,
  clearFailures,
  editToken,
  lockedMessage,
  lockedMinutes,
  questionByKey,
  recordFailure,
  verifyToken,
  type SubmissionRow,
} from "@/lib/staff-intake-edit";

export const runtime = "nodejs";

/**
 * Step 2 of a self-service edit: the answer to the security question. Returns
 * an edit token and the submission's current values and documents.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json().catch(() => null)) as { challenge?: unknown; answer?: unknown } | null;
  const challenge = verifyToken(body?.challenge, "challenge");
  if (!challenge) {
    return NextResponse.json({ error: "This check has expired. Please start again." }, { status: 401 });
  }

  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Updates are not available right now. Please contact HR." }, { status: 503 });
  }

  const { data } = await supabase.from("staff_intake_submissions").select("*").eq("id", challenge.sid).maybeSingle();
  const row = data as SubmissionRow | null;
  if (!row) {
    return NextResponse.json({ error: "This submission no longer exists. Please contact HR." }, { status: 404 });
  }

  const locked = lockedMinutes(row);
  if (locked) {
    return NextResponse.json({ error: lockedMessage(locked) }, { status: 429 });
  }

  if (!answerMatches(row, challenge.q, body?.answer)) {
    const left = await recordFailure(supabase, row);
    return NextResponse.json(
      {
        error: left > 0
          ? `That answer doesn't match our records. ${left} attempt${left === 1 ? "" : "s"} left.`
          : lockedMessage(15),
        question: questionByKey(challenge.q),
      },
      { status: left > 0 ? 401 : 429 },
    );
  }

  await clearFailures(supabase, row);

  const config = await loadFormConfig();
  const stored = (Array.isArray(row.documents) ? row.documents : []) as StoredDocument[];
  return NextResponse.json({
    token: editToken(row.id),
    values: valuesFromRow(row, config.textFields),
    documents: config.documents.map((doc) => {
      const existing = stored.find((item) => item.label === doc.label);
      return { field: doc.field, label: doc.label, fileName: existing?.file_name ?? null };
    }),
  });
}
