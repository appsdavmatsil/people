import type { Metadata } from "next";
import { StaffDirectory } from "@/components/staff-directory";

export const metadata: Metadata = {
  title: "Staff Directory",
};

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const { edit } = await searchParams;
  return <StaffDirectory editId={edit} />;
}
