import { noteEdit } from "@/lib/activity";

export const boardOrderKey = "people.board-order";
export const boardOrderEvent = "people-board-order";
export const eventBoardOrderKey = "people.event-board-order";
export const eventBoardOrderEvent = "people-event-board-order";

export type ColumnOrders = Record<string, string[]>;

export function columnOrderKey(locationId: string | null) {
  return locationId ?? "";
}

export function emptyColumnOrders(): ColumnOrders {
  return {};
}

function createOrderStore(key: string, eventName: string, summary: string) {
  let clientRaw: string | null = null;
  let clientSnapshot: ColumnOrders | null = null;
  let serverSnapshot: ColumnOrders | null = null;

  function getServer() {
    serverSnapshot ??= emptyColumnOrders();
    return serverSnapshot;
  }

  function getSnapshot() {
    if (typeof window === "undefined") {
      return getServer();
    }

    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(key);
    } catch {
      raw = null;
    }

    if (clientSnapshot && raw === clientRaw) {
      return clientSnapshot;
    }

    clientRaw = raw;
    clientSnapshot = parseStoredOrders(raw);
    return clientSnapshot;
  }

  function save(orders: ColumnOrders) {
    const next = normalizeOrders(orders);
    const raw = JSON.stringify(next);
    window.localStorage.setItem(key, raw);
    noteEdit(summary);
    clientRaw = raw;
    clientSnapshot = next;
    window.dispatchEvent(new Event(eventName));
    return next;
  }

  function subscribe(onStoreChange: () => void) {
    function onStorage(event: StorageEvent) {
      if (event.key !== key) {
        return;
      }

      onStoreChange();
    }

    window.addEventListener("storage", onStorage);
    window.addEventListener(eventName, onStoreChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(eventName, onStoreChange);
    };
  }

  return { getServer, getSnapshot, save, subscribe };
}

const venueOrder = createOrderStore(boardOrderKey, boardOrderEvent, "Updated board order");
const eventOrder = createOrderStore(eventBoardOrderKey, eventBoardOrderEvent, "Updated event board order");

export function getServerBoardOrder() {
  return venueOrder.getServer();
}

export function getBoardOrderSnapshot() {
  return venueOrder.getSnapshot();
}

export function saveBoardOrder(orders: ColumnOrders) {
  return venueOrder.save(orders);
}

export function subscribeBoardOrder(onStoreChange: () => void) {
  return venueOrder.subscribe(onStoreChange);
}

export function getServerEventBoardOrder() {
  return eventOrder.getServer();
}

export function getEventBoardOrderSnapshot() {
  return eventOrder.getSnapshot();
}

export function saveEventBoardOrder(orders: ColumnOrders) {
  return eventOrder.save(orders);
}

export function subscribeEventBoardOrder(onStoreChange: () => void) {
  return eventOrder.subscribe(onStoreChange);
}

function parseStoredOrders(raw: string | null) {
  if (!raw) {
    return emptyColumnOrders();
  }

  try {
    return normalizeOrders(JSON.parse(raw));
  } catch {
    return emptyColumnOrders();
  }
}

function normalizeOrders(value: unknown): ColumnOrders {
  if (!isRecord(value)) {
    return {};
  }

  const orders: ColumnOrders = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!Array.isArray(entry)) {
      continue;
    }

    const ids: string[] = [];
    const seen = new Set<string>();
    for (const id of entry) {
      if (typeof id !== "string") {
        continue;
      }

      const trimmed = id.trim();
      if (!trimmed || seen.has(trimmed)) {
        continue;
      }

      seen.add(trimmed);
      ids.push(trimmed);
    }

    if (ids.length > 0) {
      orders[key] = ids;
    }
  }

  return orders;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
