import type { Metadata } from "next";
import { OutsourcedDirectory } from "@/components/outsourced-directory";

export const metadata: Metadata = {
  title: "Out Sourced",
};

export default function OutsourcedPage() {
  return <OutsourcedDirectory />;
}
