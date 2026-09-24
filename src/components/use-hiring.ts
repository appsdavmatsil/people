"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  getHiringSnapshot,
  getServerHiring,
  saveHiring,
  subscribeHiring,
  type HiringRole,
} from "@/lib/hiring";

export function useHiring() {
  const roles = useSyncExternalStore(subscribeHiring, getHiringSnapshot, getServerHiring);
  const update = useCallback(
    (next: HiringRole[] | ((current: HiringRole[]) => HiringRole[])) => {
      const current = getHiringSnapshot();
      saveHiring(typeof next === "function" ? next(current) : next);
    },
    [],
  );

  return { roles, update };
}
