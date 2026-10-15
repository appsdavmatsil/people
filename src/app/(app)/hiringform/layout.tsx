import { Suspense } from "react";
import { HiringSectionNav } from "@/components/hiring-section-nav";

export default function HiringFormLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-5 md:px-6">
      <Suspense fallback={<div className="h-8" />}>
        <HiringSectionNav />
      </Suspense>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden pt-5">{children}</div>
    </div>
  );
}
