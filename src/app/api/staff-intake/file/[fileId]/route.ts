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
 *
 * Performance: the Form Responses table requests hundreds of thumbnails at
 * once, so the allowed-id list and thumbnails are cached per server instance,
 * Drive calls retry on rate limits, and responses are cached in the browser.
 */

const ALLOWED_TTL_MS = 60_000;
const THUMB_CACHE_BYTES = 40 * 1024 * 1024;

let allowed: { ids: Set<string>; at: number } | null = null;
const thumbCache = new Map<string, { body: Buffer; type: string }>();
let thumbCacheBytes = 0;

async function loadAllowedIds(): Promise<Set<string> | null> {
  const service = createServiceClient();
  if (!service) return null;
  const { data, error } = await service.from("staff_intake_submissions").select("documents");
  if (error) throw error;
  const ids = new Set<string>();
  for (const row of data ?? []) {
    for (const doc of (row.documents ?? []) as { file_id?: string }[]) {
      if (doc.file_id) ids.add(doc.file_id);
    }
  }
  allowed = { ids, at: Date.now() };
  return ids;
}

// Uses the cached id list, reloading it when stale or when the id is unknown
// (so a brand-new submission is servable straight away).
async function isAllowed(fileId: string): Promise<boolean | null> {
  if (allowed && Date.now() - allowed.at < ALLOWED_TTL_MS && allowed.ids.has(fileId)) {
    return true;
  }
  const ids = await loadAllowedIds();
  return ids ? ids.has(fileId) : null;
}

function isRetryable(error: unknown): boolean {
  const status = (error as { status?: number; code?: number })?.status ?? (error as { code?: number })?.code;
  return status === 429 || status === 403 || (typeof status === "number" && status >= 500);
}

// Retries Drive calls that hit rate limits or transient errors.
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= attempts || !isRetryable(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt + Math.random() * 200));
    }
  }
}

function rememberThumb(key: string, body: Buffer, type: string) {
  // Evict the oldest entries until the new one fits the memory budget.
  while (thumbCache.size && thumbCacheBytes + body.length > THUMB_CACHE_BYTES) {
    const [oldestKey, oldest] = thumbCache.entries().next().value!;
    thumbCache.delete(oldestKey);
    thumbCacheBytes -= oldest.body.length;
  }
  thumbCache.set(key, { body, type });
  thumbCacheBytes += body.length;
}

const THUMB_HEADERS = { "Cache-Control": "private, max-age=86400, stale-while-revalidate=604800" };

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

  const searchParams = new URL(_request.url).searchParams;
  const wantThumb = searchParams.get("thumb") === "1";
  // Thumbnail width in pixels (Drive renders previews for images, PDFs, Office
  // files and more). Large sizes back the full preview for types browsers can't show.
  const size = Math.min(1600, Math.max(100, Number(searchParams.get("size")) || 400));
  // `v` changes when the employee replaces the file (same id, new version).
  const cacheKey = `${fileId}:${size}:${searchParams.get("v") ?? ""}`;
  const cached = wantThumb ? thumbCache.get(cacheKey) : undefined;
  if (cached) {
    return new Response(new Uint8Array(cached.body), {
      status: 200,
      headers: { ...THUMB_HEADERS, "Content-Type": cached.type },
    });
  }

  // The file id must belong to a recorded submission.
  let permitted: boolean | null;
  try {
    permitted = await isAllowed(fileId);
  } catch (error) {
    console.error("Staff intake file lookup failed:", error);
    return NextResponse.json({ error: "Could not load file" }, { status: 502 });
  }
  if (permitted === null) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }
  if (!permitted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const drive = getDriveClient();

    // Thumbnail mode: serve Google Drive's generated thumbnail (works for
    // images AND PDFs — shows the first page). Used for small table previews.
    if (wantThumb) {
      const meta = await withRetry(() =>
        drive.files.get({ fileId, fields: "thumbnailLink", supportsAllDrives: true }),
      );
      const link = meta.data.thumbnailLink;
      if (link) {
        // Request a larger thumbnail by bumping the size param Drive appends.
        const bigger = link.replace(/=s\d+$/, `=s${size}`);
        const thumb = await withRetry(async () => {
          const response = await fetch(bigger);
          if (!response.ok) throw Object.assign(new Error("Thumbnail fetch failed"), { status: response.status });
          return response;
        }).catch(() => null);
        if (thumb) {
          const body = Buffer.from(await thumb.arrayBuffer());
          const type = thumb.headers.get("content-type") ?? "image/jpeg";
          rememberThumb(cacheKey, body, type);
          return new Response(new Uint8Array(body), {
            status: 200,
            headers: { ...THUMB_HEADERS, "Content-Type": type },
          });
        }
      }
      // Fall through to full file if no thumbnail is available.
    }

    const meta = await withRetry(() =>
      drive.files.get({ fileId, fields: "mimeType, name", supportsAllDrives: true }),
    );
    const response = await withRetry(() =>
      drive.files.get(
        { fileId, alt: "media", supportsAllDrives: true },
        { responseType: "arraybuffer" },
      ),
    );

    const buffer = Buffer.from(response.data as ArrayBuffer);
    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": meta.data.mimeType ?? "application/octet-stream",
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": `inline; filename="${meta.data.name ?? fileId}"`,
      },
    });
  } catch (error) {
    console.error("Drive file stream failed:", error);
    return NextResponse.json({ error: "Could not load file" }, { status: 502 });
  }
}
