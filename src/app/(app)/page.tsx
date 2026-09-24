import type { Metadata } from "next";
import { HomeInsights } from "@/components/home-insights";

export const metadata: Metadata = {
  title: "Home",
};

export default function HomePage() {
  return <HomeInsights />;
}
