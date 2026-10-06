import type { Metadata } from "next";
import { StaffDocumentsScreen } from "@/components/staff-documents-screen";
import { listIntakeSubmissions } from "@/lib/staff-intake-records";

export const metadata: Metadata = {
  title: "Staff Documents",
};

export const dynamic = "force-dynamic";

export default async function StaffDocumentsPage() {
  return <StaffDocumentsScreen submissions={await listIntakeSubmissions()} />;
}
