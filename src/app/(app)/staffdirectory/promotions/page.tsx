import type { Metadata } from "next";
import { Promotions } from "@/components/promotions";

export const metadata: Metadata = {
  title: "Promotions",
};

export default function PromotionsPage() {
  return <Promotions />;
}
