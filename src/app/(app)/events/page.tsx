import type { Metadata } from "next";
import { EventsManningBoard } from "@/components/staff-location-board";

export const metadata: Metadata = {
  title: "Events Manning",
};

export default function EventsManningPage() {
  return <EventsManningBoard />;
}
