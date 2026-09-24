export type StaffEmployee = {
  id: string;
  fullName: string;
  firstName: string;
  lastName: string;
  photo: string | null;
  nationality: string;
  dateOfBirth: string;
  joiningDate: string;
  position: string;
  venue: string;
  basicSalary: number | null;
  allowances: number | null;
  salary: number | null;
  archived?: boolean;
};

export const staffColumns = [
  { key: "fullName", label: "Full name" },
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "nationality", label: "Country" },
  { key: "dateOfBirth", label: "Date of birth" },
  { key: "joiningDate", label: "Joining date" },
  { key: "position", label: "Current position" },
  { key: "venue", label: "Current venue" },
  { key: "basicSalary", label: "Basic salary" },
  { key: "allowances", label: "Allowances" },
  { key: "salary", label: "Current salary" },
] as const;

export type StaffColumnKey = (typeof staffColumns)[number]["key"];
export type SortDirection = "asc" | "desc";
export type StaffFilters = Record<StaffColumnKey, string>;

const headerAliases: Record<string, StaffColumnKey> = {
  "full name": "fullName",
  fullname: "fullName",
  name: "fullName",
  "first name": "firstName",
  firstname: "firstName",
  first: "firstName",
  "last name": "lastName",
  lastname: "lastName",
  last: "lastName",
  surname: "lastName",
  nationality: "nationality",
  nacionality: "nationality",
  country: "nationality",
  "date of birth": "dateOfBirth",
  dob: "dateOfBirth",
  birthday: "dateOfBirth",
  birthdate: "dateOfBirth",
  "birth date": "dateOfBirth",
  "joining date": "joiningDate",
  "join date": "joiningDate",
  "start date": "joiningDate",
  "date joined": "joiningDate",
  "current position": "position",
  position: "position",
  "job title": "position",
  title: "position",
  "current venue": "venue",
  venue: "venue",
  "venue name": "venue",
  location: "venue",
  "basic salary": "basicSalary",
  "basic pay": "basicSalary",
  basic: "basicSalary",
  allowances: "allowances",
  allowance: "allowances",
  "current salary": "salary",
  salary: "salary",
  "total salary": "salary",
};

const moneyColumnKeys = ["basicSalary", "allowances", "salary"] as const;
export type MoneyColumnKey = (typeof moneyColumnKeys)[number];

export function isMoneyColumn(key: StaffColumnKey): key is MoneyColumnKey {
  return key === "basicSalary" || key === "allowances" || key === "salary";
}

export function emptyFilters(): StaffFilters {
  return {
    fullName: "",
    firstName: "",
    lastName: "",
    nationality: "",
    dateOfBirth: "",
    joiningDate: "",
    position: "",
    venue: "",
    basicSalary: "",
    allowances: "",
    salary: "",
  };
}

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function parseMoneyInput(value: string) {
  const trimmed = value.trim().replaceAll(",", "");
  if (!trimmed || trimmed === "-" || trimmed === "." || trimmed === "-.") {
    return null;
  }

  const amount = Number(trimmed);
  return Number.isFinite(amount) ? amount : null;
}

export type StaffPay = {
  basicSalary: number | null;
  allowances: number | null;
  salary: number | null;
};

export function splitSalary(salary: number): StaffPay {
  const total = roundMoney(salary);
  const basicSalary = roundMoney(total * 0.6);
  const allowances = roundMoney(total - basicSalary);
  return {
    basicSalary,
    allowances,
    salary: roundMoney(basicSalary + allowances),
  };
}

export function sumSalary(
  basicSalary: number | null,
  allowances: number | null,
): StaffPay {
  if (basicSalary == null && allowances == null) {
    return { basicSalary: null, allowances: null, salary: null };
  }

  const basic = basicSalary == null ? 0 : roundMoney(basicSalary);
  const allowance = allowances == null ? 0 : roundMoney(allowances);
  return {
    basicSalary: basicSalary == null ? null : basic,
    allowances: allowances == null ? null : allowance,
    salary: roundMoney(basic + allowance),
  };
}

export function resolvePay(
  basicSalary: number | null,
  allowances: number | null,
  salary: number | null,
): StaffPay {
  if (basicSalary != null || allowances != null) {
    return sumSalary(basicSalary, allowances);
  }

  if (salary != null) {
    return splitSalary(salary);
  }

  return { basicSalary: null, allowances: null, salary: null };
}

export function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

export function columnKeyForHeader(value: string): StaffColumnKey | null {
  return headerAliases[normalizeHeader(value)] ?? null;
}

export function splitFullName(fullName: string) {
  const cleaned = fullName.trim().replace(/\s+/g, " ");
  if (!cleaned) {
    return { firstName: "", lastName: "" };
  }

  const space = cleaned.lastIndexOf(" ");
  if (space === -1) {
    return { firstName: cleaned, lastName: "" };
  }

  return {
    firstName: cleaned.slice(0, space),
    lastName: cleaned.slice(space + 1),
  };
}

export function createEmployeeId() {
  return crypto.randomUUID();
}

export function formatDate(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) {
    return iso;
  }

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatSalary(value: number | null) {
  if (value == null) {
    return "";
  }

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function staffCellText(employee: StaffEmployee, key: StaffColumnKey) {
  if (isMoneyColumn(key)) {
    return formatSalary(employee[key]);
  }

  if (key === "dateOfBirth" || key === "joiningDate") {
    return employee[key] ? formatDate(employee[key]) : "";
  }

  return employee[key];
}

export function filterStaff(employees: StaffEmployee[], filters: StaffFilters) {
  return employees.filter((employee) =>
    staffColumns.every((column) => {
      const query = filters[column.key].trim().toLowerCase();
      if (!query) {
        return true;
      }

      const display = staffCellText(employee, column.key).toLowerCase();
      const raw = isMoneyColumn(column.key)
        ? employee[column.key] == null
          ? ""
          : String(employee[column.key])
        : employee[column.key].toLowerCase();

      return display.includes(query) || raw.includes(query);
    }),
  );
}

export function sortStaff(
  employees: StaffEmployee[],
  key: StaffColumnKey,
  direction: SortDirection,
) {
  const factor = direction === "asc" ? 1 : -1;

  return [...employees].sort((left, right) => {
    const compared = compareEmployees(left, right, key);
    if (compared.blank) {
      return compared.blank;
    }

    if (compared.value === 0) {
      return left.fullName.localeCompare(right.fullName, undefined, {
        sensitivity: "base",
      });
    }

    return compared.value * factor;
  });
}

function compareEmployees(
  left: StaffEmployee,
  right: StaffEmployee,
  key: StaffColumnKey,
) {
  if (isMoneyColumn(key)) {
    if (left[key] == null || right[key] == null) {
      return { blank: blankLast(left[key] == null, right[key] == null), value: 0 };
    }

    return { blank: 0, value: left[key] - right[key] };
  }

  const leftValue = left[key].trim();
  const rightValue = right[key].trim();
  if (!leftValue || !rightValue) {
    return { blank: blankLast(!leftValue, !rightValue), value: 0 };
  }

  return {
    blank: 0,
    value: leftValue.localeCompare(rightValue, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  };
}

function blankLast(leftBlank: boolean, rightBlank: boolean) {
  if (leftBlank && rightBlank) {
    return 0;
  }

  return leftBlank ? 1 : -1;
}
