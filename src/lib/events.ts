import { noteEdit } from "@/lib/activity";

export const eventsKey = "people.events";
export const eventsEvent = "people-events";
export const eventBoardKey = "people.event-board";
export const eventBoardEvent = "people-event-board";

export type EventDefinition = {
  id: string;
  name: string;
  color: string;
  /** Event days as YYYY-MM-DD, sorted; not necessarily consecutive. */
  dates?: string[];
};

let clientRaw: string | null = null;
let clientSnapshot: EventDefinition[] | null = null;
let serverSnapshot: EventDefinition[] | null = null;

export function emptyEvents() {
  return [] as EventDefinition[];
}

export function getServerEvents() {
  serverSnapshot ??= emptyEvents();
  return serverSnapshot;
}

export function getEventsSnapshot() {
  if (typeof window === "undefined") {
    return getServerEvents();
  }

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(eventsKey);
  } catch {
    raw = null;
  }

  if (clientSnapshot && raw === clientRaw) {
    return clientSnapshot;
  }

  clientRaw = raw;
  clientSnapshot = parseStoredEvents(raw);
  return clientSnapshot;
}

export function saveEvents(events: EventDefinition[]) {
  const next = normalizeEvents(events);
  const raw = JSON.stringify(next);
  window.localStorage.setItem(eventsKey, raw);
  noteEdit("Updated events");
  clientRaw = raw;
  clientSnapshot = next;
  window.dispatchEvent(new Event(eventsEvent));
  return next;
}

export function subscribeEvents(onStoreChange: () => void) {
  function onStorage(event: StorageEvent) {
    if (event.key !== eventsKey) {
      return;
    }

    onStoreChange();
  }

  window.addEventListener("storage", onStorage);
  window.addEventListener(eventsEvent, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(eventsEvent, onStoreChange);
  };
}

export function normalizeEventName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function sameEventName(left: string, right: string) {
  return normalizeEventName(left).toLowerCase() === normalizeEventName(right).toLowerCase();
}

function parseStoredEvents(raw: string | null) {
  if (!raw) {
    return emptyEvents();
  }

  try {
    return normalizeEvents(JSON.parse(raw));
  } catch {
    return emptyEvents();
  }
}

function normalizeEvents(value: unknown): EventDefinition[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const events: EventDefinition[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.name !== "string") {
      continue;
    }

    const name = normalizeEventName(item.name);
    if (!name || events.some((event) => sameEventName(event.name, name))) {
      continue;
    }

    const id = typeof item.id === "string" && item.id.trim() ? item.id : crypto.randomUUID();
    const color = typeof item.color === "string" && /^#[0-9a-fA-F]{6}$/.test(item.color)
      ? item.color.toLowerCase()
      : "#44403c";
    const dates = Array.isArray(item.dates)
      ? [...new Set(item.dates.filter((day): day is string => typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day)))].sort()
      : [];
    events.push(dates.length ? { id, name, color, dates } : { id, name, color });
  }

  return events;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function dayParts(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  return { year, month, date };
}

function nextDay(day: string) {
  const { year, month, date } = dayParts(day);
  const next = new Date(Date.UTC(year, month - 1, date + 1));
  return next.toISOString().slice(0, 10);
}

/**
 * Short label for an event's days: "12 | 13 | 14 OCT" within one month,
 * "30 JAN to 2 FEB" for an unbroken run across months, month groups otherwise.
 */
export function formatEventDates(dates: string[] | undefined) {
  const days = [...new Set(dates ?? [])].sort();
  if (!days.length) return "";
  const label = (day: string) => `${dayParts(day).date} ${MONTHS[dayParts(day).month - 1]}`;
  const consecutive = days.every((day, index) => index === 0 || nextDay(days[index - 1]) === day);
  const first = dayParts(days[0]);
  const sameMonth = days.every((day) => dayParts(day).month === first.month && dayParts(day).year === first.year);

  if (days.length === 1) return label(days[0]);
  if (consecutive && (!sameMonth || days.length > 4)) {
    return sameMonth ? `${first.date} to ${label(days.at(-1)!)}` : `${label(days[0])} to ${label(days.at(-1)!)}`;
  }

  const groups: string[][] = [];
  for (const day of days) {
    const last = groups.at(-1);
    if (last && last[0].slice(0, 7) === day.slice(0, 7)) last.push(day);
    else groups.push([day]);
  }
  return groups
    .map((group) => `${group.map((day) => dayParts(day).date).join(" | ")} ${MONTHS[dayParts(group[0]).month - 1]}`)
    .join(" · ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

let boardRaw: string | null = null;
let boardSnapshot: string[] | null = null;
let boardServerSnapshot: string[] | null = null;

export function getServerEventBoard() {
  boardServerSnapshot ??= [];
  return boardServerSnapshot;
}

export function getEventBoardSnapshot() {
  if (typeof window === "undefined") {
    return getServerEventBoard();
  }

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(eventBoardKey);
  } catch {
    raw = null;
  }

  if (boardSnapshot && raw === boardRaw) {
    return boardSnapshot;
  }

  boardRaw = raw;
  boardSnapshot = parseEventBoard(raw);
  return boardSnapshot;
}

export function saveEventBoard(ids: string[]) {
  const next = normalizeEventBoard(ids);
  const raw = JSON.stringify(next);
  window.localStorage.setItem(eventBoardKey, raw);
  noteEdit("Updated the event board");
  boardRaw = raw;
  boardSnapshot = next;
  window.dispatchEvent(new Event(eventBoardEvent));
  return next;
}

export function subscribeEventBoard(onStoreChange: () => void) {
  function onStorage(event: StorageEvent) {
    if (event.key !== eventBoardKey) {
      return;
    }

    onStoreChange();
  }

  window.addEventListener("storage", onStorage);
  window.addEventListener(eventBoardEvent, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(eventBoardEvent, onStoreChange);
  };
}

function parseEventBoard(raw: string | null) {
  if (!raw) {
    return [];
  }

  try {
    return normalizeEventBoard(JSON.parse(raw));
  } catch {
    return [];
  }
}

function normalizeEventBoard(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const ids: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !item.trim() || ids.includes(item)) {
      continue;
    }

    ids.push(item);
  }

  return ids;
}
