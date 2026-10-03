import type { IntakeSubmission } from "@/lib/staff-intake-records";

type Alert = {
  name: string;
  kind: "Emirates ID" | "Passport";
  expiry: string;
  daysLeft: number;
};

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export function FormNotifications({ submissions }: { submissions: IntakeSubmission[] }) {
  const alerts: Alert[] = [];

  for (const s of submissions) {
    // Emirates ID: alert within 1 month (30 days).
    const eid = daysUntil(s.emirates_id_expiry);
    if (s.emirates_id_expiry && eid !== null && eid <= 30) {
      alerts.push({ name: s.full_name, kind: "Emirates ID", expiry: s.emirates_id_expiry, daysLeft: eid });
    }
    // Passport: alert within 6 months (~183 days).
    const pp = daysUntil(s.passport_expiry);
    if (s.passport_expiry && pp !== null && pp <= 183) {
      alerts.push({ name: s.full_name, kind: "Passport", expiry: s.passport_expiry, daysLeft: pp });
    }
  }

  alerts.sort((a, b) => a.daysLeft - b.daysLeft);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-10">
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-stone-950">Notifications</h1>
        <p className="text-sm text-stone-500">
          Upcoming document expiries — Emirates ID within 1 month, Passport within 6 months.
        </p>
      </div>

      {alerts.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-500">
          No upcoming expiries. Nothing needs attention right now.
        </p>
      ) : (
        <ul className="space-y-2">
          {alerts.map((a, i) => {
            const expired = a.daysLeft < 0;
            return (
              <li
                key={i}
                className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
                  expired
                    ? "border-red-200 bg-red-50"
                    : a.daysLeft <= 30
                      ? "border-amber-200 bg-amber-50"
                      : "border-stone-200 bg-white"
                }`}
              >
                <div>
                  <p className="text-sm font-medium text-stone-900">{a.name}</p>
                  <p className="text-xs text-stone-500">
                    {a.kind} expires {formatDate(a.expiry)}
                  </p>
                </div>
                <span
                  className={`text-xs font-semibold ${
                    expired ? "text-red-700" : a.daysLeft <= 30 ? "text-amber-700" : "text-stone-600"
                  }`}
                >
                  {expired ? `Expired ${Math.abs(a.daysLeft)}d ago` : `${a.daysLeft}d left`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
