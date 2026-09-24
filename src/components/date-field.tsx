"use client";

import { useEffect, useRef, useState } from "react";
import { formatDate } from "@/lib/staff";

const weekdays = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

export function DateField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => monthOf(value));

  useEffect(() => {
    if (!open) {
      return;
    }

    setView(monthOf(value));
    panelRef.current?.scrollIntoView({ block: "nearest" });

    function onPointer(event: PointerEvent) {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) {
        return;
      }

      setOpen(false);
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, value]);

  const selected = parseIso(value);
  const today = todayParts();
  const cells = calendarCells(view.year, view.month);
  const monthLabel = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
  }).format(new Date(view.year, view.month, 1));

  function choose(year: number, month: number, day: number) {
    onChange(toIso(year, month, day));
    setOpen(false);
  }

  function shiftMonth(amount: number) {
    setView((current) => {
      const next = new Date(current.year, current.month + amount, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  }

  return (
    <div ref={rootRef} className="relative mt-1.5">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex h-9 w-full items-center justify-between gap-3 rounded-lg border border-stone-300 bg-white px-3 text-left text-sm text-stone-950 outline-none hover:border-stone-400 focus:border-stone-950"
      >
        <span className={value ? "" : "text-stone-400"}>{value ? formatDate(value) : "Choose a date"}</span>
        <CalendarIcon />
      </button>
      {open ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={monthLabel}
          className="mt-2 w-full max-w-[17.5rem] rounded-xl border border-stone-200 bg-stone-50 p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              className="flex size-8 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-950"
              aria-label="Previous month"
              onClick={() => shiftMonth(-1)}
            >
              <Chevron direction="left" />
            </button>
            <p className="text-sm font-medium text-stone-950">{monthLabel}</p>
            <button
              type="button"
              className="flex size-8 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-950"
              aria-label="Next month"
              onClick={() => shiftMonth(1)}
            >
              <Chevron direction="right" />
            </button>
          </div>
          <div className="mt-2 grid grid-cols-7 text-center text-[11px] font-medium tracking-wide text-stone-400">
            {weekdays.map((day) => (
              <span key={day} className="flex h-8 items-center justify-center">
                {day}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((cell) => {
              const isSelected =
                selected != null &&
                selected.year === cell.year &&
                selected.month === cell.month &&
                selected.day === cell.day;
              const isToday =
                today.year === cell.year && today.month === cell.month && today.day === cell.day;
              return (
                <button
                  key={`${cell.year}-${cell.month}-${cell.day}`}
                  type="button"
                  aria-pressed={isSelected}
                  aria-current={isToday ? "date" : undefined}
                  onClick={() => choose(cell.year, cell.month, cell.day)}
                  className={`mx-auto flex size-8 items-center justify-center rounded-full text-sm ${
                    isSelected
                      ? "bg-stone-950 font-medium text-white"
                      : isToday
                        ? "font-medium text-stone-950 ring-1 ring-stone-300 hover:bg-white"
                        : cell.inMonth
                          ? "text-stone-800 hover:bg-white"
                          : "text-stone-300 hover:bg-white hover:text-stone-500"
                  }`}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between border-t border-stone-100 pt-2">
            <button
              type="button"
              className="rounded-lg px-2 py-1 text-sm font-medium text-stone-700 hover:bg-stone-100 hover:text-stone-950"
              onClick={() => {
                const next = todayParts();
                setView({ year: next.year, month: next.month });
                choose(next.year, next.month, next.day);
              }}
            >
              Today
            </button>
            <button
              type="button"
              className="rounded-lg px-2 py-1 text-sm text-stone-500 hover:bg-stone-100 hover:text-stone-950"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function calendarCells(year: number, month: number) {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - lead);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    return {
      year: date.getFullYear(),
      month: date.getMonth(),
      day: date.getDate(),
      inMonth: date.getMonth() === month,
    };
  });
}

function monthOf(value: string) {
  const parsed = parseIso(value) ?? todayParts();
  return { year: parsed.year, month: parsed.month };
}

function parseIso(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
    return null;
  }

  return { year, month, day };
}

function todayParts() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
}

function toIso(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0 text-stone-500">
      <rect x="2" y="3" width="12" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2 6.5h12M5.5 2v2.5M10.5 2v2.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path
        d={direction === "left" ? "M8.5 3 4.5 7l4 4" : "M5.5 3 9.5 7l-4 4"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
