import type { OutsourcedPerson } from "@/lib/outsourced";
import {
  blankRow,
  cellText,
  columnKeyForHeader,
} from "@/lib/sheet-values";
import { readXlsx, writeXlsx, type SheetCell } from "@/lib/xlsx-lite";

const MAX_ROWS = 5000;

const columns = [
  { key: "fullName", label: "Full name" },
  { key: "company", label: "Company" },
  { key: "position", label: "Position" },
  { key: "venue", label: "Venue" },
  { key: "salary", label: "Salary" },
] as const;

type ColumnKey = (typeof columns)[number]["key"];

const aliases: Record<string, ColumnKey> = {
  "full name": "fullName",
  fullname: "fullName",
  name: "fullName",
  company: "company",
  supplier: "company",
  vendor: "company",
  position: "position",
  "job title": "position",
  title: "position",
  venue: "venue",
  "venue name": "venue",
  location: "venue",
  salary: "salary",
  rate: "salary",
  "current salary": "salary",
};

export type OutsourcedImport = {
  people: OutsourcedPerson[];
  skipped: number;
  error?: string;
};

export async function buildOutsourcedWorkbook(people: OutsourcedPerson[]) {
  const rows: SheetCell[][] = [
    columns.map((column) => ({ text: column.label, number: null })),
    ...people.map((person) => [
      { text: person.fullName, number: null },
      { text: person.company, number: null },
      { text: person.position, number: null },
      { text: person.venue, number: null },
      { text: person.rate == null ? "" : String(person.rate), number: person.rate },
    ]),
  ];
  return writeXlsx(rows);
}

export async function importOutsourcedWorkbook(data: ArrayBuffer): Promise<OutsourcedImport> {
  let rows: SheetCell[][];
  try {
    rows = await readXlsx(data);
  } catch (error) {
    return {
      people: [],
      skipped: 0,
      error: error instanceof Error ? error.message : "That spreadsheet could not be read.",
    };
  }

  if (rows.length > MAX_ROWS + 1) {
    return {
      people: [],
      skipped: 0,
      error: "That sheet has too many rows to import at once.",
    };
  }

  const headerIndex = rows.findIndex((row) =>
    row.some((cell) => columnKeyForHeader(cell.text, aliases) === "fullName"),
  );

  if (headerIndex === -1) {
    return {
      people: [],
      skipped: 0,
      error:
        "Export a sheet from this page first. It needs columns for full name, company, position, venue, and salary.",
    };
  }

  const mapped = new Map<number, ColumnKey>();
  rows[headerIndex].forEach((cell, index) => {
    const key = columnKeyForHeader(cell.text, aliases);
    if (key) {
      mapped.set(index, key);
    }
  });

  const people: OutsourcedPerson[] = [];
  let skipped = 0;

  for (const row of rows.slice(headerIndex + 1)) {
    if (blankRow(row)) {
      continue;
    }

    const record: Partial<Record<ColumnKey, SheetCell>> = {};
    for (const [index, key] of mapped) {
      record[key] = row[index] ?? { text: "", number: null };
    }

    const fullName = cellText(record.fullName).replace(/\s+/g, " ");
    const salary = salaryFromCell(record.salary);
    if (!fullName || salary == null || salary < 0) {
      skipped += 1;
      continue;
    }

    people.push({
      id: crypto.randomUUID(),
      fullName,
      photo: null,
      company: cellText(record.company),
      position: cellText(record.position),
      venue: cellText(record.venue),
      startDate: "",
      endDate: "",
      rate: salary,
    });
  }

  return { people, skipped };
}

function salaryFromCell(cell: SheetCell | undefined) {
  if (!cell) return null;
  if (cell.number != null && Number.isFinite(cell.number)) return cell.number;
  const parsed = Number(cell.text.replaceAll(",", "").trim());
  return Number.isFinite(parsed) && cell.text.trim() ? parsed : null;
}
