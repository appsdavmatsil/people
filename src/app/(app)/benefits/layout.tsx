import { Suspense } from "react";
import { BenefitsSectionNav } from "@/components/benefits-section-nav";

export default function BenefitsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-5 md:px-6">
      <Suspense fallback={<div className="h-8" />}>
        <BenefitsSectionNav />
      </Suspense>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden pt-5">{children}</div>
    </div>
  );
}
