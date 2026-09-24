import type { Metadata } from "next";
import { OutsourcedDirectory } from "@/components/outsourced-directory";

export const metadata: Metadata = {
  title: "Out Sourced",
};

export default async function OutsourcedPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const { edit } = await searchParams;
  return <OutsourcedDirectory editId={edit} />;
}
