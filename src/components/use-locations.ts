"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  getLocationBoardSnapshot,
  getLocationsSnapshot,
  getServerLocationBoard,
  getServerLocations,
  saveLocationBoard,
  saveLocations,
  subscribeLocationBoard,
  subscribeLocations,
  type LocationReference,
} from "@/lib/locations";

export function useLocations() {
  return useLocationStore(
    subscribeLocations,
    getLocationsSnapshot,
    getServerLocations,
    saveLocations,
  );
}

function useLocationStore(
  subscribe: (onStoreChange: () => void) => () => void,
  getSnapshot: () => LocationReference[],
  getServer: () => LocationReference[],
  save: (next: LocationReference[]) => LocationReference[],
) {
  const locations = useSyncExternalStore(subscribe, getSnapshot, getServer);
  const update = useCallback(
    (next: LocationReference[]) => {
      save(next);
    },
    [save],
  );

  return { locations, update };
}

export function useLocationBoard() {
  const ids = useSyncExternalStore(
    subscribeLocationBoard,
    getLocationBoardSnapshot,
    getServerLocationBoard,
  );
  const update = useCallback((next: string[]) => {
    saveLocationBoard(next);
  }, []);

  return { ids, update };
}
