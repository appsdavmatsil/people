import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

type RouteContext = { params: Promise<{ submissionId: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database access is not configured." }, { status: 503 });
  }

  const { submissionId } = await context.params;
  const { error } = await supabase.from("staff_intake_submissions").delete().eq("id", submissionId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
