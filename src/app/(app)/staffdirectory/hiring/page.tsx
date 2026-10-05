import type { Metadata } from "next";
import { HiringPositions } from "@/components/hiring-positions";
import { listIntakeSubmissions } from "@/lib/staff-intake-records";

export const metadata: Metadata = {
  title: "Hiring Positions",
};

export const dynamic = "force-dynamic";

export default async function HiringPage() {
  return <HiringPositions submissions={await listIntakeSubmissions()} />;
}
