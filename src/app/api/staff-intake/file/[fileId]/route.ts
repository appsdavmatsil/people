import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
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

  // Must be signed in (auth-scoped client).
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (typeof claims?.claims?.sub !== "string") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // The file id must belong to a recorded submission. Use the service client
  // for this lookup because the submissions table is RLS-locked to the service
  // role (authenticated users have no row access).
  const service = createServiceClient();
  if (!service) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }
  const { data: match } = await service
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

    // Thumbnail mode: serve Google Drive's generated thumbnail (works for
    // images AND PDFs — shows the first page). Used for small table previews.
    const wantThumb = new URL(_request.url).searchParams.get("thumb") === "1";
    if (wantThumb) {
      const meta = await drive.files.get({
        fileId,
        fields: "thumbnailLink",
        supportsAllDrives: true,
      });
      const link = meta.data.thumbnailLink;
      if (link) {
        // Request a larger thumbnail by bumping the size param Drive appends.
        const bigger = link.replace(/=s\d+$/, "=s400");
        const thumb = await fetch(bigger);
        if (thumb.ok) {
          const buf = Buffer.from(await thumb.arrayBuffer());
          return new Response(buf, {
            status: 200,
            headers: {
              "Content-Type": thumb.headers.get("content-type") ?? "image/jpeg",
              "Cache-Control": "private, max-age=300",
            },
          });
        }
      }
      // Fall through to full file if no thumbnail is available.
    }

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
