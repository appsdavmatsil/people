import type { Metadata } from "next";
import { HiringPositions } from "@/components/hiring-positions";
import { listHiringSubmissions } from "@/lib/hiring-records";
import { listIntakeSubmissions } from "@/lib/staff-intake-records";

export const metadata: Metadata = {
  title: "Hiring Positions",
};

export const dynamic = "force-dynamic";

export default async function HiringPage() {
  const [submissions, applications] = await Promise.all([listIntakeSubmissions(), listHiringSubmissions()]);
  return <HiringPositions submissions={submissions} applications={applications} />;
}
