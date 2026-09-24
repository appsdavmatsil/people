"use client";

import type { SortDirection } from "@/lib/staff";

export function ColumnSortFilterHeaders<K extends string>({
  columns,
  sortKey,
  sortDirection,
  onSort,
  filters,
  onFilter,
  filtersActive,
  onClear,
  endAligned,
}: {
  columns: readonly { key: K; label: string }[];
  sortKey: K;
  sortDirection: SortDirection;
  onSort: (key: K) => void;
  filters: Record<K, string>;
  onFilter: (key: K, value: string) => void;
  filtersActive: boolean;
  onClear: () => void;
  endAligned?: (key: K) => boolean;
}) {
  return (
    <>
      <tr className="bg-stone-50 text-left text-xs font-medium tracking-wide text-stone-500 uppercase">
        {columns.map((column) => {
          const active = sortKey === column.key;
          return (
            <th
              key={column.key}
              scope="col"
              aria-sort={active ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
              className="border-b border-stone-200 px-2 py-1 font-medium"
            >
              <button
                type="button"
                className={`flex h-8 w-full items-center gap-1.5 rounded-md px-1 whitespace-nowrap hover:text-stone-950 ${
                  endAligned?.(column.key) ? "justify-end text-right" : "text-left"
                }`}
                onClick={() => onSort(column.key)}
              >
                <span>{column.label}</span>
                <SortArrows active={active} direction={sortDirection} />
              </button>
            </th>
          );
        })}
        <th className="border-b border-stone-200 px-2 py-1 text-right font-medium">
          <span className="sr-only">Actions</span>
        </th>
      </tr>
      <tr className="bg-white">
        {columns.map((column) => (
          <th key={column.key} className="border-b border-stone-200 px-2 py-2 font-normal">
            <div className="flex items-center gap-2">
              <input
                value={filters[column.key]}
                onChange={(event) => onFilter(column.key, event.target.value)}
                aria-label={`Filter ${column.label}`}
                placeholder="Filter"
                className="h-8 w-full min-w-24 rounded-md border border-stone-200 bg-white px-2 text-xs font-normal text-stone-950 outline-none placeholder:text-stone-400 focus:border-stone-950"
              />
              {column.key === columns[0]?.key && filtersActive ? (
                <button
                  type="button"
                  className="shrink-0 text-xs font-medium text-stone-600 underline-offset-4 hover:text-stone-950 hover:underline"
                  onClick={onClear}
                >
                  Clear
                </button>
              ) : null}
            </div>
          </th>
        ))}
        <th className="border-b border-stone-200 px-2 py-2" />
      </tr>
    </>
  );
}

export function blankColumnFilters<K extends string>(columns: readonly { key: K }[]) {
  return Object.fromEntries(columns.map((column) => [column.key, ""])) as Record<K, string>;
}

function SortArrows({
  active,
  direction,
}: {
  active: boolean;
  direction: SortDirection;
}) {
  return (
    <span className="inline-flex flex-col" aria-hidden="true">
      <Caret
        direction="up"
        className={active && direction === "asc" ? "text-stone-950" : "text-stone-300"}
      />
      <Caret
        direction="down"
        className={active && direction === "desc" ? "text-stone-950" : "text-stone-300"}
      />
    </span>
  );
}

function Caret({
  direction,
  className,
}: {
  direction: "up" | "down";
  className: string;
}) {
  return (
    <svg width="8" height="5" viewBox="0 0 8 5" className={className} aria-hidden="true">
      {direction === "up" ? (
        <path
          d="M1 4.2 4 1.2l3 3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M1 .8 4 3.8l3-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
