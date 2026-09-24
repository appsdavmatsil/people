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
        "Export a sheet from this page first. It needs columns for full name, company, position, and venue.",
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
    if (!fullName) {
      skipped += 1;
      continue;
    }

    people.push({
      id: crypto.randomUUID(),
      fullName,
      company: cellText(record.company),
      position: cellText(record.position),
      venue: cellText(record.venue),
      startDate: "",
      endDate: "",
      rate: null,
    });
  }

  return { people, skipped };
}
