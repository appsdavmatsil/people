import { noteEdit } from "@/lib/activity";

export const hiringKey = "people.hiring";
export const hiringEvent = "people-hiring";

export const hiringStatuses = [
  { id: "open", label: "Open" },
  { id: "on-hold", label: "On hold" },
  { id: "filled", label: "Filled" },
] as const;

export type HiringStatus = (typeof hiringStatuses)[number]["id"];

export type HiringRole = {
  id: string;
  position: string;
  department: string;
  venue: string;
  openings: number;
  status: HiringStatus;
  salary: number | null;
  archived?: boolean;
};

export function hiringStatusLabel(status: HiringStatus) {
  return hiringStatuses.find((item) => item.id === status)?.label ?? status;
}

const empty: HiringRole[] = [];
let clientRaw: string | null = null;
let clientSnapshot: HiringRole[] | null = null;
let serverSnapshot: HiringRole[] | null = null;

export function getServerHiring() {
  serverSnapshot ??= empty;
  return serverSnapshot;
}

export function getHiringSnapshot() {
  if (typeof window === "undefined") {
    return getServerHiring();
  }

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(hiringKey);
  } catch {
    raw = null;
  }

  if (clientSnapshot && raw === clientRaw) {
    return clientSnapshot;
  }

  clientRaw = raw;
  clientSnapshot = parseStoredHiring(raw);
  return clientSnapshot;
}

export function saveHiring(roles: HiringRole[]) {
  const next = normalizeHiring(roles);
  const raw = JSON.stringify(next);
  window.localStorage.setItem(hiringKey, raw);
  noteEdit("Updated hiring");
  clientRaw = raw;
  clientSnapshot = next;
  window.dispatchEvent(new Event(hiringEvent));
  return next;
}

export function subscribeHiring(onStoreChange: () => void) {
  function onStorage(event: StorageEvent) {
    if (event.key !== hiringKey) {
      return;
    }

    onStoreChange();
  }

  window.addEventListener("storage", onStorage);
  window.addEventListener(hiringEvent, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(hiringEvent, onStoreChange);
  };
}

function parseStoredHiring(raw: string | null) {
  if (!raw) {
    return empty;
  }

  try {
    return normalizeHiring(JSON.parse(raw));
  } catch {
    return empty;
  }
}

function normalizeHiring(value: unknown): HiringRole[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const roles: HiringRole[] = [];
  for (const item of value) {
    const role = normalizeRole(item);
    if (role && !roles.some((existing) => existing.id === role.id)) {
      roles.push(role);
    }
  }

  return roles;
}

function normalizeRole(value: unknown): HiringRole | null {
  if (!isRecord(value)) {
    return null;
  }

  const position = cleanText(value.position);
  const department = cleanText(value.department);
  const venue = cleanText(value.venue);
  const openings = wholeNumber(value.openings);
  const status = hiringStatus(value.status);
  if (!position || !venue || openings == null || !status) {
    return null;
  }

  const id = typeof value.id === "string" && value.id.trim() ? value.id : crypto.randomUUID();
  return {
    id,
    position,
    department,
    venue,
    openings,
    status,
    salary: money(value.salary),
    archived: value.archived === true,
  };
}

function hiringStatus(value: unknown): HiringStatus | null {
  return hiringStatuses.some((status) => status.id === value) ? (value as HiringStatus) : null;
}

function wholeNumber(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isInteger(number) || number < 0) {
    return null;
  }

  return number;
}

function money(value: unknown) {
  if (value == null || value === "") {
    return null;
  }

  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(number) || number < 0) {
    return null;
  }

  return number;
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
