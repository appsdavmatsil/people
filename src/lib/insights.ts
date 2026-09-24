import { sameName, type DirectoryLookups } from "@/lib/directory-lookups";
import type { HiringRole } from "@/lib/hiring";
import { sameLocationName, type LocationReference } from "@/lib/locations";
import type { OutsourcedPerson } from "@/lib/outsourced";
import type { StaffPromotion } from "@/lib/promotions";
import { roundMoney, type StaffEmployee } from "@/lib/staff";

export type ChartVenue = {
  id: string;
  label: string;
  name: string;
  color: string;
};

export type StaffSalaryPoint = {
  venue: ChartVenue;
  staff: number;
  salary: number;
};

export type PromotionPoint = {
  venue: ChartVenue;
  count: number;
};

export type ShareSlice = {
  key: string;
  label: string;
  value: number;
  color: string;
};

export type VenueShare = {
  venue: ChartVenue;
  total: number;
  slices: ShareSlice[];
};

const otherVenue: ChartVenue = {
  id: "other",
  label: "Other",
  name: "Other",
  color: "#a8a29e",
};

const positionColors = [
  "#1c1917",
  "#c2410c",
  "#0f766e",
  "#1d4ed8",
  "#7c3aed",
  "#be123c",
  "#a16207",
  "#0369a1",
  "#4d7c0f",
  "#9f1239",
  "#57534e",
  "#0e7490",
];

export const workforceColors = {
  inhouse: "#1c1917",
  outsourced: "#c2410c",
  hiring: "#a8a29e",
} as const;

const maxPositionSlices = 8;

export function chartVenues(locations: LocationReference[], boardIds: string[] | null) {
  return orderLocations(locations, boardIds).map((location) => ({
    id: location.id,
    label: location.nickname,
    name: location.venueName,
    color: location.color || "#44403c",
  }));
}

export function staffSalaryByVenue(
  employees: StaffEmployee[],
  venues: ChartVenue[],
  lookups: DirectoryLookups,
  departmentId: string,
): StaffSalaryPoint[] {
  const rows = venues.map((venue) => ({ venue, staff: 0, salary: 0 }));
  const index = new Map(rows.map((row, position) => [row.venue.id, position]));
  const other = { venue: otherVenue, staff: 0, salary: 0 };

  for (const employee of employees) {
    if (!matchesDepartment(positionDepartmentId(employee.position, lookups), departmentId)) {
      continue;
    }

    const row = rowFor(employee.venue, venues, index, rows, other);
    row.staff += 1;
    row.salary += employee.salary ?? 0;
  }

  return finish(rows, other, other.staff > 0).map((row) => ({
    ...row,
    salary: roundMoney(row.salary),
  }));
}

export function promotionsByVenue(
  promotions: StaffPromotion[],
  employees: StaffEmployee[],
  venues: ChartVenue[],
  lookups: DirectoryLookups,
  departmentId: string,
): PromotionPoint[] {
  const rows = venues.map((venue) => ({ venue, count: 0 }));
  const index = new Map(rows.map((row, position) => [row.venue.id, position]));
  const other = { venue: otherVenue, count: 0 };
  const byId = new Map(employees.map((employee) => [employee.id, employee]));

  for (const promotion of promotions) {
    const employee = (promotion.staffId && byId.get(promotion.staffId)) || null;
    const positionName = promotion.newPosition || employee?.position || "";
    if (!matchesDepartment(positionDepartmentId(positionName, lookups), departmentId)) {
      continue;
    }

    const venueName = employee?.venue ?? "";
    if (!venueName) {
      continue;
    }

    rowFor(venueName, venues, index, rows, other).count += 1;
  }

  return finish(rows, other, other.count > 0);
}

export function positionsByVenue(
  employees: StaffEmployee[],
  venues: ChartVenue[],
  lookups: DirectoryLookups,
  departmentId: string,
): VenueShare[] {
  const counts = new Map<string, Map<string, number>>();
  for (const venue of venues) {
    counts.set(venue.id, new Map());
  }

  const otherCounts = new Map<string, number>();
  let otherUsed = false;

  for (const employee of employees) {
    if (!matchesDepartment(positionDepartmentId(employee.position, lookups), departmentId)) {
      continue;
    }

    const venue = findVenue(employee.venue, venues);
    const bucket = venue ? counts.get(venue.id)! : otherCounts;
    if (!venue) {
      otherUsed = true;
    }

    const label = employee.position.trim() || "Unassigned";
    bucket.set(label, (bucket.get(label) ?? 0) + 1);
  }

  const totals = new Map<string, number>();
  for (const bucket of counts.values()) {
    addTotals(totals, bucket);
  }
  addTotals(totals, otherCounts);

  const colorFor = new Map(
    [...totals.keys()]
      .sort((left, right) => (totals.get(right) ?? 0) - (totals.get(left) ?? 0) || left.localeCompare(right))
      .map((label, index) => [label, positionColors[index % positionColors.length]]),
  );

  const shares = venues.map((venue) => shareFor(venue, counts.get(venue.id) ?? new Map(), colorFor));
  if (otherUsed) {
    shares.push(shareFor(otherVenue, otherCounts, colorFor));
  }

  return shares;
}

