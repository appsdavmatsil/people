"use client";

import { useState } from "react";
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
import { formatSalary } from "@/lib/staff";

export function HomeInsights() {
  const { employees } = useStaffDirectory();
  const { promotions } = usePromotions();
  const { people: outsourced } = useOutsourced();
  const { roles: hiring } = useHiring();
  const { locations } = useLocations();
  const { ids: boardIds } = useLocationBoard();
  const { lookups } = useDirectoryLookups();
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
  const positionTotal = positions.total;
  const workforceTotal = workforce.reduce((sum, share) => sum + share.total, 0);

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto bg-stone-100/70 p-3 lg:grid-cols-2 lg:overflow-hidden lg:[grid-template-rows:minmax(0,1.12fr)_minmax(0,0.88fr)]">
      <InsightCard
        title="Staff and salary"
        figure={String(staffTotal)}
        figureLabel={`${compactNumber(salaryTotal)} current salary`}
        departmentId={salaryDepartment}
        departments={lookups.departments}
        onDepartment={setSalaryDepartment}
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
      >
        <WorkforceChart shares={workforce} />
      </InsightCard>
      <InsightCard
        title="Positions"
        figure={String(positionTotal)}
        figureLabel="staff"
        departmentId={positionDepartment}
        departments={lookups.departments}
        onDepartment={setPositionDepartment}
      >
        <PositionChart share={positions} hasVenues={venues.length > 0} />
      </InsightCard>
      <InsightCard
        title="Promotions"
        figure={String(promotionTotal)}
        figureLabel={promotionTotal === 1 ? "promotion" : "promotions"}
        departmentId={promotionDepartment}
        departments={lookups.departments}
        onDepartment={setPromotionDepartment}
      >
        <PromotionRing points={promotionPoints} total={promotionTotal} />
      </InsightCard>
    </div>
  );
}

function useDepartment(departments: LookupDepartment[]) {
  const [id, setId] = useState("");
  const value = departments.some((department) => department.id === id) ? id : "";
  return [value, setId] as const;
}

function InsightCard({
  title,
  figure,
  figureLabel,
  departmentId,
  departments,
  onDepartment,
  children,
}: {
  title: string;
  figure: string;
  figureLabel: string;
  departmentId: string;
  departments: LookupDepartment[];
  onDepartment: (departmentId: string) => void;
  children: React.ReactNode;
}) {
  const selectId = `${title.toLowerCase().replace(/\s+/g, "-")}-department`;

  return (
    <section className="relative flex min-h-80 flex-col overflow-hidden rounded-[1.35rem] bg-white shadow-[0_1px_1px_rgba(28,25,23,0.04),0_18px_40px_-28px_rgba(28,25,23,0.45)] ring-1 ring-stone-900/6 lg:min-h-0">
      <div className="flex items-start justify-between gap-3 px-5 pt-4 pr-40">
        <div className="min-w-0">
          <h2 className="text-[13px] font-medium text-stone-500">{title}</h2>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="text-[1.7rem] leading-none font-semibold tracking-tight text-stone-950 tabular-nums">
              {figure}
            </span>
            <span className="truncate text-xs text-stone-400">{figureLabel}</span>
          </p>
        </div>
      </div>
      <label htmlFor={selectId} className="absolute top-3.5 right-3.5 z-10">
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
  const height = 268;
  const pad = { top: 18, right: 36, bottom: 28, left: 46 };
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
    <div className="flex h-full min-h-52 flex-col">
      <div className="mb-1 flex items-center gap-4 px-1 text-[11px] text-stone-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-[3px] bg-stone-800" />
          Salary
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-4 rounded-full bg-orange-500/80" />
          Staff
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-4 border-t border-dashed border-stone-400" />
          Average salary
        </span>
      </div>
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

function WorkforceChart({ shares }: { shares: VenueShare[] }) {
  if (shares.length === 0) {
    return <EmptyChart label="Add a venue to see this mix." />;
  }

  const categories = [
    { key: "inhouse", label: "In-house", color: "#1c1917" },
    { key: "outsourced", label: "Outsourced", color: "#c2410c" },
    { key: "hiring", label: "Hiring", color: "#a8a29e" },
  ].map((category) => ({
    ...category,
    value: shares.reduce(
      (sum, share) => sum + (share.slices.find((slice) => slice.key === category.key)?.value ?? 0),
      0,
    ),
  }));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 grid grid-cols-3 gap-1.5 sm:gap-2">
        {categories.map((category) => (
          <div key={category.key} className="min-w-0 rounded-2xl bg-stone-50 px-2 py-2 sm:px-3">
            <p className="flex min-w-0 items-center gap-1 text-[9px] text-stone-400 sm:gap-1.5 sm:text-[10px]">
              <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
              <span className="truncate">{category.label}</span>
            </p>
            <p className="mt-0.5 text-sm font-semibold text-stone-950 tabular-nums">{category.value}</p>
          </div>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {shares.map((share) => (
          <WorkforceRow key={share.venue.id} share={share} />
        ))}
      </div>
    </div>
  );
}

function WorkforceRow({ share }: { share: VenueShare }) {
  const percents = percentShares(share.slices, share.total);

  return (
    <div className="grid min-h-[3.75rem] shrink-0 grid-cols-[2.75rem_minmax(0,1fr)_2rem] items-center gap-2 py-1 sm:min-h-0 sm:flex-1 sm:grid-cols-[3.5rem_minmax(0,1fr)_auto] sm:gap-3">
      <div className="size-11 sm:size-14">
        <Ring slices={share.slices} total={share.total} venue={share.venue.name} className="size-full" compact />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-stone-950">
          {share.venue.label}
          <span className="ml-2 font-normal text-stone-400">{share.venue.name}</span>
        </p>
        {share.slices.length > 0 ? (
          <div className="mt-1.5 flex flex-col gap-1">
            {share.slices.map((slice, index) => (
              <div key={slice.key} className="flex items-center gap-2 text-[11px] text-stone-500">
                <span className="w-16 shrink-0 truncate">{slice.label}</span>
                <span className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-stone-100">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${percents[index]}%`, backgroundColor: slice.color }}
                  />
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-[11px] text-stone-400">No people</p>
        )}
      </div>
      <p className="pr-1 text-right">
        <span className="block text-base leading-none font-semibold text-stone-950 tabular-nums">{share.total}</span>
        <span className="mt-1 block text-[10px] text-stone-400">total</span>
      </p>
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

function PromotionRing({ points, total }: { points: PromotionPoint[]; total: number }) {
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
    <div className="flex h-full min-h-0 items-center gap-5">
      <Ring slices={slices} total={total} venue="Promotions" className="size-36 shrink-0" />
      <ul className="min-w-0 flex-1 space-y-2">
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
