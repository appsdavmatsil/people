"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatDate } from "@/lib/staff";

const weekdays = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

export function keepDialogForDatePicker(dialog: EventTarget) {
  return (
    dialog instanceof HTMLDialogElement &&
    (dialog.hasAttribute("data-date-just-picked") || dialog.querySelector("[data-date-popover]") != null)
  );
}

export function DateField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [view, setView] = useState(() => monthOf(value));
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    const panel = panelRef.current;
    const button = buttonRef.current;
    if (!panel || !button) {
      return;
    }

    if (!panel.matches(":popover-open")) {
      panel.showPopover();
    }

    function place() {
      const currentPanel = panelRef.current;
      const currentButton = buttonRef.current;
      if (!currentPanel || !currentButton) {
        return;
      }

      const rect = currentButton.getBoundingClientRect();
      const width = currentPanel.offsetWidth;
      const height = currentPanel.offsetHeight;
      const margin = 8;
      const below = window.innerHeight - rect.bottom - margin;
      const top =
        below >= height || below >= rect.top - margin
          ? Math.min(rect.bottom + margin, Math.max(margin, window.innerHeight - height - margin))
          : Math.max(margin, rect.top - height - margin);
      const left = Math.min(Math.max(margin, rect.left), Math.max(margin, window.innerWidth - width - margin));
      setCoords({ top, left });
    }

    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, view]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointer(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return;
      }

      setOpen(false);
    }

    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }

    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const selected = parseIso(value);
  const today = todayParts();
  const cells = calendarCells(view.year, view.month);
  const monthLabel = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
  }).format(new Date(view.year, view.month, 1));

  function choose(year: number, month: number, day: number) {
    const dialog = buttonRef.current?.closest("dialog");
    if (dialog) {
      dialog.setAttribute("data-date-just-picked", "");
      window.setTimeout(() => dialog.removeAttribute("data-date-just-picked"), 400);
    }
    onChange(toIso(year, month, day));
    setOpen(false);
  }

  function shiftMonth(amount: number) {
    setView((current) => {
      const next = new Date(current.year, current.month + amount, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  }

  function toggle() {
    setHost(buttonRef.current?.closest("dialog") ?? document.body);
    setView(monthOf(value));
    setOpen((current) => !current);
  }

  return (
    <div ref={rootRef} className="relative mt-1.5">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggle}
        className="flex h-9 w-full items-center justify-between gap-3 rounded-lg border border-stone-300 bg-white px-3 text-left text-sm text-stone-950 outline-none hover:border-stone-400 focus:border-stone-950"
      >
        <span className={value ? "" : "text-stone-400"}>{value ? formatDate(value) : "Choose a date"}</span>
        <CalendarIcon />
      </button>
      {open && host
        ? createPortal(
        <div
          ref={panelRef}
          popover="manual"
          data-date-popover=""
          role="dialog"
          aria-label={monthLabel}
          style={{
            position: "fixed",
            margin: 0,
            inset: "auto",
            top: coords?.top ?? 0,
            left: coords?.left ?? 0,
          }}
          className="z-[90] w-72 rounded-xl border border-stone-200 bg-white p-3 text-stone-950 shadow-xl"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
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
          <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[11px] font-medium tracking-wide text-stone-400">
            {weekdays.map((day) => (
              <span key={day} className="flex h-8 items-center justify-center">
                {day}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
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
                  className={`flex aspect-square w-full items-center justify-center rounded-full text-sm ${
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
        </div>,
          host,
        )
        : null}
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
