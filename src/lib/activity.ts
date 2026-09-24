import { recordActivityAction } from "@/lib/auth/team";

const logKey = "people.access-log";
const recent = new Map<string, number>();

type LocalEntry = {
  id: string;
  occurredAt: string;
  kind: "access" | "edit";
  summary: string;
};

let actorId = "";

export function setActivityActor(id: string) {
  actorId = id;
}

export function noteEdit(summary: string) {
  note("edit", summary, 1500);
}

export function noteAccess(summary: string) {
  note("access", summary, 60 * 60 * 1000);
}

export function readLocalAccessLog(userId: string): LocalEntry[] {
  const store = readStore();
  return store[userId] ?? [];
}

function note(kind: LocalEntry["kind"], summary: string, waitMs: number) {
  if (typeof window === "undefined" || !summary.trim()) {
    return;
  }

  const now = Date.now();
  const key = `${kind}:${summary}`;
  if (now - (recent.get(key) ?? 0) < waitMs) {
    return;
  }

  recent.set(key, now);
  const entry: LocalEntry = {
    id: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    kind,
    summary,
  };

  if (actorId) {
    const store = readStore();
    const current = store[actorId] ?? [];
    store[actorId] = [entry, ...current].slice(0, 100);
    window.localStorage.setItem(logKey, JSON.stringify(store));
  }

  void recordActivityAction(kind, summary, entry.id);
}

function readStore(): Record<string, LocalEntry[]> {
  try {
    const raw = window.localStorage.getItem(logKey);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return parsed as Record<string, LocalEntry[]>;
  } catch {
    return {};
  }
}
