import { noteEdit } from "@/lib/activity";

export const locationsKey = "people.locations";
export const locationsEvent = "people-locations";
export const locationBoardKey = "people.location-board";
export const locationBoardEvent = "people-location-board";

export type LocationReference = {
  id: string;
  nickname: string;
  venueName: string;
  color: string;
};

/** Header colors sampled from each venue's brand file. */
const brandColors: Record<string, string> = {
  jbr: "#011023",
  sc: "#9e3a24",
  vm: "#9a1c20",
  bb: "#112620",
};

export const defaultLocationColor = "#44403c";

export function colorForNickname(nickname: string) {
  return brandColors[normalizeLocationName(nickname).toLowerCase()] ?? "";
}

export function normalizeLocationColor(value: string, nickname = "") {
  const cleaned = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(cleaned)) {
    return cleaned.toLowerCase();
  }

  return colorForNickname(nickname);
}

const seedLocations: LocationReference[] = [
  { id: "jbr", nickname: "JBR", venueName: "The Maine Oyster Bar & Grill", color: brandColors.jbr },
  { id: "sc", nickname: "SC", venueName: "The Maine Street Eatery", color: brandColors.sc },
  { id: "bb", nickname: "BB", venueName: "The Maine Land Brasserie", color: brandColors.bb },
  { id: "vm", nickname: "VM", venueName: "The Maine Beach House", color: brandColors.vm },
];

export function emptyLocations() {
  return seedLocations.map((location) => ({ ...location }));
}

function createLocationStore(key: string, eventName: string) {
  let clientRaw: string | null = null;
  let clientSnapshot: LocationReference[] | null = null;
  let serverSnapshot: LocationReference[] | null = null;

  function getServer() {
    serverSnapshot ??= emptyLocations();
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
    clientSnapshot = parseStoredLocations(raw);
    return clientSnapshot;
  }

  function save(locations: LocationReference[]) {
    const next = normalizeLocations(locations);
    const raw = JSON.stringify(next);
    window.localStorage.setItem(key, raw);
    noteEdit("Updated locations");
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

const staffLocations = createLocationStore(locationsKey, locationsEvent);

export function getServerLocations() {
  return staffLocations.getServer();
}

export function getLocationsSnapshot() {
  return staffLocations.getSnapshot();
}

export function saveLocations(locations: LocationReference[]) {
  return staffLocations.save(locations);
}

export function subscribeLocations(onStoreChange: () => void) {
  return staffLocations.subscribe(onStoreChange);
}

export function normalizeLocationName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function sameLocationName(left: string, right: string) {
  return normalizeLocationName(left).toLowerCase() === normalizeLocationName(right).toLowerCase();
}

function parseStoredLocations(raw: string | null) {
  if (!raw) {
    return emptyLocations();
  }

  try {
    return normalizeLocations(JSON.parse(raw));
  } catch {
    return emptyLocations();
  }
}

function normalizeLocations(value: unknown): LocationReference[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const locations: LocationReference[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.nickname !== "string" || typeof item.venueName !== "string") {
      continue;
    }

    const nickname = normalizeLocationName(item.nickname);
    const venueName = normalizeLocationName(item.venueName);
    if (!nickname || !venueName) {
      continue;
    }

    const duplicate = locations.some(
      (location) =>
        sameLocationName(location.nickname, nickname) ||
        sameLocationName(location.venueName, venueName),
    );
    if (duplicate) {
      continue;
    }

    const id = typeof item.id === "string" && item.id.trim() ? item.id : crypto.randomUUID();
    const color = normalizeLocationColor(typeof item.color === "string" ? item.color : "", nickname);
    locations.push({ id, nickname, venueName, color });
  }

  return locations;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

let boardRaw: string | null | undefined;
let boardSnapshot: string[] | null = null;
let boardLoaded = false;

export function getServerLocationBoard() {
  return null;
}

export function getLocationBoardSnapshot() {
  if (typeof window === "undefined") {
    return getServerLocationBoard();
  }

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(locationBoardKey);
  } catch {
    raw = null;
  }

  if (boardLoaded && raw === boardRaw) {
    return boardSnapshot;
  }

  boardRaw = raw;
  boardLoaded = true;
  boardSnapshot = raw == null ? null : parseLocationBoard(raw);
  return boardSnapshot;
}

export function saveLocationBoard(ids: string[]) {
  const next = normalizeLocationBoard(ids);
  const raw = JSON.stringify(next);
  window.localStorage.setItem(locationBoardKey, raw);
  noteEdit("Updated the location board");
  boardRaw = raw;
  boardLoaded = true;
  boardSnapshot = next;
  window.dispatchEvent(new Event(locationBoardEvent));
  return next;
}

export function subscribeLocationBoard(onStoreChange: () => void) {
  function onStorage(event: StorageEvent) {
    if (event.key !== locationBoardKey) {
      return;
    }

    onStoreChange();
  }

  window.addEventListener("storage", onStorage);
  window.addEventListener(locationBoardEvent, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(locationBoardEvent, onStoreChange);
  };
}

function parseLocationBoard(raw: string) {
  try {
    return normalizeLocationBoard(JSON.parse(raw));
  } catch {
    return [];
  }
}

function normalizeLocationBoard(value: unknown) {
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
