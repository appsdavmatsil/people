import type { Metadata } from "next";
import { HiringPositions } from "@/components/hiring-positions";

export const metadata: Metadata = {
  title: "Hiring Positions",
};

export default function HiringPage() {
  return <HiringPositions />;
}
