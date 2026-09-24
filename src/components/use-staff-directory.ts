"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  getServerStaffDirectory,
  getStaffDirectorySnapshot,
  saveStaffDirectory,
  subscribeStaffDirectory,
} from "@/lib/staff-directory-store";
import type { StaffEmployee } from "@/lib/staff";

export function useStaffDirectory() {
  const employees = useSyncExternalStore(
    subscribeStaffDirectory,
    getStaffDirectorySnapshot,
    getServerStaffDirectory,
  );
  const update = useCallback(
    (next: StaffEmployee[] | ((current: StaffEmployee[]) => StaffEmployee[])) => {
      const current = getStaffDirectorySnapshot();
      saveStaffDirectory(typeof next === "function" ? next(current) : next);
    },
    [],
  );

  return { employees, update };
}
