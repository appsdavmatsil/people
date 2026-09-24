"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  getCardLabelsSnapshot,
  getEventCardLabelsSnapshot,
  getServerCardLabels,
  getServerEventCardLabels,
  saveCardLabels,
  saveEventCardLabels,
  subscribeCardLabels,
  subscribeEventCardLabels,
  type CardLabel,
} from "@/lib/card-labels";

export function useCardLabels() {
  return useCardLabelStore(
    subscribeCardLabels,
    getCardLabelsSnapshot,
    getServerCardLabels,
    saveCardLabels,
  );
}

export function useEventCardLabels() {
  return useCardLabelStore(
    subscribeEventCardLabels,
    getEventCardLabelsSnapshot,
    getServerEventCardLabels,
    saveEventCardLabels,
  );
}

function useCardLabelStore(
  subscribe: (onStoreChange: () => void) => () => void,
  getSnapshot: () => CardLabel[],
  getServer: () => CardLabel[],
  save: (next: CardLabel[]) => CardLabel[],
) {
  const labels = useSyncExternalStore(subscribe, getSnapshot, getServer);
  const update = useCallback(
    (next: CardLabel[]) => {
      save(next);
    },
    [save],
  );

  return { labels, update };
}
