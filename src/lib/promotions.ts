import { noteEdit } from "@/lib/activity";
import { splitSalary, type StaffEmployee } from "@/lib/staff";

export const promotionsKey = "people.promotions";
export const promotionsEvent = "people-promotions";

export type StaffPromotion = {
  id: string;
  staffId: string;
  staffName: string;
  currentPosition: string;
  currentSalary: number | null;
  newPosition: string;
  newSalary: number;
  effectiveDate: string;
  applied: boolean;
  archived?: boolean;
};

const empty: StaffPromotion[] = [];
let clientRaw: string | null = null;
let clientSnapshot: StaffPromotion[] | null = null;
let serverSnapshot: StaffPromotion[] | null = null;

export function getServerPromotions() {
  serverSnapshot ??= empty;
  return serverSnapshot;
}

export function getPromotionsSnapshot() {
  if (typeof window === "undefined") {
    return getServerPromotions();
  }

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(promotionsKey);
  } catch {
    raw = null;
  }

  if (clientSnapshot && raw === clientRaw) {
    return clientSnapshot;
  }

  clientRaw = raw;
  clientSnapshot = parseStoredPromotions(raw);
  return clientSnapshot;
}

export function savePromotions(promotions: StaffPromotion[]) {
  const next = normalizePromotions(promotions);
  const raw = JSON.stringify(next);
  window.localStorage.setItem(promotionsKey, raw);
  noteEdit("Updated promotions");
  clientRaw = raw;
  clientSnapshot = next;
  window.dispatchEvent(new Event(promotionsEvent));
  return next;
}

export function subscribePromotions(onStoreChange: () => void) {
  function onStorage(event: StorageEvent) {
    if (event.key !== promotionsKey) {
      return;
    }

    onStoreChange();
  }

  window.addEventListener("storage", onStorage);
  window.addEventListener(promotionsEvent, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(promotionsEvent, onStoreChange);
  };
}

function parseStoredPromotions(raw: string | null) {
  if (!raw) {
    return empty;
  }

  try {
    return normalizePromotions(JSON.parse(raw));
  } catch {
    return empty;
  }
}

function normalizePromotions(value: unknown): StaffPromotion[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const promotions: StaffPromotion[] = [];
  for (const item of value) {
    const promotion = normalizePromotion(item);
    if (promotion && !promotions.some((existing) => existing.id === promotion.id)) {
      promotions.push(promotion);
    }
  }

  return promotions;
}

function normalizePromotion(value: unknown): StaffPromotion | null {
  if (!isRecord(value)) {
    return null;
  }

  const staffName = cleanText(value.staffName);
  const newPosition = cleanText(value.newPosition);
  const effectiveDate = isoDate(value.effectiveDate);
  const newSalary = money(value.newSalary);
  if (!staffName || !newPosition || !effectiveDate || newSalary == null) {
    return null;
  }

  const id = typeof value.id === "string" && value.id.trim() ? value.id : crypto.randomUUID();
  const staffId = typeof value.staffId === "string" ? value.staffId.trim() : "";
  return {
    id,
    staffId,
    staffName,
    currentPosition: cleanText(value.currentPosition),
    currentSalary: money(value.currentSalary),
    newPosition,
    newSalary,
    effectiveDate,
    applied: value.applied === true,
    archived: value.archived === true,
  };
}

export function linkPromotionToStaff(promotion: StaffPromotion, employees: StaffEmployee[]) {
  const staffId = promotion.staffId.trim();
  if (staffId) {
    const employee = employees.find((item) => item.id === staffId);
    if (!employee) {
      return promotion;
    }

    return { ...promotion, staffId: employee.id, staffName: employee.fullName };
  }

  const name = promotion.staffName.trim().toLowerCase();
  const matches = employees.filter((item) => item.fullName.trim().toLowerCase() === name);
  if (matches.length !== 1) {
    return promotion;
  }

  return { ...promotion, staffId: matches[0].id, staffName: matches[0].fullName };
}

