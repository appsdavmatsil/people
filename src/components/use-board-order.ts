"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  getBoardOrderSnapshot,
  getEventBoardOrderSnapshot,
  getServerBoardOrder,
  getServerEventBoardOrder,
  saveBoardOrder,
  saveEventBoardOrder,
  subscribeBoardOrder,
  subscribeEventBoardOrder,
  type ColumnOrders,
} from "@/lib/board-order";

export function useBoardOrder() {
  return useOrderStore(
    subscribeBoardOrder,
    getBoardOrderSnapshot,
    getServerBoardOrder,
    saveBoardOrder,
  );
}

export function useEventBoardOrder() {
  return useOrderStore(
    subscribeEventBoardOrder,
    getEventBoardOrderSnapshot,
    getServerEventBoardOrder,
    saveEventBoardOrder,
  );
}

function useOrderStore(
  subscribe: (onStoreChange: () => void) => () => void,
  getSnapshot: () => ColumnOrders,
  getServer: () => ColumnOrders,
  save: (next: ColumnOrders) => ColumnOrders,
) {
  const orders = useSyncExternalStore(subscribe, getSnapshot, getServer);
  const update = useCallback(
    (next: ColumnOrders) => {
      save(next);
    },
    [save],
  );

  return { orders, update };
}
