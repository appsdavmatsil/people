import {
  hiringStatuses,
  hiringStatusLabel,
  type HiringRole,
  type HiringStatus,
} from "@/lib/hiring";
import {
  blankRow,
  cellText,
  columnKeyForHeader,
  parseSheetCount,
} from "@/lib/sheet-values";
import { readXlsx, writeXlsx, type SheetCell } from "@/lib/xlsx-lite";

const MAX_ROWS = 5000;

const columns = [
  { key: "position", label: "Position" },
  { key: "department", label: "Department" },
  { key: "venue", label: "Venue" },
  { key: "openings", label: "Openings" },
  { key: "status", label: "Status" },
  { key: "salary", label: "Salary" },
] as const;

type ColumnKey = (typeof columns)[number]["key"];

const aliases: Record<string, ColumnKey> = {
  position: "position",
  "job title": "position",
  title: "position",
  role: "position",
  department: "department",
  dept: "department",
  venue: "venue",
  "venue name": "venue",
  location: "venue",
  openings: "openings",
  opening: "openings",
  headcount: "openings",
  status: "status",
  salary: "salary",
  "current salary": "salary",
};

export type HiringImport = {
  roles: HiringRole[];
  skipped: number;
  error?: string;
};

export async function buildHiringWorkbook(roles: HiringRole[]) {
  const rows: SheetCell[][] = [
    columns.map((column) => ({ text: column.label, number: null })),
    ...roles.map((role) => [
      { text: role.position, number: null },
      { text: role.department, number: null },
      { text: role.venue, number: null },
      { text: "", number: role.openings },
      { text: hiringStatusLabel(role.status), number: null },
      { text: role.salary == null ? "" : String(role.salary), number: role.salary },
    ]),
  ];
  return writeXlsx(rows);
}

export async function importHiringWorkbook(data: ArrayBuffer): Promise<HiringImport> {
  let rows: SheetCell[][];
  try {
    rows = await readXlsx(data);
  } catch (error) {
    return {
      roles: [],
      skipped: 0,
      error: error instanceof Error ? error.message : "That spreadsheet could not be read.",
    };
  }

  if (rows.length > MAX_ROWS + 1) {
    return {
      roles: [],
      skipped: 0,
      error: "That sheet has too many rows to import at once.",
    };
  }

  const headerIndex = rows.findIndex((row) =>
    row.some((cell) => columnKeyForHeader(cell.text, aliases) === "position"),
  );

  if (headerIndex === -1) {
    return {
      roles: [],
      skipped: 0,
      error:
        "Export a sheet from this page first. It needs columns for position, department, venue, openings, and status.",
    };
  }

  const mapped = new Map<number, ColumnKey>();
  rows[headerIndex].forEach((cell, index) => {
    const key = columnKeyForHeader(cell.text, aliases);
    if (key) {
      mapped.set(index, key);
    }
  });

  const roles: HiringRole[] = [];
  let skipped = 0;

  for (const row of rows.slice(headerIndex + 1)) {
    if (blankRow(row)) {
      continue;
    }

    const record: Partial<Record<ColumnKey, SheetCell>> = {};
    for (const [index, key] of mapped) {
      record[key] = row[index] ?? { text: "", number: null };
    }

    const position = cellText(record.position);
    const status = parseStatus(cellText(record.status));
    const openings = openingsFromCell(record.openings);
    if (!position || !status || openings == null) {
      skipped += 1;
      continue;
    }

    roles.push({
      id: crypto.randomUUID(),
      position,
      department: cellText(record.department),
      venue: cellText(record.venue),
      openings,
      status,
      salary: salaryFromCell(record.salary),
    });
  }

  return { roles, skipped };
}

function salaryFromCell(cell: SheetCell | undefined) {
  if (!cell || (!cell.text.trim() && cell.number == null)) {
    return null;
  }

  const value =
    cell.number != null && cell.text === "" ? cell.number : Number(cell.text.replaceAll(",", "").trim());
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }

  return Math.round(value * 100) / 100;
}

function openingsFromCell(cell: SheetCell | undefined) {
  if (!cell || (!cell.text.trim() && cell.number == null)) {
    return 1;
  }

  return parseSheetCount(cell);
}

function parseStatus(value: string): HiringStatus | null {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized) {
    return "open";
  }

  const match = hiringStatuses.find(
    (status) => status.id === normalized || status.label.toLowerCase() === normalized,
  );
  if (match) {
    return match.id;
  }

  if (normalized === "onhold" || normalized === "on-hold") {
    return "on-hold";
  }

  return null;
}
