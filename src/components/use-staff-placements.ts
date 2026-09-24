"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  getEventPlacementsSnapshot,
  getPlacementsSnapshot,
  getServerEventPlacements,
  getServerPlacements,
  saveEventPlacements,
  savePlacements,
  subscribeEventPlacements,
  subscribePlacements,
  type StaffPlacement,
} from "@/lib/staff-placements";

export function useStaffPlacements() {
  return usePlacementStore(
    subscribePlacements,
    getPlacementsSnapshot,
    getServerPlacements,
    savePlacements,
  );
}

export function useEventPlacements() {
  return usePlacementStore(
    subscribeEventPlacements,
    getEventPlacementsSnapshot,
    getServerEventPlacements,
    saveEventPlacements,
  );
}

function usePlacementStore(
  subscribe: (onStoreChange: () => void) => () => void,
  getSnapshot: () => StaffPlacement[],
  getServer: () => StaffPlacement[],
  save: (next: StaffPlacement[]) => StaffPlacement[],
) {
  const placements = useSyncExternalStore(subscribe, getSnapshot, getServer);
  const update = useCallback(
    (next: StaffPlacement[]) => {
      save(next);
    },
    [save],
  );

  return { placements, update };
}
