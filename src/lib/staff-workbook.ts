import {
  columnKeyForHeader,
  createEmployeeId,
  excelHeaders,
  resolvePay,
  roundMoney,
  splitFullName,
  type StaffColumnKey,
  type StaffEmployee,
} from "@/lib/staff";
import { readXlsx, writeXlsx, type SheetCell } from "@/lib/xlsx-lite";

const MAX_ROWS = 5000;

export type StaffImport = {
  employees: StaffEmployee[];
  skipped: number;
  error?: string;
};

export async function buildStaffWorkbook(employees: StaffEmployee[]) {
  const rows: SheetCell[][] = [
    excelHeaders.map((header) => ({ text: header, number: null })),
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
      error:
        "Export a sheet from this page first. It needs columns for full name, first name, last name, country, date of birth, joining date, current position, current venue, basic salary, allowances, and current salary.",
    };
  }

  const columns = new Map<number, StaffColumnKey>();
  rows[headerIndex].forEach((cell, index) => {
    const key = columnKeyForHeader(cell.text);
    if (key) {
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

    const employee = employeeFromRecord(record);
    if (employee) {
      employees.push(employee);
    } else {
      skipped += 1;
    }
  }

  return { employees, skipped };
}

function employeeRow(employee: StaffEmployee): SheetCell[] {
  return [
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
    id: createEmployeeId(),
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
