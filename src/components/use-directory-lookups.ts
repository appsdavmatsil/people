"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  getDirectoryLookupsSnapshot,
  getServerDirectoryLookups,
  saveDirectoryLookups,
  subscribeDirectoryLookups,
  type DirectoryLookups,
} from "@/lib/directory-lookups";

export function useDirectoryLookups() {
  const lookups = useSyncExternalStore(
    subscribeDirectoryLookups,
    getDirectoryLookupsSnapshot,
    getServerDirectoryLookups,
  );
  const update = useCallback((next: DirectoryLookups) => {
    saveDirectoryLookups(next);
  }, []);

  return { lookups, update };
}
