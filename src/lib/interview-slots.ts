import type { HiringSubmission } from "@/lib/hiring-records";

/** Interviews run 12:00–18:00 in 20-minute slots (3 per hour). */
export const INTERVIEW_START_HOUR = 12;
export const INTERVIEW_END_HOUR = 18;
export const INTERVIEW_SLOT_MINUTES = 20;

/** "HH:mm" start times for every slot in a day. */
export const INTERVIEW_TIMES: string[] = Array.from(
  { length: ((INTERVIEW_END_HOUR - INTERVIEW_START_HOUR) * 60) / INTERVIEW_SLOT_MINUTES },
  (_, index) => {
    const minutes = INTERVIEW_START_HOUR * 60 + index * INTERVIEW_SLOT_MINUTES;
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  },
);

/** A slot is local UAE time, stored as "YYYY-MM-DDTHH:mm". */
export function isValidInterviewSlot(slot: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})$/.exec(slot);
  if (!match) return false;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getMonth() === Number(match[2]) - 1 && INTERVIEW_TIMES.includes(match[4]);
}

export function interviewOf(s: Pick<HiringSubmission, "data">): string | null {
  const value = s.data?.interview;
  return typeof value === "string" && isValidInterviewSlot(value) ? value : null;
}

export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function slotDate(slot: string): Date {
  const [day, time] = slot.split("T");
  const [y, m, d] = day.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm);
}

/** Monday of the week containing `date`. */
export function weekStart(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

export function slotEnd(time: string): string {
  const [hh, mm] = time.split(":").map(Number);
  const minutes = hh * 60 + mm + INTERVIEW_SLOT_MINUTES;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** e.g. "Tue 20 Oct · 12:40–13:00" */
export function formatInterview(slot: string): string {
  const time = slot.split("T")[1];
  const day = slotDate(slot).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  return `${day} · ${time}–${slotEnd(time)}`;
}
