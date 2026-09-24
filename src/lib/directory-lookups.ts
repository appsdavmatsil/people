import { noteEdit } from "@/lib/activity";
import { countryNames } from "@/lib/countries";
import { parseMoneyInput, roundMoney } from "@/lib/staff";

export const directoryLookupsKey = "people.directory-lookups";
export const directoryLookupsEvent = "people-directory-lookups";

export type LookupCountry = {
  id: string;
  name: string;
};

export type LookupDepartment = {
  id: string;
  name: string;
};

export type LookupPosition = {
  id: string;
  departmentId: string;
  name: string;
  defaultSalary: number | null;
};

export type DirectoryLookups = {
  countries: LookupCountry[];
  departments: LookupDepartment[];
  positions: LookupPosition[];
};

export function seedCountries(): LookupCountry[] {
  return countryNames.map((name) => ({
    id: slug(name),
    name,
  }));
}

export function emptyDirectoryLookups(): DirectoryLookups {
  return {
    countries: seedCountries(),
    departments: [],
    positions: [],
  };
}

let clientRaw: string | null = null;
let clientSnapshot: DirectoryLookups | null = null;
let serverSnapshot: DirectoryLookups | null = null;

export function getServerDirectoryLookups() {
  serverSnapshot ??= emptyDirectoryLookups();
  return serverSnapshot;
}

export function getDirectoryLookupsSnapshot() {
  if (typeof window === "undefined") {
    return getServerDirectoryLookups();
  }

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(directoryLookupsKey);
  } catch {
    raw = null;
  }

  if (clientSnapshot && raw === clientRaw) {
    return clientSnapshot;
  }

  clientRaw = raw;
  clientSnapshot = parseStoredLookups(raw);
  return clientSnapshot;
}

export function loadDirectoryLookups() {
  return getDirectoryLookupsSnapshot();
}

export function saveDirectoryLookups(lookups: DirectoryLookups) {
  const next = normalizeDirectoryLookups(lookups);
  const raw = JSON.stringify(next);
  window.localStorage.setItem(directoryLookupsKey, raw);
  noteEdit("Updated directory lookups");
  clientRaw = raw;
  clientSnapshot = next;
  window.dispatchEvent(new Event(directoryLookupsEvent));
  return next;
}

export function subscribeDirectoryLookups(onStoreChange: () => void) {
  function onStorage(event: StorageEvent) {
    if (event.key !== directoryLookupsKey) {
      return;
    }

    onStoreChange();
  }

  window.addEventListener("storage", onStorage);
  window.addEventListener(directoryLookupsEvent, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(directoryLookupsEvent, onStoreChange);
  };
}

function parseStoredLookups(raw: string | null) {
  if (!raw) {
    return emptyDirectoryLookups();
  }

  try {
    return normalizeDirectoryLookups(JSON.parse(raw));
  } catch {
    return emptyDirectoryLookups();
  }
}

export function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function sameName(left: string, right: string) {
  return normalizeName(left).toLowerCase() === normalizeName(right).toLowerCase();
}

export function parseDefaultSalary(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return { salary: null as number | null, error: "" };
  }

  const amount = parseMoneyInput(trimmed);
  if (amount == null) {
    return { salary: null, error: "Enter a valid default salary." };
  }

  if (amount < 0) {
    return { salary: null, error: "Default salary can't be negative." };
  }

  return { salary: roundMoney(amount), error: "" };
}

function normalizeDirectoryLookups(value: unknown): DirectoryLookups {
  const record = isRecord(value) ? value : {};
  const departments = normalizeDepartments(record.departments);
  const departmentIds = new Set(departments.map((department) => department.id));

  return {
    countries: Array.isArray(record.countries)
      ? normalizeCountries(record.countries)
      : seedCountries(),
    departments,
    positions: normalizePositions(record.positions, departmentIds),
  };
}

function normalizeCountries(value: unknown): LookupCountry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const countries: LookupCountry[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.name !== "string") {
      continue;
    }

    const name = normalizeName(item.name);
    if (!name || countries.some((country) => sameName(country.name, name))) {
      continue;
    }

    const id = typeof item.id === "string" && item.id.trim() ? item.id : slug(name);
    countries.push({ id, name });
  }

  return countries;
}

function normalizeDepartments(value: unknown): LookupDepartment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const departments: LookupDepartment[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.name !== "string") {
      continue;
    }

    const name = normalizeName(item.name);
    if (!name || departments.some((department) => sameName(department.name, name))) {
      continue;
    }

    const id =
      typeof item.id === "string" && item.id.trim() ? item.id : crypto.randomUUID();
    departments.push({ id, name });
  }

  return departments;
}

function normalizePositions(value: unknown, departmentIds: Set<string>): LookupPosition[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const positions: LookupPosition[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.name !== "string" || typeof item.departmentId !== "string") {
      continue;
    }

    if (!departmentIds.has(item.departmentId)) {
      continue;
    }

    const name = normalizeName(item.name);
    if (!name) {
      continue;
    }

    const duplicate = positions.some(
      (position) =>
        position.departmentId === item.departmentId && sameName(position.name, name),
    );
    if (duplicate) {
      continue;
    }

    const id = typeof item.id === "string" && item.id.trim() ? item.id : crypto.randomUUID();
    positions.push({
      id,
      departmentId: item.departmentId,
      name,
      defaultSalary: normalizeSalary(item.defaultSalary),
    });
  }

  return positions;
}

function normalizeSalary(value: unknown) {
  if (value == null || value === "") {
    return null;
  }

  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }

  return roundMoney(amount);
}

function slug(value: string) {
  const base = normalizeName(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return base || "country";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
