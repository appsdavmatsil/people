"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  getCardTagsSnapshot,
  getEventCardTagsSnapshot,
  getServerCardTags,
  getServerEventCardTags,
  saveCardTags,
  saveEventCardTags,
  subscribeCardTags,
  subscribeEventCardTags,
  type CardTag,
} from "@/lib/card-tags";

export function useCardTags() {
  return useCardTagStore(subscribeCardTags, getCardTagsSnapshot, getServerCardTags, saveCardTags);
}

export function useEventCardTags() {
  return useCardTagStore(
    subscribeEventCardTags,
    getEventCardTagsSnapshot,
    getServerEventCardTags,
    saveEventCardTags,
  );
}

function useCardTagStore(
  subscribe: (onStoreChange: () => void) => () => void,
  getSnapshot: () => CardTag[],
  getServer: () => CardTag[],
  save: (next: CardTag[]) => CardTag[],
) {
  const tags = useSyncExternalStore(subscribe, getSnapshot, getServer);
  const update = useCallback(
    (next: CardTag[]) => {
      save(next);
    },
    [save],
  );

  return { tags, update };
}
