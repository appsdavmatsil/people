import { noteEdit } from "@/lib/activity";
import { normalizePlacementName } from "@/lib/staff-placements";

export const cardTagsKey = "people.card-tags";
export const cardTagsEvent = "people-card-tags";
export const eventCardTagsKey = "people.event-card-tags";
export const eventCardTagsEvent = "people-event-card-tags";

export type CardTag = {
  staffId: string;
  text: string;
};

export function emptyCardTags() {
  return [] as CardTag[];
}

function createCardTagStore(key: string, eventName: string, summary: string) {
  let clientRaw: string | null = null;
  let clientSnapshot: CardTag[] | null = null;
  let serverSnapshot: CardTag[] | null = null;

  function getServer() {
    serverSnapshot ??= emptyCardTags();
    return serverSnapshot;
  }

  function getSnapshot() {
    if (typeof window === "undefined") {
      return getServer();
    }

    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(key);
    } catch {
      raw = null;
    }

    if (clientSnapshot && raw === clientRaw) {
      return clientSnapshot;
    }

    clientRaw = raw;
    clientSnapshot = parseStoredCardTags(raw);
    return clientSnapshot;
  }

  function save(tags: CardTag[]) {
    const next = normalizeCardTags(tags);
    const raw = JSON.stringify(next);
    window.localStorage.setItem(key, raw);
    noteEdit(summary);
    clientRaw = raw;
    clientSnapshot = next;
    window.dispatchEvent(new Event(eventName));
    return next;
  }

  function subscribe(onStoreChange: () => void) {
    function onStorage(event: StorageEvent) {
      if (event.key !== key) {
        return;
      }

      onStoreChange();
    }

    window.addEventListener("storage", onStorage);
    window.addEventListener(eventName, onStoreChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(eventName, onStoreChange);
    };
  }

  return { getServer, getSnapshot, save, subscribe };
}

const venueCardTags = createCardTagStore(cardTagsKey, cardTagsEvent, "Updated card tags");
const eventCardTags = createCardTagStore(
  eventCardTagsKey,
  eventCardTagsEvent,
  "Updated event card tags",
);

export function getServerCardTags() {
  return venueCardTags.getServer();
}

export function getCardTagsSnapshot() {
  return venueCardTags.getSnapshot();
}

export function saveCardTags(tags: CardTag[]) {
  return venueCardTags.save(tags);
}

export function subscribeCardTags(onStoreChange: () => void) {
  return venueCardTags.subscribe(onStoreChange);
}

export function getServerEventCardTags() {
  return eventCardTags.getServer();
}

export function getEventCardTagsSnapshot() {
  return eventCardTags.getSnapshot();
}

export function saveEventCardTags(tags: CardTag[]) {
  return eventCardTags.save(tags);
}

export function subscribeEventCardTags(onStoreChange: () => void) {
  return eventCardTags.subscribe(onStoreChange);
}

function parseStoredCardTags(raw: string | null) {
  if (!raw) {
    return emptyCardTags();
  }

  try {
    return normalizeCardTags(JSON.parse(raw));
  } catch {
    return emptyCardTags();
  }
}

function normalizeCardTags(value: unknown): CardTag[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const tags: CardTag[] = [];
  const ids = new Set<string>();

  for (const item of value) {
    if (!isRecord(item) || typeof item.staffId !== "string" || typeof item.text !== "string") {
      continue;
    }

    const staffId = item.staffId.trim();
    const text = normalizePlacementName(item.text);
    if (!staffId || !text || ids.has(staffId)) {
      continue;
    }

    ids.add(staffId);
    tags.push({ staffId, text });
  }

  return tags;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
