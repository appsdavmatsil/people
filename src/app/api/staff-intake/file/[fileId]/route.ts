import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDriveClient } from "@/lib/google-drive";

export const runtime = "nodejs";

/**
 * Streams a single staff-document file from the Shared Drive for inline preview
 * in the admin documents page.
 *
 * Access control:
 *   - Requires an authenticated app session (same gate as the rest of /app).
 *   - Only serves file ids that are actually referenced by a row in
 *     staff_intake_submissions, so this cannot be used to read arbitrary Drive
 *     files.
 */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/staff-intake/file/[fileId]">,
): Promise<Response> {
  const { fileId } = await ctx.params;

  // Must be signed in.
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (typeof claims?.claims?.sub !== "string") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // The file id must belong to a recorded submission.
  const { data: match } = await supabase
    .from("staff_intake_submissions")
    .select("id")
    .filter("documents", "cs", JSON.stringify([{ file_id: fileId }]))
    .limit(1)
    .maybeSingle();

  if (!match) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const drive = getDriveClient();
    const meta = await drive.files.get({
      fileId,
      fields: "mimeType, name",
      supportsAllDrives: true,
    });
    const response = await drive.files.get(
      { fileId, alt: "media", supportsAllDrives: true },
      { responseType: "arraybuffer" },
    );

    const buffer = Buffer.from(response.data as ArrayBuffer);
    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": meta.data.mimeType ?? "application/octet-stream",
        "Cache-Control": "private, max-age=300",
        "Content-Disposition": `inline; filename="${meta.data.name ?? fileId}"`,
      },
    });
  } catch (error) {
    console.error("Drive file stream failed:", error);
    return NextResponse.json({ error: "Could not load file" }, { status: 502 });
  }
}