export function mergeImportedPromotions(current: StaffPromotion[], imported: StaffPromotion[]) {
  const next = [...current];
  const created: StaffPromotion[] = [];
  const updatedIds = new Set<string>();

  for (const promotion of imported) {
    const existingIndex = next.findIndex((item) => samePromotion(item, promotion));
    if (existingIndex !== -1) {
      next[existingIndex] = keepPromotionIdentity(next[existingIndex], promotion);
      updatedIds.add(next[existingIndex].id);
      continue;
    }

    const createdIndex = created.findIndex((item) => samePromotion(item, promotion));
    if (createdIndex !== -1) {
      created[createdIndex] = keepPromotionIdentity(created[createdIndex], promotion);
      continue;
    }

    created.push(promotion);
  }

  return { promotions: [...created, ...next], added: created.length, updated: updatedIds.size };
}

function keepPromotionIdentity(previous: StaffPromotion, incoming: StaffPromotion): StaffPromotion {
  return {
    ...incoming,
    id: previous.id,
    staffId: incoming.staffId || previous.staffId,
    staffName: incoming.staffName || previous.staffName,
    applied: previous.applied,
    archived: previous.archived,
  };
}

function samePromotion(existing: StaffPromotion, incoming: StaffPromotion) {
  const sameChange =
    existing.effectiveDate === incoming.effectiveDate &&
    existing.newPosition.trim().toLowerCase() === incoming.newPosition.trim().toLowerCase();
  if (!sameChange) {
    return false;
  }

  if (incoming.staffId && existing.staffId) {
    return existing.staffId === incoming.staffId;
  }

  const incomingName = incoming.staffName.trim().toLowerCase();
  const existingName = existing.staffName.trim().toLowerCase();
  return incomingName.length > 0 && incomingName === existingName;
}

export function todayIso(now = new Date()) {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function pendingPromotion(
  promotions: StaffPromotion[],
  staffId: string,
  today = todayIso(),
) {
  let pending: StaffPromotion | null = null;
  for (const promotion of promotions) {
    if (
      promotion.archived ||
      promotion.applied ||
      promotion.staffId !== staffId ||
      promotion.effectiveDate <= today
    ) {
      continue;
    }

    if (!pending || promotion.effectiveDate >= pending.effectiveDate) {
      pending = promotion;
    }
  }

  return pending;
}

export function settleDuePromotions(
  promotions: StaffPromotion[],
  employees: StaffEmployee[],
  today = todayIso(),
) {
  let promotionsChanged = false;
  const nextPromotions = promotions.map((promotion) => {
    if (promotion.archived || promotion.applied || promotion.effectiveDate > today) {
      return promotion;
    }

    promotionsChanged = true;
    return { ...promotion, applied: true };
  });

  if (!promotionsChanged) {
    return null;
  }

  const latest = new Map<string, StaffPromotion>();
  for (const promotion of nextPromotions) {
    if (
      !promotion.staffId ||
      promotion.effectiveDate > today ||
      promotions.find((item) => item.id === promotion.id)?.applied
    ) {
      continue;
    }

    const previous = latest.get(promotion.staffId);
    if (!previous || promotion.effectiveDate >= previous.effectiveDate) {
      latest.set(promotion.staffId, promotion);
    }
  }

  let employeesChanged = false;
  const nextEmployees = employees.map((employee) => {
    const promotion = latest.get(employee.id);
    if (!promotion) {
      return employee;
    }

    const pay = splitSalary(promotion.newSalary);
    if (
      employee.position === promotion.newPosition &&
      employee.salary === pay.salary &&
      employee.basicSalary === pay.basicSalary &&
      employee.allowances === pay.allowances
    ) {
      return employee;
    }

    employeesChanged = true;
    return { ...employee, position: promotion.newPosition, ...pay };
  });

  return {
    promotions: nextPromotions,
    employees: employeesChanged ? nextEmployees : employees,
    employeesChanged,
  };
}

function money(value: unknown) {
  if (value == null || value === "") {
    return null;
  }

  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(number) || number < 0) {
    return null;
  }

  return Math.round(number * 100) / 100;
}

function isoDate(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
