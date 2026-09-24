export type OutsourcedPerson = {
  id: string;
  fullName: string;
  company: string;
  position: string;
  venue: string;
  startDate: string;
  endDate: string;
  rate: number | null;
  archived?: boolean;
};

export const outsourcedKey = "people.outsourced";
export const outsourcedEvent = "people-outsourced";

const empty: OutsourcedPerson[] = [];
let clientRaw: string | null = null;
let clientSnapshot: OutsourcedPerson[] | null = null;
let serverSnapshot: OutsourcedPerson[] | null = null;

export function getServerOutsourced() {
  serverSnapshot ??= empty;
  return serverSnapshot;
}

export function getOutsourcedSnapshot() {
  if (typeof window === "undefined") {
    return getServerOutsourced();
  }

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(outsourcedKey);
  } catch {
    raw = null;
  }

  if (clientSnapshot && raw === clientRaw) {
    return clientSnapshot;
  }

  clientRaw = raw;
  clientSnapshot = parseStoredOutsourced(raw);
  return clientSnapshot;
}

export function saveOutsourced(people: OutsourcedPerson[]) {
  const raw = JSON.stringify(people);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(outsourcedKey, raw);
    window.dispatchEvent(new Event(outsourcedEvent));
  }
  clientRaw = raw;
  clientSnapshot = people;
  return people;
}

export function subscribeOutsourced(onStoreChange: () => void) {
  function onStorage(event: StorageEvent) {
    if (event.key !== outsourcedKey) {
      return;
    }

    onStoreChange();
  }

  window.addEventListener("storage", onStorage);
  window.addEventListener(outsourcedEvent, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(outsourcedEvent, onStoreChange);
  };
}

function parseStoredOutsourced(raw: string | null) {
  if (!raw) {
    return empty;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return empty;
    }

    return parsed.filter((item): item is OutsourcedPerson => {
      if (!item || typeof item !== "object") {
        return false;
      }

      const person = item as OutsourcedPerson;
      return typeof person.id === "string" && typeof person.fullName === "string";
    });
  } catch {
    return empty;
  }
}
