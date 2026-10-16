"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ConfigTextField } from "@/lib/form-config";
import type { HiringSubmission } from "@/lib/hiring-records";
import { HIRING_STATUS_LABEL, HIRING_STATUS_STYLE, normalizeHiringStatus } from "@/lib/hiring-status";
import { INTERVIEW_END_HOUR, INTERVIEW_SLOT_MINUTES, INTERVIEW_START_HOUR, INTERVIEW_TIMES, dateKey, interviewOf, slotEnd, weekStart } from "@/lib/interview-slots";
import { HiringResponses } from "@/components/hiring/hiring-responses";

type View = "week" | "month";
type Interview = { id: string; name: string; position: string | null; photo: string | null; status: HiringSubmission["status"]; day: string; time: string };

function photoOf(s: HiringSubmission): string | null {
  const d = s.documents?.find((doc) => /photo/i.test(doc.label));
  return d?.web_view_link ?? d?.file_id ?? null;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(date.getDate() + days);
  return next;
}

const HOURS = Array.from({ length: INTERVIEW_END_HOUR - INTERVIEW_START_HOUR }, (_, index) => INTERVIEW_START_HOUR + index);
const SLOTS_PER_HOUR = 60 / INTERVIEW_SLOT_MINUTES;

/** Interview calendar: week (hour rows) and month (all days), with the picked day's interviews listed. */
export function InterviewCalendar({ submissions, fields }: { submissions: HiringSubmission[]; fields: ConfigTextField[] }) {
  const router = useRouter();
  const [now] = useState(() => new Date());
  const today = dateKey(now);
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState(() => new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  const [selectedDay, setSelectedDay] = useState(today);
  const [openId, setOpenId] = useState<string | null>(null);

  const interviews = useMemo(() => {
    const list: Interview[] = [];
    for (const s of submissions) {
      const slot = interviewOf(s);
      if (!slot) continue;
      const [day, time] = slot.split("T");
      list.push({ id: s.id, name: s.full_name, position: s.position_applied, photo: photoOf(s), status: normalizeHiringStatus(s.status), day, time });
    }
    return list.sort((a, b) => (a.day + a.time).localeCompare(b.day + b.time));
  }, [submissions]);

  const byDay = useMemo(() => {
    const map = new Map<string, Interview[]>();
    for (const item of interviews) {
      if (!map.has(item.day)) map.set(item.day, []);
      map.get(item.day)!.push(item);
    }
    return map;
  }, [interviews]);
  const bySlot = useMemo(() => new Map(interviews.map((item) => [`${item.day}T${item.time}`, item])), [interviews]);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart(anchor), index)), [anchor]);
  const monthDays = useMemo(() => {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const start = weekStart(first);
    const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    const count = Math.ceil(((last.getTime() - start.getTime()) / 86_400_000 + 1) / 7) * 7;
    return Array.from({ length: count }, (_, index) => addDays(start, index));
  }, [anchor]);

  const shift = (by: number) => {
    setAnchor((cur) => (view === "week" ? addDays(cur, by * 7) : new Date(cur.getFullYear(), cur.getMonth() + by, 1)));
  };
  const goToday = () => {
    setAnchor(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
    setSelectedDay(today);
  };

  const title =
    view === "week"
      ? `${weekDays[0].toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${weekDays[6].toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
      : anchor.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const upcoming = interviews.filter((item) => item.day >= today).length;
  const selectedList = byDay.get(selectedDay) ?? [];
  const selectedDate = (() => {
    const [y, m, d] = selectedDay.split("-").map(Number);
    return new Date(y, m - 1, d);
  })();

  return (
    <div className="flex min-h-0 flex-1 flex-col pt-5">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => shift(-1)} aria-label={view === "week" ? "Previous week" : "Previous month"} className="grid size-9 place-items-center rounded-lg border border-stone-200 bg-white text-stone-600 hover:border-stone-400">‹</button>
        <button type="button" onClick={() => shift(1)} aria-label={view === "week" ? "Next week" : "Next month"} className="grid size-9 place-items-center rounded-lg border border-stone-200 bg-white text-stone-600 hover:border-stone-400">›</button>
        <button type="button" onClick={goToday} className="h-9 rounded-lg border border-stone-200 bg-white px-3 text-sm font-medium text-stone-700 hover:border-stone-400">Today</button>
        <h2 className="ml-1 text-lg font-semibold tracking-tight text-stone-950">{title}</h2>
        <p className="text-xs text-stone-500">{upcoming} upcoming interview{upcoming === 1 ? "" : "s"}</p>
        <div role="radiogroup" aria-label="Calendar view" className="ml-auto inline-flex rounded-lg border border-stone-200 bg-stone-100/80 p-0.5">
          {(["week", "month"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={view === option}
              onClick={() => setView(option)}
              className={`h-8 rounded-md px-3 text-sm capitalize ${view === option ? "bg-white font-medium text-stone-950 shadow-sm ring-1 ring-stone-200" : "text-stone-500 hover:text-stone-900"}`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-h-0 overflow-auto rounded-xl border border-stone-200 bg-white">
          {view === "week" ? (
            <div className="grid min-w-[44rem] grid-cols-[4rem_repeat(7,minmax(0,1fr))]">
              <div className="sticky top-0 z-10 border-b border-stone-200 bg-white" />
              {weekDays.map((day) => {
                const key = dateKey(day);
                const count = byDay.get(key)?.length ?? 0;
                const picked = key === selectedDay;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedDay(key)}
                    aria-pressed={picked}
                    className={`sticky top-0 z-10 border-b border-l border-stone-200 px-1 py-2 text-center ${picked ? "bg-[#063f3b] text-white" : key === today ? "bg-pink-50 text-pink-800" : "bg-white text-stone-700 hover:bg-stone-50"}`}
                  >
                    <span className="block text-[11px] font-semibold uppercase tracking-wide">{day.toLocaleDateString("en-GB", { weekday: "short" })}</span>
                    <span className="block text-lg font-semibold leading-6 tabular-nums">{day.getDate()}</span>
                    <span className={`block text-[10px] ${picked ? "text-white/70" : "text-stone-400"}`}>{count ? `${count} interview${count === 1 ? "" : "s"}` : "—"}</span>
                  </button>
                );
              })}

              {HOURS.map((hour) => (
                <div key={hour} className="contents">
                  <div className="border-b border-stone-200 pt-1 pr-2 text-right text-xs font-semibold tabular-nums text-stone-500">{String(hour).padStart(2, "0")}:00</div>
                  {weekDays.map((day) => {
                    const key = dateKey(day);
                    return (
                      <div key={key} onClick={() => setSelectedDay(key)} className={`space-y-0.5 border-b border-l border-stone-200 p-0.5 ${key === selectedDay ? "bg-stone-50" : ""}`}>
                        {INTERVIEW_TIMES.slice((hour - INTERVIEW_START_HOUR) * SLOTS_PER_HOUR, (hour - INTERVIEW_START_HOUR + 1) * SLOTS_PER_HOUR).map((time) => {
                          const item = bySlot.get(`${key}T${time}`);
                          return item ? (
                            <button
                              key={time}
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedDay(key);
                                setOpenId(item.id);
                              }}
                              title={`${time}–${slotEnd(time)} · ${item.name}${item.position ? ` · ${item.position}` : ""}`}
                              className="flex h-7 w-full min-w-0 items-center gap-1 rounded-md bg-pink-100 px-1.5 text-left text-[11px] font-medium text-pink-900 hover:bg-pink-200"
                            >
                              <span className="shrink-0 tabular-nums text-pink-700">{time}</span>
                              <span className="truncate">{item.name}</span>
                            </button>
                          ) : (
                            <div key={time} className="h-7 rounded-md border border-dashed border-transparent" aria-hidden="true" />
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ) : (
            <div className="grid min-w-[40rem] grid-cols-7">
              {weekDays.map((day) => (
                <div key={day.getDay()} className="sticky top-0 z-10 border-b border-stone-200 bg-white py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                  {day.toLocaleDateString("en-GB", { weekday: "short" })}
                </div>
              ))}
              {monthDays.map((day) => {
                const key = dateKey(day);
                const list = byDay.get(key) ?? [];
                const inMonth = day.getMonth() === anchor.getMonth();
                const picked = key === selectedDay;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedDay(key)}
                    aria-pressed={picked}
                    className={`flex min-h-24 flex-col gap-0.5 border-b border-l border-stone-200 p-1.5 text-left align-top [&:nth-child(7n+1)]:border-l-0 ${picked ? "bg-[#063f3b]/5 ring-2 ring-[#063f3b] ring-inset" : "hover:bg-stone-50"} ${inMonth ? "" : "bg-stone-50/60"}`}
                  >
                    <span
                      className={`grid size-6 place-items-center rounded-full text-xs font-semibold tabular-nums ${
                        key === today ? "bg-pink-600 text-white" : inMonth ? "text-stone-800" : "text-stone-300"
                      }`}
                    >
                      {day.getDate()}
                    </span>
                    {list.slice(0, 3).map((item) => (
                      <span key={item.id} className="flex min-w-0 items-center gap-1 rounded bg-pink-100 px-1 text-[10px] font-medium leading-4 text-pink-900">
                        <span className="shrink-0 tabular-nums text-pink-700">{item.time}</span>
                        <span className="truncate">{item.name}</span>
                      </span>
                    ))}
                    {list.length > 3 ? <span className="px-1 text-[10px] font-medium text-stone-500">+{list.length - 3} more</span> : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <aside className="flex min-h-0 flex-col rounded-xl border border-stone-200 bg-white">
          <div className="border-b border-stone-200 px-4 py-3">
            <p className="text-sm font-semibold text-stone-950">
              {selectedDate.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
            </p>
            <p className="text-xs text-stone-500">
              {selectedList.length ? `${selectedList.length} interview${selectedList.length === 1 ? "" : "s"} scheduled` : "No interviews scheduled"}
            </p>
          </div>
          <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
            {selectedList.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => setOpenId(item.id)} className="flex w-full items-center gap-3 rounded-lg border border-stone-200 p-2 text-left hover:border-pink-300 hover:bg-pink-50/50">
                  {item.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.photo} alt="" className="size-10 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-stone-100 text-stone-300">—</span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold tabular-nums text-pink-700">{item.time}–{slotEnd(item.time)}</span>
                    <span className="block truncate text-sm font-medium text-stone-950">{item.name}</span>
                    <span className="block truncate text-xs text-stone-500">{item.position || "—"}</span>
                  </span>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${HIRING_STATUS_STYLE[item.status]}`}>{HIRING_STATUS_LABEL[item.status]}</span>
                </button>
              </li>
            ))}
            {selectedList.length === 0 ? (
              <li className="px-2 py-8 text-center text-xs text-stone-400">Book interviews from Form Responses: right-click an applicant → Need to interview → Schedule interview.</li>
            ) : null}
          </ul>
        </aside>
      </div>

      {openId ? (
        <HiringResponses
          key={openId}
          submissions={submissions}
          fields={fields}
          openApplicationId={openId}
          panelOnly
          onClose={() => {
            setOpenId(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
