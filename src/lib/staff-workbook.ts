import {
  columnKeyForHeader,
  createEmployeeId,
  normalizeHeader,
  resolvePay,
  roundMoney,
  splitFullName,
  type StaffColumnKey,
  type StaffEmployee,
} from "@/lib/staff";
import { readXlsx, writeXlsx, type SheetCell } from "@/lib/xlsx-lite";

const MAX_ROWS = 5000;

const employeeIdHeader = "Employee ID";
const employeeIdAliases = new Set(["employee id", "staff id"]);

const sheetHeaders = [
  employeeIdHeader,
  "Full name",
  "First name",
  "Last name",
  "Country",
  "Date of birth",
  "Joining date",
  "Current position",
  "Current venue",
  "Basic salary",
  "Allowances",
  "Current salary",
];

export type StaffImport = {
  employees: StaffEmployee[];
  skipped: number;
  hasEmployeeIdColumn: boolean;
  error?: string;
};

export async function buildStaffWorkbook(employees: StaffEmployee[]) {
  const rows: SheetCell[][] = [
    sheetHeaders.map((header) => ({ text: header, number: null })),
    ...employees.map(employeeRow),
  ];
  return writeXlsx(rows);
}

export async function importStaffWorkbook(data: ArrayBuffer): Promise<StaffImport> {
  let rows: SheetCell[][];
  try {
    rows = await readXlsx(data);
  } catch (error) {
    return {
      employees: [],
      skipped: 0,
      hasEmployeeIdColumn: false,
      error: error instanceof Error ? error.message : "That spreadsheet could not be read.",
    };
  }

  return employeesFromSheet(rows);
}

export function employeesFromSheet(rows: SheetCell[][]): StaffImport {
  if (rows.length > MAX_ROWS + 1) {
    return {
      employees: [],
      skipped: 0,
      hasEmployeeIdColumn: false,
      error: "That sheet has too many rows to import at once.",
    };
  }

  const headerIndex = rows.findIndex((row) =>
    row.some((cell) => {
      const key = columnKeyForHeader(cell.text);
      return key === "fullName" || key === "firstName";
    }),
  );

  if (headerIndex === -1) {
    return {
      employees: [],
      skipped: 0,
      hasEmployeeIdColumn: false,
      error:
        "Export a sheet from this page first. It needs an employee ID, plus columns for full name, first name, last name, country, date of birth, joining date, current position, current venue, basic salary, allowances, and current salary.",
    };
  }

  let employeeIdColumn = -1;
  const columns = new Map<number, StaffColumnKey>();
  const usedKeys = new Set<StaffColumnKey>();
  rows[headerIndex].forEach((cell, index) => {
    if (employeeIdColumn === -1 && isEmployeeIdHeader(cell.text)) {
      employeeIdColumn = index;
      return;
    }

    const key = columnKeyForHeader(cell.text);
    if (key && !usedKeys.has(key)) {
      usedKeys.add(key);
      columns.set(index, key);
    }
  });

  const employees: StaffEmployee[] = [];
  let skipped = 0;

  for (const row of rows.slice(headerIndex + 1)) {
    if (row.every((cell) => !cell.text.trim() && cell.number == null)) {
      continue;
    }

    const record: Partial<Record<StaffColumnKey, SheetCell>> = {};
    for (const [index, key] of columns) {
      record[key] = row[index] ?? { text: "", number: null };
    }

    const employee = employeeFromRecord(
      record,
      employeeIdColumn === -1 ? "" : cellId(row[employeeIdColumn]),
    );
    if (employee) {
      employees.push(employee);
    } else {
      skipped += 1;
    }
  }

  return { employees, skipped, hasEmployeeIdColumn: employeeIdColumn !== -1 };
}

export function mergeImportedStaff(
  current: StaffEmployee[],
  imported: StaffEmployee[],
  matchByName: boolean,
) {
  const next = current.map((employee) => ({ ...employee }));
  const indexById = new Map(next.map((employee, index) => [employee.id, index]));
  const nameIndex = matchByName ? uniqueNameIndex(next) : null;
  const touched = new Set<string>();
  let added = 0;
  let updated = 0;

  for (const row of imported) {
    const importedId = row.id.trim();
    let matchIndex = importedId ? indexById.get(importedId) : undefined;
    if (matchIndex == null && nameIndex) {
      const existingId = nameIndex.get(normalizeName(row.fullName));
      matchIndex = existingId == null ? undefined : indexById.get(existingId);
    }

    if (matchIndex == null) {
      const id = importedId || createEmployeeId();
      const existingIndex = indexById.get(id);
      if (existingIndex == null) {
        next.push({ ...row, id });
        indexById.set(id, next.length - 1);
        touched.add(id);
        added += 1;
        continue;
      }

      const previous = next[existingIndex];
      next[existingIndex] = keptIdentity(row, previous);
      if (!touched.has(previous.id)) {
        touched.add(previous.id);
        updated += 1;
      }
      continue;
    }

    const previous = next[matchIndex];
    next[matchIndex] = keptIdentity(row, previous);
    if (!touched.has(previous.id)) {
      touched.add(previous.id);
      updated += 1;
    }
  }

  return { employees: next, added, updated };
}

