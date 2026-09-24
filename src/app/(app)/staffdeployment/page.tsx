import type { Metadata } from "next";
import { StaffLocationBoard } from "@/components/staff-location-board";

export const metadata: Metadata = {
  title: "Staff Deployment",
};

export default function StaffLocationPage() {
  return <StaffLocationBoard />;
}
