import { createServiceClient } from "@/lib/supabase/service";

export const VENUES = ["BB", "JBR", "SC", "VM"] as const;
export type Venue = (typeof VENUES)[number];

export const VENUE_LABELS: Record<string, string> = {
  BB: "Land Brasserie (BB)",
  JBR: "Oyster Bar & Grill (JBR)",
  SC: "Street Eatery (SC)",
  VM: "Beach House (VM)",
};

export type TipsRun = {
  id: string;
  venue: string;
  month: string;         // ISO date (first of month)
  month_label: string;   // e.g. SEPT
  month_days: number;
  tips_bank: number;
  extra: number;
  locked: boolean;
  updated_at: string | null;
};

export type TipsRow = {
  id: string;
  run_id: string;
  sort_order: number;
  name: string;
  position: string | null;
  status: string | null;
  points: number | null;
  work_days: number | null;
  deduction: number;              // 0..1
  override_amount: number | null; // manual payout
  override_mode: "replace" | "on_top";
  comment: string | null;
};

/** Actual points for one row: 0 if overridden-replace or no points. */
export function actualPoints(row: TipsRow, monthDays: number): number {
  if (row.override_amount != null && row.override_mode === "replace") return 0;
  const g = row.points ?? 0;
  const h = row.work_days ?? 0;
  const ded = row.deduction ?? 0;
  if (g <= 0 || monthDays <= 0) return 0;
  return Math.max(0, g * (Math.min(h, monthDays) / monthDays) * (1 - ded));
}

export type TipsComputed = {
  totalPot: number;        // bank + extra
  pointPool: number;       // pot minus "on_top" overrides, shared by points
  totalPoints: number;
  valuePerPoint: number;
  rows: (TipsRow & { actual: number; payout: number })[];
  totalDistributed: number;
  onTopTotal: number;
};

/** Full computation for a run. */
export function computeRun(run: TipsRun, rows: TipsRow[]): TipsComputed {
  const totalPot = (run.tips_bank ?? 0) + (run.extra ?? 0);

  // "on_top" overrides are paid on top of the pot (e.g. Driver 100, Kitchen Fund).
  const onTopTotal = rows
    .filter((r) => r.override_amount != null && r.override_mode === "on_top")
    .reduce((s, r) => s + (r.override_amount ?? 0), 0);

  // "replace" overrides take a fixed slice OUT of the pot.
  const replaceTotal = rows
    .filter((r) => r.override_amount != null && r.override_mode === "replace")
    .reduce((s, r) => s + (r.override_amount ?? 0), 0);

  // Remaining pot shared by point-based staff.
  const pointPool = Math.max(0, totalPot - replaceTotal);
  const totalPoints = rows.reduce((s, r) => s + actualPoints(r, run.month_days), 0);
  const valuePerPoint = totalPoints > 0 ? pointPool / totalPoints : 0;

  const computed = rows.map((r) => {
    const actual = actualPoints(r, run.month_days);
    let payout: number;
    if (r.override_amount != null) payout = r.override_amount;
    else payout = valuePerPoint * actual;
    return { ...r, actual, payout };
  });

  const totalDistributed = computed.reduce((s, r) => s + r.payout, 0);
  return { totalPot, pointPool, totalPoints, valuePerPoint, rows: computed, totalDistributed, onTopTotal };
}

/** Position -> default attributed points (suggestion only; editable per row). */
export function defaultPointsFor(position: string | null): number {
  const p = (position ?? "").toLowerCase();
  if (/sous|head chef|cdp|demi|sushi|pastry/.test(p)) return 1;
  if (/commis\s*1|commis\s*2|runner|steward|kp|purchas/.test(p)) return 0.7;
  if (/commis\s*3|trainee/.test(p)) return 0.5;
  if (/invoice/.test(p)) return 0.25;
  return 0.5;
}

export async function listTipsRuns(venue?: string): Promise<TipsRun[]> {
  const sb = createServiceClient();
  if (!sb) return [];
  let q = sb.from("venue_tips_runs").select("*").order("month", { ascending: true });
  if (venue) q = q.eq("venue", venue);
  const { data, error } = await q;
  if (error) { console.error("tips runs:", error.message); return []; }
  return (data ?? []) as TipsRun[];
}

export async function getTipsRun(venue: string, month: string): Promise<{ run: TipsRun | null; rows: TipsRow[] }> {
  const sb = createServiceClient();
  if (!sb) return { run: null, rows: [] };
  const { data: runs } = await sb.from("venue_tips_runs").select("*").eq("venue", venue).eq("month", month).limit(1);
  const run = (runs?.[0] as TipsRun) ?? null;
  if (!run) return { run: null, rows: [] };
  const { data: rows } = await sb.from("venue_tips_rows").select("*").eq("run_id", run.id).order("sort_order", { ascending: true });
  return { run, rows: (rows ?? []) as TipsRow[] };
}
