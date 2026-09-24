import type { Metadata } from "next";
import { StaffDirectory } from "@/components/staff-directory";

export const metadata: Metadata = {
  title: "Staff Directory",
};

export default function StaffPage() {
  return <StaffDirectory />;
}