export function workforceByVenue(
  employees: StaffEmployee[],
  outsourced: OutsourcedPerson[],
  hiring: HiringRole[],
  venues: ChartVenue[],
  lookups: DirectoryLookups,
  departmentId: string,
): VenueShare[] {
  const rows = new Map<string, { inhouse: number; outsourced: number; hiring: number }>();
  for (const venue of venues) {
    rows.set(venue.id, { inhouse: 0, outsourced: 0, hiring: 0 });
  }

  const other = { inhouse: 0, outsourced: 0, hiring: 0 };
  let otherUsed = false;
  const department = lookups.departments.find((item) => item.id === departmentId)?.name ?? "";

  for (const employee of employees) {
    if (!matchesDepartment(positionDepartmentId(employee.position, lookups), departmentId)) {
      continue;
    }

    const target = bucketFor(employee.venue, venues, rows, other);
    if (target === other) {
      otherUsed = true;
    }
    target.inhouse += 1;
  }

  for (const person of outsourced) {
    if (!matchesDepartment(positionDepartmentId(person.position, lookups), departmentId)) {
      continue;
    }

    const target = bucketFor(person.venue, venues, rows, other);
    if (target === other) {
      otherUsed = true;
    }
    target.outsourced += 1;
  }

  for (const role of hiring) {
    if (role.status === "filled" || role.openings <= 0) {
      continue;
    }

    if (departmentId && !sameName(role.department, department)) {
      continue;
    }

    const target = bucketFor(role.venue, venues, rows, other);
    if (target === other) {
      otherUsed = true;
    }
    target.hiring += role.openings;
  }

  const shares = venues.map((venue) => workforceShare(venue, rows.get(venue.id)!));
  if (otherUsed) {
    shares.push(workforceShare(otherVenue, other));
  }

  return shares;
}

function workforceShare(
  venue: ChartVenue,
  counts: { inhouse: number; outsourced: number; hiring: number },
): VenueShare {
  const slices: ShareSlice[] = [
    { key: "inhouse", label: "In-house", value: counts.inhouse, color: workforceColors.inhouse },
    { key: "outsourced", label: "Outsourced", value: counts.outsourced, color: workforceColors.outsourced },
    { key: "hiring", label: "Hiring", value: counts.hiring, color: workforceColors.hiring },
  ].filter((slice) => slice.value > 0);

  return {
    venue,
    total: counts.inhouse + counts.outsourced + counts.hiring,
    slices,
  };
}

function shareFor(venue: ChartVenue, counts: Map<string, number>, colorFor: Map<string, string>): VenueShare {
  const ranked = [...counts.entries()].sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
  );
  const visible = ranked.slice(0, maxPositionSlices);
  const hidden = ranked.slice(maxPositionSlices);
  const slices: ShareSlice[] = visible.map(([label, value]) => ({
    key: label,
    label,
    value,
    color: colorFor.get(label) ?? positionColors[0],
  }));

  const hiddenTotal = hidden.reduce((sum, [, value]) => sum + value, 0);
  if (hiddenTotal > 0) {
    slices.push({
      key: `${venue.id}-other`,
      label: "Other",
      value: hiddenTotal,
      color: "#d6d3d1",
    });
  }

  return {
    venue,
    total: ranked.reduce((sum, [, value]) => sum + value, 0),
    slices,
  };
}

function addTotals(totals: Map<string, number>, bucket: Map<string, number>) {
  for (const [label, value] of bucket) {
    totals.set(label, (totals.get(label) ?? 0) + value);
  }
}

function bucketFor<T>(
  venueName: string,
  venues: ChartVenue[],
  rows: Map<string, T>,
  other: T,
) {
  const venue = findVenue(venueName, venues);
  return venue ? rows.get(venue.id)! : other;
}

function rowFor<T extends { venue: ChartVenue }>(
  venueName: string,
  venues: ChartVenue[],
  index: Map<string, number>,
  rows: T[],
  other: T,
) {
  const venue = findVenue(venueName, venues);
  if (!venue) {
    return other;
  }

  return rows[index.get(venue.id)!];
}

function finish<T>(rows: T[], other: T, includeOther: boolean) {
  return includeOther ? [...rows, other] : rows;
}

function findVenue(venueName: string, venues: ChartVenue[]) {
  const cleaned = venueName.trim();
  if (!cleaned) {
    return null;
  }

  return (
    venues.find(
      (venue) => sameLocationName(venue.name, cleaned) || sameLocationName(venue.label, cleaned),
    ) ?? null
  );
}

function positionDepartmentId(positionName: string, lookups: DirectoryLookups) {
  const match = lookups.positions.find((position) => sameName(position.name, positionName));
  return match?.departmentId ?? null;
}

function matchesDepartment(departmentId: string | null, filter: string) {
  if (!filter) {
    return true;
  }

  return departmentId === filter;
}

function orderLocations(locations: LocationReference[], boardIds: string[] | null) {
  if (!boardIds?.length) {
    return locations;
  }

  const byId = new Map(locations.map((location) => [location.id, location]));
  const ordered: LocationReference[] = [];
  for (const id of boardIds) {
    const location = byId.get(id);
    if (location) {
      ordered.push(location);
    }
  }

  for (const location of locations) {
    if (!ordered.some((item) => item.id === location.id)) {
      ordered.push(location);
    }
  }

  return ordered;
}
