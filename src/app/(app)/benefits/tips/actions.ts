"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

async function requireAuth() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return typeof data?.claims?.sub === "string";
}

type RunPatch = { month_days?: number; tips_bank?: number; extra?: number; locked?: boolean };

export async function saveTipsRunAction(runId: string, patch: RunPatch) {
  if (!(await requireAuth())) return { ok: false, error: "Not authorized." };
  const sb = createServiceClient();
  if (!sb) return { ok: false, error: "Server not configured." };
  const { error } = await sb.from("venue_tips_runs").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", runId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/benefits/tips");
  return { ok: true };
}

const VENUE_FULL: Record<string, string[]> = {
  BB: ["The MAINE Land Brasserie", "Gui's Burger"],
  JBR: ["The MAINE Oyster Bar & Grill"],
  SC: ["The MAINE Street Eatery"],
  VM: ["The MAINE Beach House"],
};

/** Returns staff-directory people, tagged whether they belong to this venue. */
export async function listDirectoryStaffAction(venue: string): Promise<{ name: string; position: string; here: boolean }[]> {
  if (!(await requireAuth())) return [];
  const sb = createServiceClient();
  if (!sb) return [];
  const { data } = await sb.from("workspace_documents").select("payload")
    .eq("workspace_id", "3056aa8c-5c16-409e-a600-ec15c12d1ac9").eq("doc_key", "people.staff-directory").limit(1);
  const payload = data?.[0]?.payload;
  if (!payload) return [];
  let roster: Record<string, unknown>[] = [];
  try { roster = typeof payload === "string" ? JSON.parse(payload) : payload; } catch { return []; }
  const mine = new Set(VENUE_FULL[venue] ?? []);
  return roster
    .map((s) => ({
      name: String(s.fullName ?? "").trim(),
      position: String(s.position ?? "").trim(),
      here: mine.has(String(s.venue ?? "")),
    }))
    .filter((s) => s.name)
    .sort((a, b) => (a.here === b.here ? a.name.localeCompare(b.name) : a.here ? -1 : 1));
}

type RowInput = {
  id?: string;
  run_id: string;
  sort_order?: number;
  name: string;
  position?: string | null;
  status?: string | null;
  points?: number | null;
  work_days?: number | null;
  deduction?: number;
  override_amount?: number | null;
  override_mode?: "replace" | "on_top";
  comment?: string | null;
};

export async function upsertTipsRowAction(row: RowInput) {
  if (!(await requireAuth())) return { ok: false, error: "Not authorized." };
  const sb = createServiceClient();
  if (!sb) return { ok: false, error: "Server not configured." };
  const { data, error } = await sb.from("venue_tips_rows").upsert(row).select("id").limit(1);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/benefits/tips");
  return { ok: true, id: data?.[0]?.id as string | undefined };
}

/** Partial update of an existing row by id — does NOT wipe other columns. */
export async function updateTipsRowAction(id: string, patch: Partial<RowInput>) {
  if (!(await requireAuth())) return { ok: false, error: "Not authorized." };
  const sb = createServiceClient();
  if (!sb) return { ok: false, error: "Server not configured." };
  const { error } = await sb.from("venue_tips_rows").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/benefits/tips");
  return { ok: true };
}

export async function deleteTipsRowAction(id: string) {
  if (!(await requireAuth())) return { ok: false, error: "Not authorized." };
  const sb = createServiceClient();
  if (!sb) return { ok: false, error: "Server not configured." };
  const { error } = await sb.from("venue_tips_rows").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/benefits/tips");
  return { ok: true };
}

/** Create a new month for ALL venues at once.
 * source="clone": each venue carries forward its last month's roster (incl. support), 0 days.
 * source="directory": each venue starts fresh from the current staff directory, 0 days. */
export async function createTipsMonthAction(params: {
  venue: string; month: string; monthLabel: string; monthDays: number; source?: "clone" | "directory";
}) {
  if (!(await requireAuth())) return { ok: false, error: "Not authorized." };
  const sb = createServiceClient();
  if (!sb) return { ok: false, error: "Server not configured." };
  const source = params.source ?? "clone";

  const VENUES = ["BB", "JBR", "SC", "VM"];
  for (const venue of VENUES) {
    const { data: exists } = await sb.from("venue_tips_runs").select("id").eq("venue", venue).eq("month", params.month).limit(1);
    if (exists && exists.length) continue;

    const { data: created, error } = await sb.from("venue_tips_runs")
      .insert({ venue, month: params.month, month_label: params.monthLabel, month_days: params.monthDays, tips_bank: 0, extra: 0 })
      .select("id").limit(1);
    if (error) return { ok: false, error: `${venue}: ${error.message}` };
    const runId = created?.[0]?.id as string;

    if (source === "directory") {
      const people = await listDirectoryStaffAction(venue);
      const mine = people.filter((p) => p.here);
      const clones = mine.map((p, i) => ({
        run_id: runId, sort_order: i, name: p.name, position: p.position, status: "ON'BOARD",
        points: defaultDirPoints(p.position), work_days: 0, deduction: 0,
        override_amount: null, override_mode: "replace", comment: null,
      }));
      if (clones.length) await sb.from("venue_tips_rows").insert(clones);
    } else {
      // clone last month for this venue
      const { data: prevRuns } = await sb.from("venue_tips_runs")
        .select("id,month").eq("venue", venue).lt("month", params.month).order("month", { ascending: false }).limit(1);
      const prevId = prevRuns?.[0]?.id;
      if (prevId) {
        const { data: prevRows } = await sb.from("venue_tips_rows").select("*").eq("run_id", prevId).order("sort_order");
        const clones = (prevRows ?? []).map((r: Record<string, unknown>, i: number) => ({
          run_id: runId, sort_order: i,
          name: r.name, position: r.position, status: r.status,
          points: r.points, work_days: 0, deduction: 0,
          override_amount: r.override_amount, override_mode: r.override_mode, comment: null,
        }));
        if (clones.length) await sb.from("venue_tips_rows").insert(clones);
      }
    }
  }

  revalidatePath("/benefits/tips");
  return { ok: true };
}

// Lightweight points default by position text (server-side mirror of lib defaultPointsFor).
function defaultDirPoints(position: string): number {
  const p = (position || "").toLowerCase();
  if (/sous|head chef|cdp|chef de partie|demi|sushi|pastry/.test(p)) return 1;
  if (/commis\s*1|commis\s*2|runner|steward|kp|goods|purchas/.test(p)) return 0.7;
  if (/commis\s*3|trainee/.test(p)) return 0.5;
  return 0.5;
}
