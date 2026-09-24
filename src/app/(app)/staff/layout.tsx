import { StaffSectionNav } from "@/components/staff-section-nav";

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-5 md:px-6">
      <StaffSectionNav />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden pt-5">{children}</div>
    </div>
  );
}
