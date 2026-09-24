import { noteEdit } from "@/lib/activity";
import { normalizePlacementName } from "@/lib/staff-placements";

export const boardLabelsKey = "people.board-labels";
export const boardLabelsEvent = "people-board-labels";
export const eventBoardLabelsKey = "people.event-board-labels";
export const eventBoardLabelsEvent = "people-event-board-labels";

export type BoardLabel = {
  id: string;
  text: string;
  locationId: string | null;
  beforeId: string | null;
  rank: number;
};

export type ColumnRow<T extends { id: string }> =
  | { kind: "staff"; person: T }
  | { kind: "label"; label: BoardLabel };

export function emptyBoardLabels() {
  return [] as BoardLabel[];
}

function createLabelStore(key: string, eventName: string, summary: string) {
  let clientRaw: string | null = null;
  let clientSnapshot: BoardLabel[] | null = null;
  let serverSnapshot: BoardLabel[] | null = null;

  function getServer() {
    serverSnapshot ??= emptyBoardLabels();
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
    clientSnapshot = parseStoredLabels(raw);
    return clientSnapshot;
  }

  function save(labels: BoardLabel[]) {
    const next = normalizeLabels(labels);
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

const venueLabels = createLabelStore(boardLabelsKey, boardLabelsEvent, "Updated board labels");
const eventLabels = createLabelStore(
  eventBoardLabelsKey,
  eventBoardLabelsEvent,
  "Updated event board labels",
);

export function getServerBoardLabels() {
  return venueLabels.getServer();
}

export function getBoardLabelsSnapshot() {
  return venueLabels.getSnapshot();
}

export function saveBoardLabels(labels: BoardLabel[]) {
  return venueLabels.save(labels);
}

export function subscribeBoardLabels(onStoreChange: () => void) {
  return venueLabels.subscribe(onStoreChange);
}

export function getServerEventBoardLabels() {
  return eventLabels.getServer();
}

export function getEventBoardLabelsSnapshot() {
  return eventLabels.getSnapshot();
}

export function saveEventBoardLabels(labels: BoardLabel[]) {
  return eventLabels.save(labels);
}

export function subscribeEventBoardLabels(onStoreChange: () => void) {
  return eventLabels.subscribe(onStoreChange);
}

export function columnRows<T extends { id: string }>(
  people: T[],
  labels: BoardLabel[],
  locationId: string | null,
): ColumnRow<T>[] {
  const peopleIds = new Set(people.map((person) => person.id));
  const buckets = new Map<string, BoardLabel[]>();
  const trailing: BoardLabel[] = [];

  for (const label of labels) {
    if ((label.locationId ?? null) !== locationId) {
      continue;
    }

    if (label.beforeId && peopleIds.has(label.beforeId)) {
      const bucket = buckets.get(label.beforeId) ?? [];
      bucket.push(label);
      buckets.set(label.beforeId, bucket);
    } else {
      trailing.push(label);
    }
  }

  for (const bucket of buckets.values()) {
    bucket.sort((left, right) => left.rank - right.rank);
  }
  trailing.sort((left, right) => left.rank - right.rank);

  const rows: ColumnRow<T>[] = [];
  for (const person of people) {
    for (const label of buckets.get(person.id) ?? []) {
      rows.push({ kind: "label", label });
    }
    rows.push({ kind: "staff", person });
  }

  for (const label of trailing) {
    rows.push({ kind: "label", label });
  }

  return rows;
}

export function reanchorLabels(
  labels: BoardLabel[],
  locationId: string | null,
  rows: { kind: "staff" | "label" | "hiring"; id: string }[],
) {
  const inColumn = labels.filter((label) => (label.locationId ?? null) === locationId);
  const byId = new Map(inColumn.map((label) => [label.id, label]));
  const seen = new Set<string>();
  const anchored: BoardLabel[] = [];
  let pending: BoardLabel[] = [];

  function flush(beforeId: string | null) {
    pending.forEach((label, rank) => {
      anchored.push({ ...label, locationId, beforeId, rank });
    });
    pending = [];
  }

  for (const row of rows) {
    if (row.kind === "label") {
      const label = byId.get(row.id);
      if (!label || seen.has(row.id)) {
        continue;
      }

      seen.add(row.id);
      pending.push(label);
      continue;
    }

    if (row.kind !== "staff") {
      continue;
    }

    flush(row.id);
  }

  flush(null);

  let trailingRank = anchored.filter((label) => label.beforeId == null).length;
  for (const label of inColumn) {
    if (seen.has(label.id)) {
      continue;
    }

    anchored.push({ ...label, locationId, beforeId: null, rank: trailingRank });
    trailingRank += 1;
  }

  return [...labels.filter((label) => (label.locationId ?? null) !== locationId), ...anchored];
}

export function moveLabel(
  labels: BoardLabel[],
  labelId: string,
  locationId: string | null,
  beforeId: string | null,
  index: number,
) {
  const current = labels.find((label) => label.id === labelId);
  if (!current) {
    return labels;
  }

  const bucket: BoardLabel[] = [];
  const rest: BoardLabel[] = [];
  for (const label of labels) {
    if (label.id === labelId) {
      continue;
    }

    if ((label.locationId ?? null) === locationId && (label.beforeId ?? null) === beforeId) {
      bucket.push(label);
    } else {
      rest.push(label);
    }
  }

  bucket.sort((left, right) => left.rank - right.rank);
  const at = Math.max(0, Math.min(index, bucket.length));
  bucket.splice(at, 0, { ...current, locationId, beforeId, rank: 0 });
  return [...rest, ...bucket.map((label, rank) => ({ ...label, rank }))];
}

function parseStoredLabels(raw: string | null) {
  if (!raw) {
    return emptyBoardLabels();
  }

  try {
    return normalizeLabels(JSON.parse(raw));
  } catch {
    return emptyBoardLabels();
  }
}

function normalizeLabels(value: unknown): BoardLabel[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const labels: BoardLabel[] = [];
  const ids = new Set<string>();

  for (const item of value) {
    if (!isRecord(item) || typeof item.text !== "string") {
      continue;
    }

    const text = normalizePlacementName(item.text);
    if (!text) {
      continue;
    }

    const id = typeof item.id === "string" && item.id.trim() ? item.id : crypto.randomUUID();
    if (ids.has(id)) {
      continue;
    }

    ids.add(id);
    labels.push({
      id,
      text,
      locationId: stringOrNull(item.locationId),
      beforeId: stringOrNull(item.beforeId),
      rank: typeof item.rank === "number" && Number.isFinite(item.rank) ? item.rank : labels.length,
    });
  }

  return labels;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
