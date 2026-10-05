"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { ProfileDialog } from "@/components/staff-location-board";
import { usePrivacy } from "@/components/privacy-provider";
import { useDirectoryLookups } from "@/components/use-directory-lookups";
import { useHiring } from "@/components/use-hiring";
import { useLocationBoard, useLocations } from "@/components/use-locations";
import { useOutsourced } from "@/components/use-outsourced";
import { usePromotions } from "@/components/use-promotions";
import { useStaffDirectory } from "@/components/use-staff-directory";
import {
  chartVenues,
  positionsCombined,
  promotionsByVenue,
  staffSalaryByVenue,
  workforceByVenue,
  type PromotionPoint,
  type ShareSlice,
  type StaffSalaryPoint,
  type VenueShare,
} from "@/lib/insights";
import type { LookupDepartment } from "@/lib/directory-lookups";
import { salaryHidden } from "@/lib/privacy";
import { formatDate, formatSalary, type StaffEmployee } from "@/lib/staff";

export function HomeInsights() {
  const { employees } = useStaffDirectory();
  const { promotions } = usePromotions();
  const { people: outsourced } = useOutsourced();
  const { roles: hiring } = useHiring();
  const { locations } = useLocations();
  const { ids: boardIds } = useLocationBoard();
  const { lookups } = useDirectoryLookups();
  const { snapshot } = usePrivacy();
  const [profileEmployee, setProfileEmployee] = useState<StaffEmployee | null>(null);
  const [joiningYear, setJoiningYear] = useState<string | null>(null);
  const [staffGraph, setStaffGraph] = useState<"positions" | "promotions">("positions");
  const venues = chartVenues(locations, boardIds);
  const [salaryDepartment, setSalaryDepartment] = useDepartment(lookups.departments);
  const [promotionDepartment, setPromotionDepartment] = useDepartment(lookups.departments);
  const [positionDepartment, setPositionDepartment] = useDepartment(lookups.departments);
  const [workforceDepartment, setWorkforceDepartment] = useDepartment(lookups.departments);

  const salary = staffSalaryByVenue(employees, venues, lookups, salaryDepartment);
  const promotionPoints = promotionsByVenue(
    promotions,
    employees,
    venues,
    lookups,
    promotionDepartment,
  );
  const positions = positionsCombined(employees, lookups, positionDepartment);
  const workforce = workforceByVenue(
    employees,
    outsourced,
    hiring,
    venues,
    lookups,
    workforceDepartment,
  );
  const staffTotal = salary.reduce((sum, point) => sum + point.staff, 0);
  const salaryTotal = salary.reduce((sum, point) => sum + point.salary, 0);
  const promotionTotal = promotionPoints.reduce((sum, point) => sum + point.count, 0);
  const joiningYears = joiningYearsByStaff(employees);
  const joiningTotal = joiningYears.reduce((sum, point) => sum + point.count, 0);
  const positionTotal = positions.total;
  const workforceTotal = workforce.reduce((sum, share) => sum + share.total, 0);
  const celebrations = celebrationLists(employees);

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto bg-stone-100/70 p-3 lg:grid-cols-2 lg:grid-rows-3 lg:overflow-hidden">
      <InsightCard
        title="Staff and salary"
        figure={String(staffTotal)}
        figureLabel={`${compactNumber(salaryTotal)} current salary`}
        departmentId={salaryDepartment}
        departments={lookups.departments}
        onDepartment={setSalaryDepartment}
        headerContent={<StaffSalaryLegend />}
      >
        <StaffSalaryChart points={salary} />
      </InsightCard>
      <InsightCard
        title="Workforce"
        figure={String(workforceTotal)}
        figureLabel="people"
        departmentId={workforceDepartment}
        departments={lookups.departments}
        onDepartment={setWorkforceDepartment}
        headerContent={<WorkforceSummary shares={workforce} />}
      >
        <WorkforceChart shares={workforce} />
      </InsightCard>
      <InsightCard
        title={staffGraph === "positions" ? "Positions" : "Promotions"}
        figure={String(staffGraph === "positions" ? positionTotal : promotionTotal)}
        figureLabel={staffGraph === "positions" ? "staff" : promotionTotal === 1 ? "promotion" : "promotions"}
        departmentId={staffGraph === "positions" ? positionDepartment : promotionDepartment}
        departments={lookups.departments}
        onDepartment={staffGraph === "positions" ? setPositionDepartment : setPromotionDepartment}
        headerContent={<GraphPicker value={staffGraph} onChange={setStaffGraph} />}
      >
        {staffGraph === "positions" ? <PositionChart share={positions} hasVenues={venues.length > 0} /> : <PromotionRing points={promotionPoints} total={promotionTotal} />}
      </InsightCard>
      <InsightCard
        title="Joining years"
        figure={String(joiningTotal)}
        figureLabel="staff"
        departmentId=""
        departments={lookups.departments}
        onDepartment={() => undefined}
        hideDepartment
      >
        <JoiningYearsRing points={joiningYears} onSelect={setJoiningYear} expanded />
      </InsightCard>
      <CelebrationCard
        title="Work celebrations"
        emptyLabel="No work anniversaries in this window."
        celebrations={celebrations.work}
        onOpenProfile={setProfileEmployee}
      />
      <CelebrationCard
        title="Birthday celebrations"
        emptyLabel="No birthdays in this window."
        celebrations={celebrations.birthdays}
        onOpenProfile={setProfileEmployee}
      />
      {profileEmployee && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[80] flex items-center justify-center bg-stone-950/40 p-4"
              onClick={() => setProfileEmployee(null)}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="home-profile-title"
                className="flex max-h-[min(100%,40rem)] w-[min(100%,28rem)] flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white text-stone-950 shadow-xl"
                onClick={(event) => event.stopPropagation()}
              >
                <ProfileDialog
                  titleId="home-profile-title"
                  employee={profileEmployee}
                  person={null}
                  venue={profileEmployee.venue}
                  promotions={promotions
                    .filter((promotion) => promotion.staffId === profileEmployee.id)
                    .sort((left, right) => right.effectiveDate.localeCompare(left.effectiveDate))}
                  showPromotions={snapshot.showPromotions}
                  salaryIsHidden={(position) => salaryHidden(snapshot.hiddenSalaryPositions, position)}
                  onClose={() => setProfileEmployee(null)}
                />
              </div>
            </div>,
            document.body,
          )
        : null}
      {joiningYear && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[80] flex items-center justify-center bg-stone-950/40 p-4" onClick={() => setJoiningYear(null)}>
              <div role="dialog" aria-modal="true" aria-labelledby="joining-year-title" className="flex max-h-[min(100%,40rem)] w-[min(100%,34rem)] flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl" onClick={(event) => event.stopPropagation()}>
                <div className="flex items-start justify-between gap-4 border-b border-stone-200 px-5 py-4">
                  <div><h2 id="joining-year-title" className="text-base font-semibold">Joined in {joiningYear}</h2><p className="mt-1 text-sm text-stone-500">{employees.filter((employee) => !employee.archived && employee.joiningDate.startsWith(joiningYear)).length} employees</p></div>
                  <button type="button" aria-label="Close" className="flex size-8 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100" onClick={() => setJoiningYear(null)}>×</button>
                </div>
                <ul className="min-h-0 flex-1 divide-y divide-stone-100 overflow-y-auto px-2 py-2">
                  {employees.filter((employee) => !employee.archived && employee.joiningDate.startsWith(joiningYear)).sort((a,b) => a.fullName.localeCompare(b.fullName)).map((employee) => (
                    <li key={employee.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-stone-50">
                      <EmployeeAvatar employee={{name: employee.fullName, photo: employee.photo}} onOpen={() => { setJoiningYear(null); setProfileEmployee(employee); }} />
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-stone-950">{employee.fullName}</span><span className="block truncate text-xs text-stone-500">{employee.position || "Position not set"} · {employee.venue || "Venue not set"} · {formatDate(employee.joiningDate)}</span></span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function sectionSymbol(title: string) {
  return ({ "Staff and salary": "◔", Workforce: "◉", Positions: "◌", Promotions: "↗", "Joining years": "◎", "Work celebrations": "✦", "Birthday celebrations": "♢" } as Record<string, string>)[title] ?? "•";
}

type Celebration = {
  id: string;
  name: string;
  photo: string | null;
  position: string;
  occurrence: Date;
  detail: string;
  dayOffset: number;
  employee: StaffEmployee;
};

function CelebrationCard({
  title,
  emptyLabel,
  celebrations,
  onOpenProfile,
}: {
  title: string;
  emptyLabel: string;
  celebrations: Celebration[];
  onOpenProfile: (employee: StaffEmployee) => void;
}) {
  return (
    <section className="flex min-h-44 flex-col overflow-hidden rounded-[1.35rem] bg-white px-5 py-4 shadow-[0_1px_1px_rgba(28,25,23,0.04),0_18px_40px_-28px_rgba(28,25,23,0.45)] ring-1 ring-stone-900/6 lg:min-h-0">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-[13px] font-medium text-stone-500"><span className="text-base leading-none text-stone-700">{sectionSymbol(title)}</span>{title}</h2>
        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-600 tabular-nums">
          {celebrations.length}
        </span>
      </div>
      {celebrations.length === 0 ? (
        <p className="flex flex-1 items-center text-sm text-stone-400">{emptyLabel}</p>
      ) : (
        <ul className="mt-3 grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
          {celebrations.map((celebration) => (
            <li key={celebration.id} className="flex min-w-0 items-center gap-3 rounded-2xl bg-stone-50 px-3 py-2">
              <EmployeeAvatar employee={celebration} onOpen={() => onOpenProfile(celebration.employee)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-stone-900">{celebration.name}</span>
                <span className="block truncate text-[11px] text-stone-500">
                  {celebration.detail} · {formatCelebrationDate(celebration.occurrence)} · {relativeCelebrationDay(celebration.dayOffset)} · {celebration.position || "Position not set"}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EmployeeAvatar({
  employee,
  onOpen,
}: {
  employee: Pick<Celebration, "name" | "photo">;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`View profile for ${employee.name}`}
      className="flex size-10 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-stone-900 text-[11px] font-semibold text-white ring-1 ring-stone-900/10 transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-stone-500"
    >
      {employee.photo ? (
        // Staff photos can be imported data URLs or local object URLs, which are not supported by next/image.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={employee.photo} alt="" className="size-full object-cover" />
      ) : (
        employeeInitials(employee.name)
      )}
    </button>
  );
}

function celebrationLists(employees: StaffEmployee[]) {
  const today = atLocalMidnight(new Date());
  const start = new Date(today);
  const end = new Date(today);
  start.setMonth(start.getMonth() - 1);
  end.setMonth(end.getMonth() + 1);
  const active = employees.filter((employee) => !employee.archived && !employee.terminationDate);

  return {
    work: active
      .map((employee) => createCelebration(employee, employee.joiningDate, today, start, end, "work"))
      .filter((item): item is Celebration => item !== null)
      .sort(compareCelebrations),
    birthdays: active
      .map((employee) => createCelebration(employee, employee.dateOfBirth, today, start, end, "birthday"))
      .filter((item): item is Celebration => item !== null)
      .sort(compareCelebrations),
  };
}

function createCelebration(
  employee: StaffEmployee,
  sourceDate: string,
  today: Date,
  start: Date,
  end: Date,
  kind: "work" | "birthday",
): Celebration | null {
  const parsed = parseIsoDate(sourceDate);
  if (!parsed) {
    return null;
  }

  const occurrences = [today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1]
    .map((year) => annualOccurrence(year, parsed.month, parsed.day))
    .filter((date) => date >= start && date <= end)
    .sort((left, right) => Math.abs(dayDifference(left, today)) - Math.abs(dayDifference(right, today)));
  const occurrence = occurrences[0];
  if (!occurrence) {
    return null;
  }

  const years = occurrence.getFullYear() - parsed.year;
  if (kind === "work" && years < 1) {
    return null;
  }
  const detail = kind === "birthday"
    ? `Turns ${Math.max(0, years)}`
    : `${Math.max(0, years)} ${years === 1 ? "year" : "years"}`;

  return {
    id: `${kind}-${employee.id}`,
    name: employee.fullName || [employee.firstName, employee.lastName].filter(Boolean).join(" ") || "Unnamed employee",
    photo: employee.photo,
    position: employee.position,
    occurrence,
    detail,
    dayOffset: dayDifference(occurrence, today),
    employee,
  };
}

function parseIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  return { year, month, day };
}

function annualOccurrence(year: number, month: number, day: number) {
  const finalDay = Math.min(day, new Date(year, month, 0).getDate());
  return new Date(year, month - 1, finalDay);
}

function atLocalMidnight(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dayDifference(left: Date, right: Date) {
  return Math.round((left.getTime() - right.getTime()) / 86_400_000);
}

function compareCelebrations(left: Celebration, right: Celebration) {
  return left.dayOffset - right.dayOffset || left.name.localeCompare(right.name);
}

function formatCelebrationDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(date);
}

function relativeCelebrationDay(dayOffset: number) {
  if (dayOffset === 0) {
    return "Today";
  }
  if (dayOffset === 1) {
    return "Tomorrow";
  }
  if (dayOffset === -1) {
    return "Yesterday";
  }
  return dayOffset > 0 ? `In ${dayOffset} days` : `${Math.abs(dayOffset)} days ago`;
}

function employeeInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
}

function useDepartment(departments: LookupDepartment[]) {
  const [id, setId] = useState("");
  const value = departments.some((department) => department.id === id) ? id : "";
  return [value, setId] as const;
}

function GraphPicker({
  value,
  onChange,
}: {
  value: "positions" | "promotions";
  onChange: (value: "positions" | "promotions") => void;
}) {
  return (
    <label className="relative block">
      <span className="sr-only">Visible staff graph</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as "positions" | "promotions")}
        className="h-7 cursor-pointer appearance-none rounded-full border border-stone-200 bg-white pr-7 pl-3 text-[11px] font-medium text-stone-700 outline-none hover:bg-stone-50 focus:ring-1 focus:ring-stone-300"
      >
        <option value="positions">Positions</option>
        <option value="promotions">Promotions</option>
      </select>
      <ChevronIcon />
    </label>
  );
}

function InsightCard({
  title,
  figure,
  figureLabel,
  departmentId,
  departments,
  onDepartment,
  headerContent,
  hideDepartment = false,
  children,
}: {
  title: string;
  figure: string;
  figureLabel: string;
  departmentId: string;
  departments: LookupDepartment[];
  onDepartment: (departmentId: string) => void;
  headerContent?: React.ReactNode;
  hideDepartment?: boolean;
  children: React.ReactNode;
}) {
  const selectId = `${title.toLowerCase().replace(/\s+/g, "-")}-department`;

  return (
    <section className="relative flex min-h-80 flex-col overflow-hidden rounded-[1.35rem] bg-white shadow-[0_1px_1px_rgba(28,25,23,0.04),0_18px_40px_-28px_rgba(28,25,23,0.45)] ring-1 ring-stone-900/6 lg:min-h-0">
      <div className="flex items-start justify-between gap-3 px-5 pt-4 pr-40">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-[13px] font-medium text-stone-500"><span className="text-base leading-none text-stone-700">{sectionSymbol(title)}</span>{title}</h2>
          <div className="mt-1 flex min-w-0 items-center gap-4 whitespace-nowrap">
            <p className="flex shrink-0 items-baseline gap-2">
              <span className="text-[1.7rem] leading-none font-semibold tracking-tight text-stone-950 tabular-nums">
                {figure}
              </span>
              <span className="text-xs text-stone-400">{figureLabel}</span>
            </p>
          </div>
        </div>
      </div>
      <div className="absolute top-3.5 right-3.5 z-10 flex items-center gap-2">
        {headerContent}
        {!hideDepartment ? (
          <label htmlFor={selectId}>
            <span className="sr-only">Department for {title}</span>
            <span className="relative block">
              <select
                id={selectId}
                value={departmentId}
                onChange={(event) => onDepartment(event.target.value)}
                className="h-7 max-w-36 cursor-pointer appearance-none truncate rounded-full bg-stone-100/80 pr-6 pl-2.5 text-[11px] text-stone-500 outline-none hover:bg-stone-100 hover:text-stone-800 focus:bg-white focus:text-stone-900 focus:ring-1 focus:ring-stone-300"
              >
                <option value="">All departments</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
              <ChevronIcon />
            </span>
          </label>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col px-4 pt-2 pb-4">{children}</div>
    </section>
  );
}

function StaffSalaryChart({ points }: { points: StaffSalaryPoint[] }) {
  const [hover, setHover] = useState<{ index: number; x: number; y: number } | null>(null);
  if (points.length === 0) {
    return <EmptyChart label="Add a venue to see staff and salary." />;
  }

  const width = 640;
  const height = 190;
  const pad = { top: 12, right: 36, bottom: 24, left: 46 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const salaryMax = axisMax(Math.max(...points.map((point) => point.salary)));
  const staffAxis = countAxis(Math.max(...points.map((point) => point.staff)));
  const slot = plotWidth / points.length;
  const barWidth = Math.min(28, slot * 0.34);
  const salaryTicks = ticks(salaryMax);
  const paid = points.filter((point) => point.staff > 0);
  const average = paid.length
    ? paid.reduce((sum, point) => sum + point.salary, 0) / paid.length
    : 0;
  const averageY = yFor(Math.min(average, salaryMax), salaryMax, plotHeight, pad.top);
  const line = points.map((point, index) => ({
    x: pad.left + slot * index + slot / 2,
    y: yFor(point.staff, staffAxis.max, plotHeight, pad.top),
  }));
  const curve = smoothPath(line);
  const area = `${curve} L ${line[line.length - 1].x} ${pad.top + plotHeight} L ${line[0].x} ${pad.top + plotHeight} Z`;
  const current = hover == null ? null : points[hover.index];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="relative min-h-0 flex-1">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-full w-full"
          role="img"
          aria-label={points
            .map((point) => `${point.venue.label}: ${point.staff} staff, salary ${formatSalary(point.salary)}`)
            .join(". ")}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id="staff-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ea580c" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#ea580c" stopOpacity="0" />
            </linearGradient>
            {points.map((point) => (
              <linearGradient key={point.venue.id} id={`salary-${point.venue.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={point.venue.color} />
                <stop offset="100%" stopColor={point.venue.color} stopOpacity="0.45" />
              </linearGradient>
            ))}
          </defs>
          {salaryTicks.map((tick) => {
            const y = yFor(tick, salaryMax, plotHeight, pad.top);
            return (
              <g key={tick}>
                <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="#f5f5f4" strokeWidth="1" />
                <text x={pad.left - 8} y={y + 3} textAnchor="end" fill="#a8a29e" fontSize="10">
                  {compactNumber(tick)}
                </text>
              </g>
            );
          })}
          {staffAxis.ticks.map((tick) => (
            <text
              key={`staff-${tick}`}
              x={width - pad.right + 8}
              y={yFor(tick, staffAxis.max, plotHeight, pad.top) + 3}
              textAnchor="start"
              fill="#c2410c"
              fontSize="10"
            >
              {formatCount(tick)}
            </text>
          ))}
          {average > 0 ? (
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={averageY}
              y2={averageY}
              stroke="#a8a29e"
              strokeDasharray="3 4"
              strokeWidth="1"
            />
          ) : null}
          <path d={area} fill="url(#staff-area)" />
          {points.map((point, index) => {
            const x = pad.left + slot * index + slot / 2;
            const barHeight = (point.salary / salaryMax) * plotHeight;
            const y = pad.top + plotHeight - barHeight;
            const dim = hover != null && hover.index !== index;
            return (
              <path
                key={point.venue.id}
                d={roundedBar(x - barWidth / 2, y, barWidth, barHeight, 7)}
                fill={`url(#salary-${point.venue.id})`}
                opacity={dim ? 0.28 : 1}
              />
            );
          })}
          <path d={curve} fill="none" stroke="#ea580c" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
          {line.map((point, index) => (
            <circle
              key={points[index].venue.id}
              cx={point.x}
              cy={point.y}
              r={hover?.index === index ? 5.5 : 4}
              fill="#fff"
              stroke="#ea580c"
              strokeWidth="2"
            />
          ))}
          {points.map((point, index) => {
            const x = pad.left + slot * index + slot / 2;
            return (
              <g key={`${point.venue.id}-label`}>
                <text x={x} y={height - 8} textAnchor="middle" fill="#44403c" fontSize="11" fontWeight="600">
                  {point.venue.label}
                </text>
                <rect
                  x={pad.left + slot * index}
                  y={pad.top}
                  width={slot}
                  height={plotHeight}
                  fill="transparent"
                  onMouseMove={(event) => setHover({ index, x: event.clientX, y: event.clientY })}
                />
              </g>
            );
          })}
        </svg>
      </div>
      {current && hover ? (
        <PointerCard x={hover.x} y={hover.y} title={current.venue.name} accent={current.venue.color}>
          <TipLine label="Staff" value={String(current.staff)} />
          <TipLine label="Salary" value={formatSalary(current.salary) || "0.00"} />
          <TipLine
            label="Average"
            value={current.staff > 0 ? formatSalary(current.salary / current.staff) : "—"}
          />
        </PointerCard>
      ) : null}
    </div>
  );
}

function StaffSalaryLegend() {
  return (
    <div className="flex min-w-0 items-center gap-3 text-[10px] text-stone-400">
      <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-[3px] bg-stone-800" />Salary</span>
      <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-3 rounded-full bg-orange-500/80" />Staff</span>
      <span className="inline-flex items-center gap-1.5"><span className="w-3 border-t border-dashed border-stone-400" />Average salary</span>
    </div>
  );
}

function WorkforceChart({ shares }: { shares: VenueShare[] }) {
  const [hover, setHover] = useState<{
    share: VenueShare;
    slice: ShareSlice;
    x: number;
    y: number;
  } | null>(null);

  if (shares.length === 0) {
    return <EmptyChart label="Add a venue to see this mix." />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col" onMouseLeave={() => setHover(null)}>
      <div className="flex min-h-0 flex-1 flex-col justify-evenly overflow-y-auto">
        {shares.map((share) => (
          <WorkforceRow key={share.venue.id} share={share} onHover={setHover} />
        ))}
      </div>
      {hover ? (
        <PointerCard x={hover.x} y={hover.y} title={hover.share.venue.name} accent={hover.slice.color}>
          <TipLine label={hover.slice.label} value={String(hover.slice.value)} />
        </PointerCard>
      ) : null}
    </div>
  );
}

function WorkforceRow({
  share,
  onHover,
}: {
  share: VenueShare;
  onHover: (hover: { share: VenueShare; slice: ShareSlice; x: number; y: number }) => void;
}) {
  const percents = percentShares(share.slices, share.total);

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(7rem,0.8fr)_minmax(5rem,1.6fr)_2rem] items-center gap-3 border-b border-stone-100 py-0.5 last:border-b-0">
      <p className="min-w-0 truncate text-[11px] font-medium text-stone-950">
        {share.venue.label}
        <span className="ml-1.5 font-normal text-stone-400">{share.venue.name}</span>
      </p>
      <span className="flex h-2 min-w-0 overflow-hidden rounded-full bg-stone-100" aria-label={share.slices.map((slice) => `${slice.label} ${slice.value}`).join(", ")}>
        {share.slices.map((slice, index) => (
          <span
            key={slice.key}
            className="cursor-help transition-[filter] hover:brightness-125"
            style={{ width: `${percents[index]}%`, backgroundColor: slice.color }}
            onMouseMove={(event) => onHover({ share, slice, x: event.clientX, y: event.clientY })}
          />
        ))}
      </span>
      <span className="text-right text-xs font-semibold text-stone-800 tabular-nums">{share.total}</span>
    </div>
  );
}

function WorkforceSummary({ shares }: { shares: VenueShare[] }) {
  const categories = [
    { key: "inhouse", label: "In-house", color: "#1c1917" },
    { key: "outsourced", label: "Outsourced", color: "#c2410c" },
    { key: "hiring", label: "Hiring", color: "#eab308" },
  ].map((category) => ({
    ...category,
    value: shares.reduce((sum, share) => sum + (share.slices.find((slice) => slice.key === category.key)?.value ?? 0), 0),
  }));

  return (
    <div className="flex min-w-0 items-center gap-3 text-[10px] text-stone-500">
      {categories.map((category) => (
        <span key={category.key} className="inline-flex items-center gap-1 whitespace-nowrap">
          <span className="size-1.5 rounded-full" style={{ backgroundColor: category.color }} />
          {category.label} <strong className="font-semibold text-stone-900 tabular-nums">{category.value}</strong>
        </span>
      ))}
    </div>
  );
}

function PositionChart({ share, hasVenues }: { share: VenueShare; hasVenues: boolean }) {
  const slices = share.slices;
  const total = share.total;
  const percents = percentShares(slices, total);

  if (!hasVenues) {
    return <EmptyChart label="Add a venue to see positions." />;
  }

  return (
    <div className="flex h-full min-h-0 items-center gap-4 overflow-hidden sm:gap-6">
      <Ring
        slices={slices}
        total={total}
        venue="All venues"
        className="aspect-square h-full max-h-full min-h-0 w-auto max-w-[46%]"
        strokeWidth={24}
      />
      {slices.length === 0 ? (
        <p className="min-w-0 flex-1 text-sm text-stone-400">No staff in this view yet.</p>
      ) : (
        <div className="h-full min-h-0 min-w-0 flex-1 overflow-y-auto pr-1">
          <ul className="flex min-h-full flex-col justify-center gap-1.5">
          {slices.map((slice, index) => (
            <li key={slice.key} className="flex min-w-0 items-center gap-2.5">
              <span className="flex min-w-0 max-w-[42%] items-center gap-2">
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: slice.color }} />
                <span className="truncate text-[13px] font-medium text-stone-800">{slice.label}</span>
              </span>
              <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-stone-100">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${percents[index]}%`, backgroundColor: slice.color }}
                />
              </span>
              <span className="shrink-0 text-xs text-stone-500 tabular-nums">
                {slice.value}
                <span className="ml-1.5 text-stone-400">{percents[index]}%</span>
              </span>
            </li>
          ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function PromotionRing({ points, total, compact = false }: { points: PromotionPoint[]; total: number; compact?: boolean }) {
  if (points.length === 0) {
    return <EmptyChart label="Add a venue to see promotions." />;
  }

  const slices = points
    .filter((point) => point.count > 0)
    .map((point) => ({
      key: point.venue.id,
      label: point.venue.label,
      value: point.count,
      color: point.venue.color,
      detail: point.venue.name,
    }));

  return (
    <div className={`flex h-full min-h-0 items-center ${compact ? "gap-2" : "gap-5"}`}>
      <Ring slices={slices} total={total} venue="Promotions" className={`${compact ? "size-24" : "size-36"} shrink-0`} />
      <ul className={`min-w-0 flex-1 ${compact ? "space-y-1" : "space-y-2"}`}>
        {points.map((point) => {
          const width = total > 0 ? (point.count / total) * 100 : 0;
          return (
            <li key={point.venue.id} className="grid grid-cols-[2.25rem_minmax(0,1fr)_1.5rem] items-center gap-2">
              <span className="text-xs font-medium text-stone-800">{point.venue.label}</span>
              <span className="h-1.5 overflow-hidden rounded-full bg-stone-100">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${width}%`, backgroundColor: point.venue.color }}
                />
              </span>
              <span className="text-right text-xs text-stone-500 tabular-nums">{point.count}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function JoiningYearsRing({ points, onSelect, expanded = false }: { points: { year: string; count: number }[]; onSelect: (year: string) => void; expanded?: boolean }) {
  const total = points.reduce((sum, point) => sum + point.count, 0);
  const slices = points.map((point, index) => ({ key: point.year, label: point.year, value: point.count, color: ["#1c1917", "#a8a29e", "#c2410c", "#0f3026", "#a91d2a"][index % 5], detail: "Joining year" }));
  return (
    <div className={`flex h-full min-h-0 items-center overflow-hidden ${expanded ? "justify-center gap-10 px-6" : "gap-2"}`}>
      <Ring
        slices={slices}
        total={total}
        venue="Joining years"
        className={`${expanded ? "size-48" : "size-24"} shrink-0`}
      />
      <div className={`flex h-full min-h-0 min-w-0 flex-col overflow-hidden ${expanded ? "w-40 flex-none justify-center py-2" : "flex-1"}`}>
        <p className={`mb-1 shrink-0 text-xs font-medium text-stone-700 ${expanded ? "text-center" : ""}`}>Joining years</p>
        <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-scroll pr-1 [scrollbar-gutter:stable]">
          {points.map((point) => (
            <li key={point.year}>
              <button
                type="button"
                onClick={() => onSelect(point.year)}
                className={`grid w-full grid-cols-[3.5rem_2.5rem] justify-center gap-2 rounded px-1 py-0.5 text-stone-600 hover:bg-stone-100 hover:text-stone-950 ${expanded ? "text-xs" : "text-[11px]"}`}
              >
                <span className="text-right">{point.year}</span>
                <b className="text-left">{point.count}</b>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function joiningYearsByStaff(employees: StaffEmployee[]) { const counts = new Map<string, number>(); for (const employee of employees) { if (employee.archived || !employee.joiningDate) continue; const year = employee.joiningDate.slice(0,4); if (/^\d{4}$/.test(year)) counts.set(year, (counts.get(year) ?? 0) + 1); } return [...counts].map(([year,count])=>({year,count})).sort((a,b)=>b.year.localeCompare(a.year)); }

function Ring({
  slices,
  total,
  venue,
  className,
  compact = false,
  strokeWidth = 13,
}: {
  slices: Array<ShareSlice & { detail?: string }>;
  total: number;
  venue: string;
  className?: string;
  compact?: boolean;
  strokeWidth?: number;
}) {
  const [hover, setHover] = useState<{ index: number; x: number; y: number } | null>(null);
  const radius = Math.min(34, 46 - strokeWidth / 2);
  const gap = slices.length > 1 ? 0.05 : 0;
  const activeWidth = strokeWidth + 3;
  let angle = -Math.PI / 2;
  const active = hover == null ? null : slices[hover.index];
  const percents = percentShares(slices, total);

  return (
    <>
      <svg
        viewBox="0 0 100 100"
        className={className}
        role="img"
        aria-label={donutLabel(venue, slices, total)}
        onMouseLeave={() => setHover(null)}
      >
        {total === 0 || slices.length === 0 ? (
          <circle cx="50" cy="50" r={radius} fill="none" stroke="#e7e5e4" strokeWidth={strokeWidth} />
        ) : slices.length === 1 ? (
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={slices[0].color}
            strokeWidth={hover?.index === 0 ? activeWidth : strokeWidth}
            onMouseMove={(event) => setHover({ index: 0, x: event.clientX, y: event.clientY })}
          />
        ) : (
          slices.map((slice, index) => {
            const sweep = (slice.value / total) * Math.PI * 2;
            const start = angle + gap / 2;
            const end = angle + sweep - gap / 2;
            angle += sweep;
            return (
              <path
                key={slice.key}
                d={arc(50, 50, radius, start, Math.max(end, start + 0.02))}
                fill="none"
                stroke={slice.color}
                strokeWidth={hover?.index === index ? activeWidth : strokeWidth}
                strokeLinecap="butt"
                opacity={hover != null && hover.index !== index ? 0.35 : 1}
                onMouseMove={(event) => setHover({ index, x: event.clientX, y: event.clientY })}
              />
            );
          })
        )}
        <text
          x="50"
          y={compact ? 54 : 54}
          textAnchor="middle"
          fill="#1c1917"
          fontSize={compact ? 14 : 16}
          fontWeight="650"
        >
          {total}
        </text>
      </svg>
      {active && hover ? (
        <PointerCard x={hover.x} y={hover.y} title={active.label} accent={active.color}>
          <TipLine label={venue} value={`${active.value} · ${percents[hover.index]}%`} />
          {active.detail ? <p className="mt-1 text-[11px] text-stone-400">{active.detail}</p> : null}
        </PointerCard>
      ) : null}
    </>
  );
}

function PointerCard({
  x,
  y,
  title,
  accent,
  children,
}: {
  x: number;
  y: number;
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  const width = 224;
  const height = 96;
  const pad = 14;
  const left = x + pad + width > window.innerWidth ? x - width - pad : x + pad;
  const top = y + pad + height > window.innerHeight ? Math.max(8, y - height - pad) : y + pad;

  return (
    <div
      className="pointer-events-none fixed z-50 w-56 rounded-2xl bg-stone-950 px-3 py-2.5 text-white shadow-[0_16px_40px_-18px_rgba(0,0,0,0.7)]"
      style={{ left, top }}
    >
      <p className="flex items-start gap-1.5 text-[13px] leading-snug font-medium">
        <span className="mt-1.5 size-1.5 shrink-0 rounded-full" style={{ backgroundColor: accent }} />
        <span>{title}</span>
      </p>
      <div className="mt-1.5 space-y-0.5">{children}</div>
    </div>
  );
}

function TipLine({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex items-baseline justify-between gap-3 text-[11px] text-stone-400">
      <span className="truncate">{label}</span>
      <span className="shrink-0 text-stone-100 tabular-nums">{value}</span>
    </p>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <p className="grid flex-1 place-items-center px-2 text-center text-sm text-stone-400">{label}</p>
  );
}

function ChevronIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="pointer-events-none absolute top-1/2 right-1.5 size-3 -translate-y-1/2 text-stone-400"
    >
      <path
        d="M4 6.5 8 10.5 12 6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function roundedBar(x: number, y: number, width: number, height: number, radius: number) {
  if (height <= 0) {
    return "";
  }

  const r = Math.min(radius, width / 2, height);
  return `M ${x} ${y + height} H ${x + width} V ${y + r} Q ${x + width} ${y} ${x + width - r} ${y} H ${x + r} Q ${x} ${y} ${x} ${y + r} Z`;
}

function smoothPath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) {
    return "";
  }

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[index - 1] ?? points[index];
    const current = points[index];
    const next = points[index + 1];
    const after = points[index + 2] ?? next;
    const control1 = {
      x: current.x + (next.x - previous.x) / 6,
      y: current.y + (next.y - previous.y) / 6,
    };
    const control2 = {
      x: next.x - (after.x - current.x) / 6,
      y: next.y - (after.y - current.y) / 6,
    };
    path += ` C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${next.x} ${next.y}`;
  }

  return path;
}

function arc(cx: number, cy: number, radius: number, start: number, end: number) {
  const startPoint = [cx + radius * Math.cos(start), cy + radius * Math.sin(start)];
  const endPoint = [cx + radius * Math.cos(end), cy + radius * Math.sin(end)];
  const large = end - start > Math.PI ? 1 : 0;
  return `M ${startPoint[0]} ${startPoint[1]} A ${radius} ${radius} 0 ${large} 1 ${endPoint[0]} ${endPoint[1]}`;
}

function yFor(value: number, max: number, plotHeight: number, top: number) {
  if (max <= 0) {
    return top + plotHeight;
  }

  return top + plotHeight - (value / max) * plotHeight;
}

function ticks(max: number, steps = 4) {
  return Array.from({ length: steps + 1 }, (_, index) => (max / steps) * index);
}

function axisMax(value: number) {
  if (value <= 0) {
    return 1;
  }

  const exponent = 10 ** Math.floor(Math.log10(value));
  const normalized = value / exponent;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * exponent;
}

function countAxis(value: number) {
  const peak = Math.max(0, Math.ceil(value));
  if (peak <= 4) {
    return { max: 4, ticks: [0, 1, 2, 3, 4] };
  }

  const bases = [1, 2, 4, 5, 10, 15, 20, 25, 50];
  let magnitude = 1;
  while (bases[bases.length - 1] * magnitude * 4 < peak) {
    magnitude *= 10;
  }

  const step = bases.map((base) => base * magnitude).find((candidate) => candidate * 4 >= peak) ?? peak;
  return {
    max: step * 4,
    ticks: [0, step, step * 2, step * 3, step * 4],
  };
}

function formatCount(value: number) {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}

function compactNumber(value: number) {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) {
    return `${trim(value / 1_000_000)}m`;
  }

  if (absolute >= 1_000) {
    return `${trim(value / 1_000)}k`;
  }

  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function trim(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function percentShares(slices: Array<{ value: number }>, total: number) {
  if (total <= 0 || slices.length === 0) {
    return slices.map(() => 0);
  }

  const raw = slices.map((slice) => (slice.value / total) * 100);
  const floors = raw.map((value) => Math.floor(value));
  let leftover = 100 - floors.reduce((sum, value) => sum + value, 0);
  const order = raw
    .map((value, index) => ({ index, fraction: value - floors[index] }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  const shares = [...floors];
  for (const item of order) {
    if (leftover <= 0) {
      break;
    }

    shares[item.index] += 1;
    leftover -= 1;
  }

  return shares;
}

function donutLabel(venue: string, slices: ShareSlice[], total: number) {
  if (total === 0 || slices.length === 0) {
    return `${venue}: none`;
  }

  return `${venue}. ${slices.map((slice) => `${slice.label} ${slice.value}`).join(", ")}`;
}
