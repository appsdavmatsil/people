"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { privacyStatusAction } from "@/lib/privacy-actions";
import {
  defaultPrivacySnapshot,
  privacyUnlockKey,
  type PrivacySnapshot,
} from "@/lib/privacy";

type PrivacyContextValue = {
  ready: boolean;
  snapshot: PrivacySnapshot;
  error: string;
  unlocked: boolean;
  refresh: () => Promise<PrivacySnapshot | null>;
  applySnapshot: (snapshot: PrivacySnapshot) => void;
  unlock: (stamp: string) => void;
  lock: () => void;
};

const PrivacyContext = createContext<PrivacyContextValue | null>(null);

export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<PrivacySnapshot>(defaultPrivacySnapshot);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [unlockStamp, setUnlockStamp] = useState("");

  function applySnapshot(next: PrivacySnapshot) {
    setSnapshot(next);
    setReady(true);
  }

  async function refresh() {
    const result = await privacyStatusAction();

    if (result.snapshot) {
      applySnapshot(result.snapshot);
    }

    setError(result.error ?? "");
    return result.snapshot ?? null;
  }

  useEffect(() => {
    const stored = window.sessionStorage.getItem(privacyUnlockKey) ?? "";
    setUnlockStamp(stored);
    void refresh();
  }, []);

  const unlocked = !snapshot.passwordEnabled || (snapshot.stamp !== "" && unlockStamp === snapshot.stamp);

  const value = useMemo<PrivacyContextValue>(
    () => ({
      ready,
      snapshot,
      error,
      unlocked,
      refresh,
      applySnapshot,
      unlock(stamp: string) {
        window.sessionStorage.setItem(privacyUnlockKey, stamp);
        setUnlockStamp(stamp);
      },
      lock() {
        window.sessionStorage.removeItem(privacyUnlockKey);
        setUnlockStamp("");
      },
    }),
    [ready, snapshot, error, unlocked],
  );

  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>;
}

export function usePrivacy() {
  const value = useContext(PrivacyContext);

  if (!value) {
    throw new Error("usePrivacy must be used within PrivacyProvider");
  }

  return value;
}
