import { createServiceClient } from "@/lib/supabase/service";
import { loadHiringConfig } from "@/lib/hiring-config";
import { splitFullName } from "@/lib/staff";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const BUCKET = "hiring-docs";

// CORS — the public maine-forms Vercel app submits here cross-origin.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS });
}

function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: CORS });
}

function slug(s: string): string {
  return (s || "applicant").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "applicant";
}

export async function POST(req: Request): Promise<NextResponse> {
  const supabase = createServiceClient();
  if (!supabase) {
    return json({ ok: false, error: "Server not configured." }, 500);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ ok: false, error: "Invalid form data." }, 400);
  }

  const config = await loadHiringConfig();

  // Text fields
  let fields: Record<string, string> = {};
  try {
    fields = JSON.parse((form.get("fields") as string) || "{}");
  } catch {
    fields = {};
  }

  // Validate required text fields
  for (const f of config.textFields) {
    if (f.required && !String(fields[f.name] ?? "").trim()) {
      return json({ ok: false, error: `Missing required field: ${f.label}` }, 400);
    }
  }

  const typedName = (fields.fullName || `${fields.firstName || ""} ${fields.lastName || ""}`).trim().replace(/\s+/g, " ");
  const split = splitFullName(typedName);
  const first = (fields.firstName || split.firstName).trim();
  const last = (fields.lastName || split.lastName).trim();
  const fullName = typedName || (fields.email || "Applicant");
  const folder = `${Date.now()}_${slug(fullName)}`;

  // Upload documents to Supabase Storage
  const documents: { label: string; file_id: string; file_name: string; web_view_link: string }[] = [];
  for (const d of config.documents) {
    const file = form.get(d.field) as File | null;
    if (!file || typeof file === "string") {
      if (d.required) {
        return json({ ok: false, error: `Missing required document: ${d.label}` }, 400);
      }
      continue;
    }
    const label = (form.get(`${d.field}__label`) as string) || d.label;
    const ext = (file.name.split(".").pop() || "bin").toLowerCase();
    const path = `${folder}/${d.field}.${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: true,
    });
    if (upErr) {
      return json({ ok: false, error: `Upload failed (${d.label}): ${upErr.message}` }, 500);
    }
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    documents.push({ label, file_id: path, file_name: `${d.field}.${ext}`, web_view_link: pub.publicUrl });
  }

  // Known top-level columns; the rest go into data jsonb.
  const TOP = new Set([
    "fullName", "firstName", "lastName", "email", "phone", "dateOfBirth", "nationality",
    "currentAddress", "currentCity", "currentCountry", "instagram", "positionApplied", "currentPosition",
    "experienceYears", "salaryExpectation",
  ]);
  const data: Record<string, unknown> = { source: "people-hiring-form" };
  for (const [k, v] of Object.entries(fields)) {
    if (!TOP.has(k) && v) data[k] = v;
  }

  const row = {
    status: "new",
    full_name: fullName,
    first_name: first || null,
    last_name: last || null,
    email: fields.email || null,
    phone: fields.phone || null,
    date_of_birth: fields.dateOfBirth || null,
    nationality: fields.nationality || null,
    current_address: fields.currentAddress || [fields.currentCity, fields.currentCountry].map((part) => (part || "").trim()).filter(Boolean).join(", ") || null,
    instagram: fields.instagram || null,
    position_applied: fields.positionApplied || fields.currentPosition || null,
    current_position: fields.currentPosition || null,
    experience_years: fields.experienceYears || null,
    salary_expectation: fields.salaryExpectation || null,
    documents,
    data,
  };

  const { error: insErr } = await supabase.from("hiring_submissions").insert(row);
  if (insErr) {
    return json({ ok: false, error: insErr.message }, 500);
  }

  return json({ ok: true });
}
