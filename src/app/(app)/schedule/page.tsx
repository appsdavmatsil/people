import type { Metadata } from "next";
import { StaffLocationBoard } from "@/components/staff-location-board";

export const metadata: Metadata = {
  title: "Staff Location",
};

export default function StaffLocationPage() {
  return <StaffLocationBoard />;
}
