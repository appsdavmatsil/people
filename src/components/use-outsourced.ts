"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  getOutsourcedSnapshot,
  getServerOutsourced,
  saveOutsourced,
  subscribeOutsourced,
  type OutsourcedPerson,
} from "@/lib/outsourced";

export function useOutsourced() {
  const people = useSyncExternalStore(
    subscribeOutsourced,
    getOutsourcedSnapshot,
    getServerOutsourced,
  );
  const update = useCallback(
    (next: OutsourcedPerson[] | ((current: OutsourcedPerson[]) => OutsourcedPerson[])) => {
      const current = getOutsourcedSnapshot();
      saveOutsourced(typeof next === "function" ? next(current) : next);
    },
    [],
  );

  return { people, update };
}
