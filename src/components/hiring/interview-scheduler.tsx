"use client";

import { useEffect, useMemo, useState } from "react";
import {
  INTERVIEW_TIMES,
  dateKey,
  formatInterview,
  slotDate,
  slotEnd,
  weekStart,
} from "@/lib/interview-slots";

export type InterviewBooking = { id: string; name: string; position: string | null; slot: string };

/** Week calendar (Mon–Sun, 12:00–18:00, 20-minute slots) for booking one applicant's interview. */
export function InterviewScheduler({
  applicant,
  current,
  bookings,
  onBook,
  onClose,
}: {
  applicant: { id: string; name: string; position: string | null };
  current: string | null;
  bookings: InterviewBooking[];
  onBook: (slot: string | null) => Promise<{ ok: boolean; error?: string }>;
  onClose: () => void;
}) {
  const [week, setWeek] = useState(() => weekStart(current ? slotDate(current) : new Date()));
  const [picked, setPicked] = useState<string | null>(current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [now] = useState(() => Date.now());

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const day = new Date(week);
        day.setDate(week.getDate() + index);
        return day;
      }),
    [week],
  );
  const takenBy = useMemo(
    () => new Map(bookings.filter((b) => b.id !== applicant.id).map((b) => [b.slot, b])),
    [bookings, applicant.id],
  );
  const today = dateKey(new Date(now));
  const thisWeek = dateKey(weekStart(new Date(now)));

  const shiftWeek = (by: number) => {
    const next = new Date(week);
    next.setDate(week.getDate() + by * 7);
    setWeek(next);
  };

  async function save(slot: string | null) {
    setSaving(true);
    setError("");
    const result = await onBook(slot);
    setSaving(false);
    if (result.ok) onClose();
    else setError(result.error ?? "Could not save the interview.");
  }

  const rangeLabel = `${days[0].toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${days[6].toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;

  return (
    <div className="fixed inset-0 z-[88] grid place-items-center bg-stone-950/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Schedule interview for ${applicant.name}`}
        className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-4 bg-[#063f3b] px-5 py-3.5 text-white">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold tracking-tight">Schedule interview</h2>
            <p className="truncate text-xs text-white/70">
              {applicant.name}
              {applicant.position ? ` · ${applicant.position}` : ""}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-8 shrink-0 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white">×</button>
        </header>

        <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 px-5 py-2.5">
          <button type="button" onClick={() => shiftWeek(-1)} aria-label="Previous week" className="grid size-8 place-items-center rounded-lg border border-stone-200 text-stone-600 hover:border-stone-400">‹</button>
          <button type="button" onClick={() => shiftWeek(1)} aria-label="Next week" className="grid size-8 place-items-center rounded-lg border border-stone-200 text-stone-600 hover:border-stone-400">›</button>
          <p className="text-sm font-semibold text-stone-900">{rangeLabel}</p>
          {dateKey(week) !== thisWeek ? (
            <button type="button" onClick={() => setWeek(weekStart(new Date(now)))} className="rounded-lg px-2 py-1 text-xs font-medium text-stone-500 hover:bg-stone-100 hover:text-stone-900">This week</button>
          ) : null}
          <p className="ml-auto text-xs text-stone-500">12:00 – 18:00 · 20-minute slots</p>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-3">
          <div className="grid min-w-[44rem] grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] gap-x-1.5">
            <div />
            {days.map((day) => {
              const key = dateKey(day);
              const free = INTERVIEW_TIMES.filter((time) => !takenBy.has(`${key}T${time}`) && slotDate(`${key}T${time}`).getTime() > now).length;
              return (
                <div key={key} className={`sticky top-0 z-10 mb-1.5 rounded-lg px-1 py-1.5 text-center ${key === today ? "bg-pink-50 text-pink-800" : "bg-white text-stone-700"}`}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide">{day.toLocaleDateString("en-GB", { weekday: "short" })}</p>
                  <p className="text-sm font-semibold tabular-nums">{day.getDate()}</p>
                  <p className="text-[10px] text-stone-400">{free} free</p>
                </div>
              );
            })}

            {INTERVIEW_TIMES.map((time) => (
              <div key={time} className="contents">
                <div className={`pr-1 text-right text-[11px] tabular-nums leading-7 ${time.endsWith(":00") ? "font-semibold text-stone-700" : "text-stone-400"}`}>{time}</div>
                {days.map((day) => {
                  const slot = `${dateKey(day)}T${time}`;
                  const other = takenBy.get(slot);
                  const past = slotDate(slot).getTime() <= now;
                  const mine = slot === current;
                  const chosen = slot === picked;
                  const label = `${day.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}, ${time}–${slotEnd(time)}`;
                  if (other) {
                    return (
                      <div
                        key={slot}
                        title={`${label} — booked for ${other.name}${other.position ? ` (${other.position})` : ""}`}
                        className={`mb-1 h-7 truncate rounded-md bg-stone-200/70 px-1.5 text-[10px] font-medium leading-7 text-stone-600`}
                      >
                        {other.name}
                      </div>
                    );
                  }
                  return (
                    <button
                      key={slot}
                      type="button"
                      disabled={past && !mine}
                      onClick={() => setPicked(chosen ? current : slot)}
                      aria-pressed={chosen}
                      aria-label={`${label}${mine ? " (current interview)" : ""}`}
                      title={past && !mine ? `${label} — in the past` : label}
                      className={`mb-1 h-7 rounded-md border text-[10px] font-semibold transition-colors ${
                        chosen
                          ? "border-pink-600 bg-pink-600 text-white"
                          : mine
                            ? "border-pink-300 bg-pink-50 text-pink-700"
                            : past
                              ? "cursor-not-allowed border-transparent bg-stone-50 text-transparent"
                              : "border-stone-200 bg-white text-stone-300 hover:border-pink-300 hover:bg-pink-50 hover:text-pink-700"
                      }`}
                    >
                      {chosen ? `${time} ✓` : mine ? "Current" : time}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-stone-200 px-5 py-3">
          <p className="min-w-0 flex-1 truncate text-sm text-stone-600">
            {picked ? (
              <>
                {picked === current ? "Booked: " : "New slot: "}
                <span className="font-semibold text-stone-900">{formatInterview(picked)}</span>
                {current && picked !== current ? <span className="text-stone-400"> (was {formatInterview(current)})</span> : null}
              </>
            ) : (
              "Pick a free slot."
            )}
          </p>
          {error ? <p className="w-full text-xs font-medium text-red-600 sm:order-first sm:w-auto">{error}</p> : null}
          {current ? (
            <button type="button" disabled={saving} onClick={() => save(null)} className="h-9 rounded-lg border border-red-200 px-3 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">
              Cancel interview
            </button>
          ) : null}
          <button type="button" onClick={onClose} className="h-9 rounded-lg border border-stone-300 px-3 text-sm">Close</button>
          <button
            type="button"
            disabled={saving || !picked || picked === current}
            onClick={() => save(picked)}
            className="h-9 rounded-lg bg-[#063f3b] px-4 text-sm font-semibold text-white hover:bg-[#052f2c] disabled:opacity-40"
          >
            {saving ? "Saving…" : current ? "Move interview" : "Book interview"}
          </button>
        </footer>
      </div>
    </div>
  );
}
