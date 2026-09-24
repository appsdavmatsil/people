import { noteEdit } from "@/lib/activity";
import { staffRoster } from "@/lib/staff-roster";
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
  for (const listener of listeners) {
    listener();
  }
  return snapshot;
}

export function subscribeStaffDirectory(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}
