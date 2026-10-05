// Fixed to UAE time so server and browser render the same value.
const submittedAtFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Dubai",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Submission timestamp as "05/10/2026, 14:32" (UAE time). */
export function formatSubmittedAt(iso: string): string {
  return submittedAtFormat.format(new Date(iso));
}
