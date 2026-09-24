"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  getPayrollViewSnapshot,
  getServerPayrollView,
  savePayrollView,
  subscribePayrollView,
} from "@/lib/payroll-view";

export function usePayrollView() {
  const view = useSyncExternalStore(
    subscribePayrollView,
    getPayrollViewSnapshot,
    getServerPayrollView,
  );
  const setIncludePromotions = useCallback((include: boolean) => {
    savePayrollView(include ? "promoted" : "current");
  }, []);

  return { includePromotions: view === "promoted", setIncludePromotions };
}
