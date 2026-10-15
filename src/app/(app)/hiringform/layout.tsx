import { Suspense } from "react";
import { HiringSectionNav } from "@/components/hiring-section-nav";
import { loadHiringShareToken } from "@/lib/hiring-share";

export default async function HiringFormLayout({ children }: { children: React.ReactNode }) {
  const shareToken = await loadHiringShareToken();
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pt-5 md:px-6 md:pb-5">
      <Suspense fallback={<div className="h-8" />}>
        <HiringSectionNav shareToken={shareToken} />
      </Suspense>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden pt-5">{children}</div>
    </div>
  );
}
