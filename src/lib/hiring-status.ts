export const HIRING_STATUSES = ["new", "not_selected", "need_interview", "interviewed", "stand_by", "selected"] as const;
export type HiringStatus = (typeof HIRING_STATUSES)[number];

export const HIRING_STATUS_LABEL: Record<HiringStatus, string> = {
  new: "Pending",
  not_selected: "Not selected",
  stand_by: "Stand By",
  need_interview: "Need to interview",
  interviewed: "Already Interviewed",
  selected: "Selected",
};

export const HIRING_STATUS_STYLE: Record<HiringStatus, string> = {
  new: "bg-blue-50 text-blue-700 border-blue-200",
  not_selected: "bg-red-50 text-red-700 border-red-200",
  stand_by: "bg-amber-50 text-amber-700 border-amber-200",
  need_interview: "bg-pink-50 text-pink-700 border-pink-200",
  interviewed: "bg-purple-50 text-purple-700 border-purple-200",
  selected: "bg-green-50 text-green-700 border-green-200",
};

/** Solid colours for a selected status filter pill. */
export const HIRING_STATUS_ACTIVE_STYLE: Record<HiringStatus, string> = {
  new: "bg-blue-600 text-white border-blue-600",
  not_selected: "bg-red-600 text-white border-red-600",
  stand_by: "bg-amber-500 text-white border-amber-500",
  need_interview: "bg-pink-600 text-white border-pink-600",
  interviewed: "bg-purple-600 text-white border-purple-600",
  selected: "bg-green-600 text-white border-green-600",
};

/** Row colours for the status context menu. */
export const HIRING_STATUS_MENU_STYLE: Record<HiringStatus, { row: string; dot: string }> = {
  new: { row: "bg-blue-50 text-blue-800 hover:bg-blue-100 focus-visible:bg-blue-100", dot: "bg-blue-500" },
  not_selected: { row: "bg-red-50 text-red-800 hover:bg-red-100 focus-visible:bg-red-100", dot: "bg-red-500" },
  stand_by: { row: "bg-amber-50 text-amber-800 hover:bg-amber-100 focus-visible:bg-amber-100", dot: "bg-amber-500" },
  need_interview: { row: "bg-pink-50 text-pink-800 hover:bg-pink-100 focus-visible:bg-pink-100", dot: "bg-pink-500" },
  interviewed: { row: "bg-purple-50 text-purple-800 hover:bg-purple-100 focus-visible:bg-purple-100", dot: "bg-purple-500" },
  selected: { row: "bg-green-50 text-green-800 hover:bg-green-100 focus-visible:bg-green-100", dot: "bg-green-500" },
};

const LEGACY: Record<string, HiringStatus> = {
  reviewed: "stand_by",
  shortlisted: "need_interview",
  hired: "selected",
};

/** Maps any stored value (including the old maine-forms vocabulary) to a current status. */
export function normalizeHiringStatus(value: string | null | undefined): HiringStatus {
  if (value && (HIRING_STATUSES as readonly string[]).includes(value)) return value as HiringStatus;
  return (value && LEGACY[value]) || "new";
}
