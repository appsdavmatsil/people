import { noteEdit } from "@/lib/activity";

export const eventsKey = "people.events";
export const eventsEvent = "people-events";
export const eventBoardKey = "people.event-board";
export const eventBoardEvent = "people-event-board";

export type EventDefinition = {
  id: string;
  name: string;
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
    events.push({ id, name });
  }

  return events;
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
