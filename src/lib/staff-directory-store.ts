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

let snapshot: StaffEmployee[] = staffRoster;
const listeners = new Set<() => void>();

export function getServerStaffDirectory() {
  return staffRoster;
}

export function getStaffDirectorySnapshot() {
  return snapshot;
}

export function saveStaffDirectory(employees: StaffEmployee[]) {
  snapshot = employees;
  noteEdit("Updated the staff directory");
  syncLinkedNames(employees);
  for (const listener of listeners) {
    listener();
  }
  return snapshot;
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
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}
