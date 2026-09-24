import { noteEdit } from "@/lib/activity";
import { getPromotionsSnapshot, savePromotions } from "@/lib/promotions";
import { staffRoster } from "@/lib/staff-roster";
import {
  getEventPlacementsSnapshot,
  getPlacementsSnapshot,
  saveEventPlacements,
  savePlacements,
  type StaffPlacement,
} from "@/lib/staff-placements";
import type { StaffEmployee } from "@/lib/staff";

export const staffDirectoryKey = "people.staff-directory";
export const staffDirectoryEvent = "people-staff-directory";

let clientRaw: string | null = null;
let clientSnapshot: StaffEmployee[] | null = null;

export function getServerStaffDirectory() {
  return staffRoster;
}

export function getStaffDirectorySnapshot() {
  if (typeof window === "undefined") {
    return getServerStaffDirectory();
  }

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(staffDirectoryKey);
  } catch {
    raw = null;
  }

  if (clientSnapshot && raw === clientRaw) {
    return clientSnapshot;
  }

  clientRaw = raw;
  clientSnapshot = parseStoredStaff(raw);
  return clientSnapshot;
}

export function saveStaffDirectory(employees: StaffEmployee[]) {
  const raw = JSON.stringify(employees);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(staffDirectoryKey, raw);
  }
  clientRaw = raw;
  clientSnapshot = employees;
  noteEdit("Updated the staff directory");
  syncLinkedNames(employees);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(staffDirectoryEvent));
  }
  return employees;
}

function syncLinkedNames(employees: StaffEmployee[]) {
  if (typeof window === "undefined") {
    return;
  }

  const names = new Map(employees.map((employee) => [employee.id, employee.fullName]));
  const promotions = getPromotionsSnapshot();
  let promotionsChanged = false;
  const nextPromotions = promotions.map((promotion) => {
    const name = names.get(promotion.staffId);
    if (!name || name === promotion.staffName) {
      return promotion;
    }

    promotionsChanged = true;
    return { ...promotion, staffName: name };
  });
  if (promotionsChanged) {
    savePromotions(nextPromotions);
  }

  syncPlacementNames(getPlacementsSnapshot(), savePlacements, names);
  syncPlacementNames(getEventPlacementsSnapshot(), saveEventPlacements, names);
}

function syncPlacementNames(
  placements: StaffPlacement[],
  save: (next: StaffPlacement[]) => StaffPlacement[],
  names: Map<string, string>,
) {
  let changed = false;
  const next = placements.map((person) => {
    const name = names.get(person.id);
    if (!name || name === person.name) {
      return person;
    }

    changed = true;
    return { ...person, name };
  });
  if (changed) {
    save(next);
  }
}

export function subscribeStaffDirectory(onStoreChange: () => void) {
  function onStorage(event: StorageEvent) {
    if (event.key !== staffDirectoryKey) {
      return;
    }

    onStoreChange();
  }

  window.addEventListener("storage", onStorage);
  window.addEventListener(staffDirectoryEvent, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(staffDirectoryEvent, onStoreChange);
  };
}

function parseStoredStaff(raw: string | null) {
  if (!raw) {
    return staffRoster;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return staffRoster;
    }

    const employees: StaffEmployee[] = [];
    for (const item of parsed) {
      if (!isStaffEmployee(item)) {
        continue;
      }
      employees.push(item);
    }

    if (parsed.length > 0 && employees.length === 0) {
      return staffRoster;
    }

    return employees;
  } catch {
    return staffRoster;
  }
}

function isStaffEmployee(value: unknown): value is StaffEmployee {
  if (!value || typeof value !== "object") {
    return false;
  }

  const employee = value as StaffEmployee;
  return typeof employee.id === "string" && typeof employee.fullName === "string";
}
