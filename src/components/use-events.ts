"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  getEventBoardSnapshot,
  getEventsSnapshot,
  getServerEventBoard,
  getServerEvents,
  saveEventBoard,
  saveEvents,
  subscribeEventBoard,
  subscribeEvents,
  type EventDefinition,
} from "@/lib/events";

export function useEvents() {
  const events = useSyncExternalStore(subscribeEvents, getEventsSnapshot, getServerEvents);
  const update = useCallback((next: EventDefinition[]) => {
    saveEvents(next);
  }, []);

  return { events, update };
}

export function useEventBoard() {
  const ids = useSyncExternalStore(subscribeEventBoard, getEventBoardSnapshot, getServerEventBoard);
  const update = useCallback((next: string[]) => {
    saveEventBoard(next);
  }, []);

  return { ids, update };
}
