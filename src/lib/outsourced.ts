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

const empty: OutsourcedPerson[] = [];
let snapshot: OutsourcedPerson[] = empty;
const listeners = new Set<() => void>();

export function getServerOutsourced() {
  return empty;
}

export function getOutsourcedSnapshot() {
  return snapshot;
}

export function saveOutsourced(people: OutsourcedPerson[]) {
  snapshot = people;
  for (const listener of listeners) {
    listener();
  }
  return snapshot;
}

export function subscribeOutsourced(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}
