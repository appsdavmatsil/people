import { noteEdit } from "@/lib/activity";

export const placementsKey = "people.staff-placements";
export const placementsEvent = "people-staff-placements";
export const eventPlacementsKey = "people.event-placements";
export const eventPlacementsEvent = "people-event-placements";

export type StaffPlacement = {
  id: string;
  name: string;
  locationId: string | null;
  position?: string;
  salary?: number | null;
};

export function emptyPlacements() {
  return [] as StaffPlacement[];
}

function createPlacementStore(key: string, eventName: string, summary: string) {
  let clientRaw: string | null = null;
  let clientSnapshot: StaffPlacement[] | null = null;
  let serverSnapshot: StaffPlacement[] | null = null;

  function getServer() {
    serverSnapshot ??= emptyPlacements();
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
    clientSnapshot = parseStoredPlacements(raw);
    return clientSnapshot;
  }

  function save(placements: StaffPlacement[]) {
    const next = normalizePlacements(placements);
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

const staffPlacements = createPlacementStore(placementsKey, placementsEvent, "Updated staff placements");
const eventPlacements = createPlacementStore(
  eventPlacementsKey,
  eventPlacementsEvent,
  "Updated event placements",
);

export function getServerPlacements() {
  return staffPlacements.getServer();
}

export function getPlacementsSnapshot() {
  return staffPlacements.getSnapshot();
}

export function savePlacements(placements: StaffPlacement[]) {
  return staffPlacements.save(placements);
}

export function subscribePlacements(onStoreChange: () => void) {
  return staffPlacements.subscribe(onStoreChange);
}

export function getServerEventPlacements() {
  return eventPlacements.getServer();
}

export function getEventPlacementsSnapshot() {
  return eventPlacements.getSnapshot();
}

export function saveEventPlacements(placements: StaffPlacement[]) {
  return eventPlacements.save(placements);
}

export function subscribeEventPlacements(onStoreChange: () => void) {
  return eventPlacements.subscribe(onStoreChange);
}

export function normalizePlacementName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function parseStoredPlacements(raw: string | null) {
  if (!raw) {
    return emptyPlacements();
  }

  try {
    return normalizePlacements(JSON.parse(raw));
  } catch {
    return emptyPlacements();
  }
}

function normalizePlacements(value: unknown): StaffPlacement[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const placements: StaffPlacement[] = [];
  const ids = new Set<string>();

  for (const item of value) {
    if (!isRecord(item) || typeof item.name !== "string") {
      continue;
    }

    const name = normalizePlacementName(item.name);
    if (!name) {
      continue;
    }

    const id = typeof item.id === "string" && item.id.trim() ? item.id : crypto.randomUUID();
    if (ids.has(id)) {
      continue;
    }

    ids.add(id);
    const locationId =
      typeof item.locationId === "string" && item.locationId.trim() ? item.locationId : null;
    placements.push({ id, name, locationId });
  }

  return placements;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
