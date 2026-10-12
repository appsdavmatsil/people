import type { Metadata } from "next";
import { FormNotifications } from "@/components/form/form-notifications";
import { listIntakeSubmissions } from "@/lib/staff-intake-records";

export const metadata: Metadata = {
  title: "Staff Notifications",
};

export const dynamic = "force-dynamic";

export default async function StaffNotificationsPage() {
  return <FormNotifications submissions={await listIntakeSubmissions()} />;
}
