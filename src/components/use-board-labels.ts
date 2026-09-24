"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  getBoardLabelsSnapshot,
  getEventBoardLabelsSnapshot,
  getServerBoardLabels,
  getServerEventBoardLabels,
  saveBoardLabels,
  saveEventBoardLabels,
  subscribeBoardLabels,
  subscribeEventBoardLabels,
  type BoardLabel,
} from "@/lib/board-labels";

export function useBoardLabels() {
  return useLabelStore(
    subscribeBoardLabels,
    getBoardLabelsSnapshot,
    getServerBoardLabels,
    saveBoardLabels,
  );
}

export function useEventBoardLabels() {
  return useLabelStore(
    subscribeEventBoardLabels,
    getEventBoardLabelsSnapshot,
    getServerEventBoardLabels,
    saveEventBoardLabels,
  );
}

function useLabelStore(
  subscribe: (onStoreChange: () => void) => () => void,
  getSnapshot: () => BoardLabel[],
  getServer: () => BoardLabel[],
  save: (next: BoardLabel[]) => BoardLabel[],
) {
  const labels = useSyncExternalStore(subscribe, getSnapshot, getServer);
  const update = useCallback(
    (next: BoardLabel[]) => {
      save(next);
    },
    [save],
  );

  return { labels, update };
}
