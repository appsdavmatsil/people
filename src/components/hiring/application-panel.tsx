"use client";

import { useEffect, useState } from "react";
import { loadHiringApplicationsAction } from "@/app/(app)/hiringform/actions";
import { HiringResponses } from "@/components/hiring/hiring-responses";
import type { ConfigTextField } from "@/lib/form-config";
import type { HiringSubmission } from "@/lib/hiring-records";

type Loaded = { submissions: HiringSubmission[]; fields: ConfigTextField[] };

/** Opens one hiring application over the current page, without leaving it. */
export function ApplicationPanel({ applicationId, onClose }: { applicationId: string; onClose: () => void }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadHiringApplicationsAction()
      .then((result) => {
        if (!active) return;
        if (!result.ok) setError(result.error);
        else if (!result.submissions.some((s) => s.id === applicationId)) setError("This application no longer exists.");
        else setLoaded({ submissions: result.submissions, fields: result.fields });
      })
      .catch(() => {
        if (active) setError("Could not load the application.");
      });
    return () => {
      active = false;
    };
  }, [applicationId]);

  useEffect(() => {
    if (loaded) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [loaded, onClose]);

  if (loaded) {
    return <HiringResponses submissions={loaded.submissions} fields={loaded.fields} openApplicationId={applicationId} panelOnly onClose={onClose} />;
  }

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-stone-950/40" onClick={onClose}>
      <div className="flex h-full w-full max-w-2xl flex-col bg-white shadow-xl" onClick={(event) => event.stopPropagation()}>
        <header className="flex items-center justify-between gap-4 bg-[#063f3b] px-6 py-4 text-white">
          <h2 className="text-xl font-semibold tracking-tight">Application</h2>
          <button onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white">×</button>
        </header>
        <p className="p-6 text-sm text-stone-500">{error ?? "Loading…"}</p>
      </div>
    </div>
  );
}