function uniqueNameIndex(employees: StaffEmployee[]) {
  const counts = new Map<string, number>();
  for (const employee of employees) {
    const name = normalizeName(employee.fullName);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  const index = new Map<string, string>();
  for (const employee of employees) {
    const name = normalizeName(employee.fullName);
    if (name && counts.get(name) === 1) {
      index.set(name, employee.id);
    }
  }

  return index;
}

function keptIdentity(row: StaffEmployee, previous: StaffEmployee): StaffEmployee {
  return {
    ...row,
    id: previous.id,
    photo: previous.photo,
    archived: previous.archived,
  };
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function isEmployeeIdHeader(value: string) {
  return employeeIdAliases.has(normalizeHeader(value));
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

function employeeRow(employee: StaffEmployee): SheetCell[] {
  return [
    { text: employee.id, number: null },
    { text: employee.fullName, number: null },
    { text: employee.firstName, number: null },
    { text: employee.lastName, number: null },
    { text: employee.nationality, number: null },
    { text: employee.dateOfBirth, number: null },
    { text: employee.joiningDate, number: null },
    { text: employee.position, number: null },
    { text: employee.venue, number: null },
    moneyCell(employee.basicSalary),
    moneyCell(employee.allowances),
    moneyCell(employee.salary),
  ];
}

function moneyCell(value: number | null): SheetCell {
  return value == null ? { text: "", number: null } : { text: "", number: value };
}

function employeeFromRecord(
  record: Partial<Record<StaffColumnKey, SheetCell>>,
  employeeId: string,
): StaffEmployee | null {
  const text = (key: StaffColumnKey) => record[key]?.text.trim() ?? "";
  let fullName = text("fullName");
  let firstName = text("firstName");
  let lastName = text("lastName");

  if (!fullName && (firstName || lastName)) {
    fullName = `${firstName} ${lastName}`.trim();
  }

  if (fullName && !firstName && !lastName) {
    const parts = splitFullName(fullName);
    firstName = parts.firstName;
    lastName = parts.lastName;
  }

  if (!fullName) {
    return null;
  }

  const pay = resolvePay(
    parseSalary(record.basicSalary),
    parseSalary(record.allowances),
    parseSalary(record.salary),
  );

  return {
    id: employeeId.trim(),
    fullName,
    firstName,
    lastName,
    photo: null,
    nationality: text("nationality"),
    dateOfBirth: parseDate(record.dateOfBirth),
    joiningDate: parseDate(record.joiningDate),
    position: text("position"),
    venue: text("venue"),
    basicSalary: pay.basicSalary,
    allowances: pay.allowances,
    salary: pay.salary,
  };
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

  const numeric = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(text);
  if (numeric) {
    return validIso(Number(numeric[3]), Number(numeric[2]), Number(numeric[1]));
  }

  const named = /^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/.exec(text);
  if (named) {
    const month = monthIndex(named[2]);
    if (month) {
      return validIso(Number(named[3]), month, Number(named[1]));
    }
  }

  const serial = cell.number ?? (/^\d+(\.\d+)?$/.test(text) ? Number(text) : null);
  if (serial != null && serial > 0 && serial < 80000) {
    return excelSerialToIso(serial);
  }

  return "";
}

function parseSalary(cell: SheetCell | undefined) {
  if (!cell) {
    return null;
  }

  if (cell.number != null && cell.text === "") {
    return roundMoney(cell.number);
  }

  const cleaned = cell.text.replaceAll(",", "").replace(/[^\d.-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") {
    return null;
  }

  const value = Number(cleaned);
  return Number.isFinite(value) ? roundMoney(value) : null;
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

  const monthText = String(month).padStart(2, "0");
  const dayText = String(day).padStart(2, "0");
  return `${year}-${monthText}-${dayText}`;
}

function excelSerialToIso(serial: number) {
  const utc = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000;
  const date = new Date(utc);
  return validIso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function monthIndex(name: string) {
  const months = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ];
  const index = months.findIndex((month) => name.toLowerCase().startsWith(month));
  return index === -1 ? 0 : index + 1;
}
