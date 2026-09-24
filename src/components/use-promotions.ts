"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  getPromotionsSnapshot,
  getServerPromotions,
  savePromotions,
  subscribePromotions,
  type StaffPromotion,
} from "@/lib/promotions";

export function usePromotions() {
  const promotions = useSyncExternalStore(
    subscribePromotions,
    getPromotionsSnapshot,
    getServerPromotions,
  );
  const update = useCallback(
    (next: StaffPromotion[] | ((current: StaffPromotion[]) => StaffPromotion[])) => {
      const current = getPromotionsSnapshot();
      savePromotions(typeof next === "function" ? next(current) : next);
    },
    [],
  );

  return { promotions, update };
}
