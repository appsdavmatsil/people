import type { StaffPromotion } from "@/lib/promotions";
import { formatDate, formatSalary, roundMoney } from "@/lib/staff";
import {
  blankRow,
  cellText,
  columnKeyForHeader,
} from "@/lib/sheet-values";
import { readXlsx, writeXlsx, type SheetCell } from "@/lib/xlsx-lite";

const MAX_ROWS = 5000;

const columns = [
  { key: "staffId", label: "Employee ID" },
  { key: "staffName", label: "Staff member" },
  { key: "currentPosition", label: "Current position" },
  { key: "currentSalary", label: "Current salary" },
  { key: "newPosition", label: "New position" },
  { key: "newSalary", label: "New salary package" },
  { key: "effectiveDate", label: "Effective date" },
] as const;

type ColumnKey = (typeof columns)[number]["key"];

const aliases: Record<string, ColumnKey> = {
  "employee id": "staffId",
  "staff id": "staffId",
  "staff member": "staffName",
  staff: "staffName",
  name: "staffName",
  "full name": "staffName",
  employee: "staffName",
  "current position": "currentPosition",
  "from position": "currentPosition",
  "current salary": "currentSalary",
  "from salary": "currentSalary",
  "new position": "newPosition",
  "to position": "newPosition",
  position: "newPosition",
  "new salary package": "newSalary",
  "new salary": "newSalary",
  "salary package": "newSalary",
  "to salary": "newSalary",
  "effective date": "effectiveDate",
  effective: "effectiveDate",
  date: "effectiveDate",
};

export type PromotionImport = {
  promotions: StaffPromotion[];
  skipped: number;
  error?: string;
};

export async function buildPromotionsWorkbook(promotions: StaffPromotion[]) {
  const rows: SheetCell[][] = [
    columns.map((column) => ({ text: column.label, number: null })),
    ...promotions.map((promotion) => [
      { text: promotion.staffId, number: null },
      { text: promotion.staffName, number: null },
      { text: promotion.currentPosition, number: null },
      {
        text: promotion.currentSalary == null ? "" : formatSalary(promotion.currentSalary),
        number: promotion.currentSalary,
      },
      { text: promotion.newPosition, number: null },
      { text: formatSalary(promotion.newSalary), number: promotion.newSalary },
      { text: promotion.effectiveDate ? formatDate(promotion.effectiveDate) : "", number: null },
    ]),
  ];
  return writeXlsx(rows);
}

export async function importPromotionsWorkbook(data: ArrayBuffer): Promise<PromotionImport> {
  let rows: SheetCell[][];
  try {
    rows = await readXlsx(data);
  } catch (error) {
    return {
      promotions: [],
      skipped: 0,
      error: error instanceof Error ? error.message : "That spreadsheet could not be read.",
    };
  }

  if (rows.length > MAX_ROWS + 1) {
    return {
      promotions: [],
      skipped: 0,
      error: "That sheet has too many rows to import at once.",
    };
  }

  const headerIndex = rows.findIndex((row) =>
    row.some((cell) => {
      const key = columnKeyForHeader(cell.text, aliases);
      return key === "staffName" || key === "staffId";
    }),
  );

  if (headerIndex === -1) {
    return {
      promotions: [],
      skipped: 0,
      error:
        "Export a sheet from this page first. It needs an employee ID, a staff member, positions, a salary package, and an effective date.",
    };
  }

  const mapped = new Map<number, ColumnKey>();
  const used = new Set<ColumnKey>();
  rows[headerIndex].forEach((cell, index) => {
    const key = columnKeyForHeader(cell.text, aliases);
    if (key && !used.has(key)) {
      used.add(key);
      mapped.set(index, key);
    }
  });

  const promotions: StaffPromotion[] = [];
  let skipped = 0;

  for (const row of rows.slice(headerIndex + 1)) {
    if (blankRow(row)) {
      continue;
    }

    const record: Partial<Record<ColumnKey, SheetCell>> = {};
    for (const [index, key] of mapped) {
      record[key] = row[index] ?? { text: "", number: null };
    }

    const staffId = cellId(record.staffId);
    const staffName = cellText(record.staffName).replace(/\s+/g, " ");
    const newPosition = cellText(record.newPosition).replace(/\s+/g, " ");
    const newSalary = salaryFromCell(record.newSalary);
    const effectiveDate = parseDate(record.effectiveDate);
    if ((!staffName && !staffId) || !newPosition || newSalary == null || !effectiveDate) {
      skipped += 1;
      continue;
    }

    promotions.push({
      id: crypto.randomUUID(),
      staffId,
      staffName,
      currentPosition: cellText(record.currentPosition).replace(/\s+/g, " "),
      currentSalary: salaryFromCell(record.currentSalary),
      newPosition,
      newSalary,
      effectiveDate,
      applied: false,
    });
  }

  return { promotions, skipped };
}

function cellId(cell: SheetCell | undefined) {
  if (!cell) {
    return "";
  }

  const text = cell.text.trim();
  if (text) {
    return text;
  }

  return cell.number == null ? "" : String(cell.number);
}

function salaryFromCell(cell: SheetCell | undefined) {
  if (!cell || (!cell.text.trim() && cell.number == null)) {
    return null;
  }

  const value =
    cell.number != null && cell.text === ""
      ? cell.number
      : Number(cell.text.replaceAll(",", "").replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }

  return roundMoney(value);
}

function parseDate(cell: SheetCell | undefined) {
  if (!cell) {
    return "";
  }

  const text = cell.text.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) {
    return validIso(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  const slash = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text);
  if (slash) {
    return validIso(Number(slash[3]), Number(slash[2]), Number(slash[1]));
  }

  const named = /^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/.exec(text);
  if (named) {
    const month = monthIndex(named[2]);
    if (month) {
      return validIso(Number(named[3]), month, Number(named[1]));
    }
  }

  const serial = cell.number ?? (/^\d+(\.\d+)?$/.test(text) ? Number(text) : null);
  if (serial != null && serial > 20000 && serial < 80000) {
    const utc = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000;
    const date = new Date(utc);
    return validIso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }

  return "";
}

function validIso(year: number, month: number, day: number) {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return "";
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return "";
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthIndex(name: string) {
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const index = months.indexOf(name.slice(0, 3).toLowerCase());
  return index === -1 ? 0 : index + 1;
}
