import { noteEdit } from "@/lib/activity";
import { normalizePlacementName } from "@/lib/staff-placements";

export const cardLabelsKey = "people.card-labels";
export const cardLabelsEvent = "people-card-labels";
export const eventCardLabelsKey = "people.event-card-labels";
export const eventCardLabelsEvent = "people-event-card-labels";

export type CardLabel = {
  staffId: string;
  text: string;
};

export function emptyCardLabels() {
  return [] as CardLabel[];
}

function createCardLabelStore(key: string, eventName: string, summary: string) {
  let clientRaw: string | null = null;
  let clientSnapshot: CardLabel[] | null = null;
  let serverSnapshot: CardLabel[] | null = null;

  function getServer() {
    serverSnapshot ??= emptyCardLabels();
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
    clientSnapshot = parseStoredCardLabels(raw);
    return clientSnapshot;
  }

  function save(labels: CardLabel[]) {
    const next = normalizeCardLabels(labels);
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

const venueCardLabels = createCardLabelStore(cardLabelsKey, cardLabelsEvent, "Updated card labels");
const eventCardLabels = createCardLabelStore(
  eventCardLabelsKey,
  eventCardLabelsEvent,
  "Updated event card labels",
);

export function getServerCardLabels() {
  return venueCardLabels.getServer();
}

export function getCardLabelsSnapshot() {
  return venueCardLabels.getSnapshot();
}

export function saveCardLabels(labels: CardLabel[]) {
  return venueCardLabels.save(labels);
}

export function subscribeCardLabels(onStoreChange: () => void) {
  return venueCardLabels.subscribe(onStoreChange);
}

export function getServerEventCardLabels() {
  return eventCardLabels.getServer();
}

export function getEventCardLabelsSnapshot() {
  return eventCardLabels.getSnapshot();
}

export function saveEventCardLabels(labels: CardLabel[]) {
  return eventCardLabels.save(labels);
}

export function subscribeEventCardLabels(onStoreChange: () => void) {
  return eventCardLabels.subscribe(onStoreChange);
}

function parseStoredCardLabels(raw: string | null) {
  if (!raw) {
    return emptyCardLabels();
  }

  try {
    return normalizeCardLabels(JSON.parse(raw));
  } catch {
    return emptyCardLabels();
  }
}

function normalizeCardLabels(value: unknown): CardLabel[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const labels: CardLabel[] = [];
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
    labels.push({ staffId, text });
  }

  return labels;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
