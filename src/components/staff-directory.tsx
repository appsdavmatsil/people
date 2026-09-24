"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DeleteConfirmDialog,
  RowActions,
  ShowArchivedButton,
  isArchived,
} from "@/components/directory-actions";
import {
  EmployeeFormDialog,
  type EmployeeFormRequest,
} from "@/components/employee-form-dialog";
import { useStaffDirectory } from "@/components/use-staff-directory";
import {
  buildStaffWorkbook,
  importStaffWorkbook,
  mergeImportedStaff,
} from "@/lib/staff-workbook";
import { useLocations } from "@/components/use-locations";
import {
  formatDate,
  formatSalary,
  type SortDirection,
  type StaffEmployee,
} from "@/lib/staff";

const secondaryButtonClass =
  "inline-flex h-9 items-center justify-center rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-60";
const primaryButtonClass =
  "inline-flex h-9 items-center justify-center rounded-lg bg-stone-950 px-3 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-60";

type Notice = {
  tone: "ok" | "error";
  text: string;
};

const directoryColumns = [
  { key: "name", label: "Name" },
  { key: "position", label: "Position" },
  { key: "salary", label: "Current Salary" },
  { key: "venue", label: "Current Venue" },
  { key: "joiningDate", label: "Joining Date" },
  { key: "dateOfBirth", label: "DOB" },
] as const;

type DirectoryColumnKey = (typeof directoryColumns)[number]["key"];
type DirectoryFilters = Record<DirectoryColumnKey, string>;

function emptyDirectoryFilters(): DirectoryFilters {
  return {
    name: "",
    position: "",
    salary: "",
    venue: "",
    joiningDate: "",
    dateOfBirth: "",
  };
}

export function StaffDirectory({ editId }: { editId?: string }) {
  const { locations } = useLocations();
  const importRef = useRef<HTMLInputElement>(null);
  const formToken = useRef(0);
  const { employees, update: setEmployees } = useStaffDirectory();
  const [filters, setFilters] = useState<DirectoryFilters>(emptyDirectoryFilters);
  const [sortKey, setSortKey] = useState<DirectoryColumnKey>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState<"import" | "export" | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [formRequest, setFormRequest] = useState<EmployeeFormRequest | null>(null);
  const [pendingDelete, setPendingDelete] = useState<StaffEmployee | null>(null);

  const archivedCount = employees.filter((employee) => isArchived(employee)).length;
  const listed = useMemo(
    () => employees.filter((employee) => showArchived || !isArchived(employee)),
    [employees, showArchived],
  );
  const filtersActive = directoryColumns.some((column) => filters[column.key].trim());
  const visible = useMemo(
    () => sortDirectory(filterDirectory(listed, filters, locations), sortKey, sortDirection, locations),
    [listed, filters, locations, sortKey, sortDirection],
  );

  function openEmployee(employee: StaffEmployee | null) {
    formToken.current += 1;
    setFormRequest({ token: formToken.current, employee });
  }

  const openedEdit = useRef<string | null>(null);
  useEffect(() => {
    if (!editId || openedEdit.current === editId) {
      return;
    }
    const employee = employees.find((item) => item.id === editId);
    if (!employee) {
      return;
    }
    openedEdit.current = editId;
    openEmployee(employee);
  }, [editId, employees]);

  function saveEmployee(employee: StaffEmployee, previousId: string | null) {
    if (previousId) {
      setEmployees((current) => current.map((item) => (item.id === previousId ? employee : item)));
      setNotice({ tone: "ok", text: `${employee.fullName} was updated.` });
      return;
    }

    setEmployees((current) => [...current, employee]);
    setNotice({ tone: "ok", text: `${employee.fullName} was added to the directory.` });
  }

  function toggleArchive(employee: StaffEmployee) {
    const archived = !isArchived(employee);
    setEmployees((current) =>
      current.map((item) => (item.id === employee.id ? { ...item, archived } : item)),
    );
    setNotice({
      tone: "ok",
      text: archived
        ? `${employeeName(employee)} was archived.`
        : `${employeeName(employee)} was restored.`,
    });
  }

  function deleteEmployee(employee: StaffEmployee) {
    setEmployees((current) => current.filter((item) => item.id !== employee.id));
    setPendingDelete(null);
    setNotice({ tone: "ok", text: `${employeeName(employee)} was deleted.` });
  }

  function toggleSort(key: DirectoryColumnKey) {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(key);
    setSortDirection("asc");
  }

  async function exportSheet() {
    setBusy("export");
    setNotice(null);
    try {
      const bytes = await buildStaffWorkbook(employees);
      downloadFile(bytes, "staff-directory.xlsx");
      setNotice({
        tone: "ok",
        text: employees.length
          ? `Exported ${employees.length} ${employees.length === 1 ? "employee" : "employees"}. Photos stay out of the sheet so it can be imported again.`
          : "Exported a blank sheet with the staff columns. Fill it in, then import it.",
      });
    } catch {
      setNotice({ tone: "error", text: "The spreadsheet could not be exported." });
    } finally {
      setBusy(null);
    }
  }

  async function importSheet(file: File | null) {
    if (!file) {
      return;
    }

    setBusy("import");
    setNotice(null);
    try {
      const result = await importStaffWorkbook(await file.arrayBuffer());
      if (result.error) {
        setNotice({ tone: "error", text: result.error });
        return;
      }

      if (result.employees.length === 0) {
        setNotice({
          tone: "error",
          text: result.skipped
            ? "No employees were imported. Each row needs a full name, or a first and last name."
            : "That sheet has the right columns, but no employee rows yet.",
        });
        return;
      }

      const merged = mergeImportedStaff(
        employees,
        result.employees,
        !result.hasEmployeeIdColumn,
      );
      setEmployees(merged.employees);
      setNotice({
        tone: "ok",
        text: staffImportNotice(
          merged.added,
          merged.updated,
          result.skipped,
          !result.hasEmployeeIdColumn,
        ),
      });
    } catch {
      setNotice({ tone: "error", text: "That spreadsheet could not be imported." });
    } finally {
      setBusy(null);
      if (importRef.current) {
        importRef.current.value = "";
      }
    }
  }

  const countLabel = filtersActive
    ? `${visible.length} of ${listed.length} ${listed.length === 1 ? "employee" : "employees"}`
    : `${listed.length} ${listed.length === 1 ? "employee" : "employees"}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-stone-500">{countLabel}</p>
          <p className="mt-1 max-w-xl text-sm text-stone-500">
            Kept on this page until you refresh. Nothing is written to the database yet. The spreadsheet includes an employee ID so importing it updates that person instead of adding a duplicate. The ID is not shown in this list. Photos stay out of the sheet.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ShowArchivedButton
            show={showArchived}
            count={archivedCount}
            onToggle={() => setShowArchived((current) => !current)}
          />
          <label className={`${secondaryButtonClass} cursor-pointer`}>
            {busy === "import" ? "Importing…" : "Import"}
            <input
              ref={importRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              disabled={busy !== null}
              onChange={(event) => void importSheet(event.target.files?.[0] ?? null)}
            />
          </label>
          <button
            type="button"
            className={secondaryButtonClass}
            disabled={busy !== null}
            onClick={() => void exportSheet()}
          >
            {busy === "export" ? "Exporting…" : "Export"}
          </button>
          <button type="button" className={primaryButtonClass} onClick={() => openEmployee(null)}>
            New employee
          </button>
        </div>
      </div>

      {notice ? (
        <p
          role="status"
          className={`mt-4 shrink-0 text-sm ${notice.tone === "error" ? "text-red-700" : "text-emerald-800"}`}
        >
          {notice.text}
        </p>
      ) : null}

      <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-stone-200 bg-white">
        <div className="min-h-0 flex-1 overflow-auto">
          <table
            className={`w-max min-w-full border-separate border-spacing-0 text-sm ${
              visible.length === 0 ? "h-full" : ""
            }`}
          >
            <caption className="sr-only">Staff directory</caption>
            <thead className="sticky top-0 z-10">
              <tr className="bg-stone-50 text-left text-xs font-medium tracking-wide text-stone-500 uppercase">
                {directoryColumns.map((column) => {
                  const active = sortKey === column.key;
                  return (
                    <th
                      key={column.key}
                      scope="col"
                      aria-sort={
                        active
                          ? sortDirection === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                      className="border-b border-stone-200 px-2 py-1 font-medium"
                    >
                      <button
                        type="button"
                        className={`flex h-8 w-full items-center gap-1.5 rounded-md px-1 whitespace-nowrap hover:text-stone-950 ${
                          column.key === "salary" ? "justify-end text-right" : "text-left"
                        }`}
                        onClick={() => toggleSort(column.key)}
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
                {directoryColumns.map((column) => (
                  <th key={column.key} className="border-b border-stone-200 px-2 py-2 font-normal">
                    <div className="flex items-center gap-2">
                      <input
                        value={filters[column.key]}
                        onChange={(event) =>
                          setFilters((current) => ({
                            ...current,
                            [column.key]: event.target.value,
                          }))
                        }
                        aria-label={`Filter ${column.label}`}
                        placeholder="Filter"
                        className="h-8 w-full min-w-24 rounded-md border border-stone-200 bg-white px-2 text-xs font-normal text-stone-950 outline-none placeholder:text-stone-400 focus:border-stone-950"
                      />
                      {column.key === "name" && filtersActive ? (
                        <button
                          type="button"
                          className="shrink-0 text-xs font-medium text-stone-600 underline-offset-4 hover:text-stone-950 hover:underline"
                          onClick={() => setFilters(emptyDirectoryFilters())}
                        >
                          Clear
                        </button>
                      ) : null}
                    </div>
                  </th>
                ))}
                <th className="border-b border-stone-200 px-2 py-2" />
              </tr>
            </thead>
            <tbody className={visible.length === 0 ? "h-full" : undefined}>
              {visible.length === 0 ? (
                <tr className="h-full">
                  <td
                    colSpan={directoryColumns.length + 1}
                    className="h-full px-4 text-center align-middle text-sm text-stone-500"
                  >
                    {listed.length === 0
                      ? employees.length === 0
                        ? "No employees yet. Add someone, or import a spreadsheet."
                        : "Archived employees are hidden."
                      : "No employees match these filters."}
                  </td>
                </tr>
              ) : (
                visible.map((employee) => (
                  <tr
                    key={employee.id}
                    className={`cursor-pointer hover:bg-stone-50 ${isArchived(employee) ? "opacity-60" : ""}`}
                    onClick={() => openEmployee(employee)}
                  >
                    {directoryColumns.map((column) => {
                      const value = directoryCell(employee, column.key, locations);
                      const salary = column.key === "salary";
                      return (
                        <td
                          key={column.key}
                          className={`border-b border-stone-100 px-3 py-2 whitespace-nowrap ${
                            salary
                              ? "text-right text-stone-950 tabular-nums"
                              : column.key === "name"
                                ? ""
                                : "text-stone-700"
                          }`}
                        >
                          {column.key === "name" ? (
                            <button
                              type="button"
                              className="font-medium text-stone-950 underline-offset-4 hover:underline"
                              onClick={() => openEmployee(employee)}
                            >
                              {value || "—"}
                            </button>
                          ) : (
                            value || "—"
                          )}
                        </td>
                      );
                    })}
                    <td className="border-b border-stone-100 px-2 py-1">
                      <RowActions
                        archived={isArchived(employee)}
                        onEdit={() => openEmployee(employee)}
                        onArchive={() => toggleArchive(employee)}
                        onDelete={() => setPendingDelete(employee)}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <EmployeeFormDialog request={formRequest} onSave={saveEmployee} />
      <DeleteConfirmDialog
        open={pendingDelete != null}
        title="Delete employee"
        message={
          pendingDelete
            ? `Delete ${employeeName(pendingDelete)}? This removes them from the directory.`
            : ""
        }
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) {
            deleteEmployee(pendingDelete);
          }
        }}
      />
    </div>
  );
}

function staffImportNotice(
  added: number,
  updated: number,
  skipped: number,
  matchedByName: boolean,
) {
  const updatedLabel = `${updated} ${updated === 1 ? "employee" : "employees"}`;
  const addedLabel = `${added} new ${added === 1 ? "employee" : "employees"}`;
  let text = "Added " + addedLabel + ".";
  if (updated && added) {
    text = `Updated ${updatedLabel} and added ${addedLabel}.`;
  } else if (updated) {
    text = `Updated ${updatedLabel}.`;
  }

  if (matchedByName) {
    text +=
      " This sheet had no employee ID column, so a row updates someone only when that name belongs to one employee. Export again so each row keeps its employee ID.";
  }

  if (skipped) {
    text += ` ${skipped} ${skipped === 1 ? "row was" : "rows were"} skipped because a name was missing.`;
  }

  return text;
}

function employeeName(employee: StaffEmployee) {
  const name = `${employee.firstName} ${employee.lastName}`.trim();
  return name || employee.fullName.trim();
}

function venueNickname(
  employee: StaffEmployee,
  locations: { nickname: string; venueName: string }[],
) {
  const venue = employee.venue.trim().toLowerCase();
  if (!venue) {
    return "";
  }

  const match = locations.find(
    (location) =>
      location.venueName.trim().toLowerCase() === venue ||
      location.nickname.trim().toLowerCase() === venue,
  );
  return match?.nickname || employee.venue;
}

function directoryCell(
  employee: StaffEmployee,
  key: DirectoryColumnKey,
  locations: { nickname: string; venueName: string }[],
) {
  if (key === "name") {
    return employeeName(employee);
  }

  if (key === "position") {
    return employee.position;
  }

  if (key === "salary") {
    return employee.salary == null ? "" : formatSalary(employee.salary);
  }

  if (key === "venue") {
    return venueNickname(employee, locations);
  }

  return employee[key] ? formatDate(employee[key]) : "";
}

function filterDirectory(
  employees: StaffEmployee[],
  filters: DirectoryFilters,
  locations: { nickname: string; venueName: string }[],
) {
  return employees.filter((employee) =>
    directoryColumns.every((column) => {
      const query = filters[column.key].trim().toLowerCase();
      if (!query) {
        return true;
      }

      const display = directoryCell(employee, column.key, locations).toLowerCase();
      const raw =
        column.key === "name"
          ? `${employee.fullName} ${employee.firstName} ${employee.lastName}`.toLowerCase()
          : column.key === "salary"
            ? employee.salary == null
              ? ""
              : String(employee.salary)
            : column.key === "venue"
              ? `${venueNickname(employee, locations)} ${employee.venue}`.toLowerCase()
              : column.key === "position"
                ? employee.position.toLowerCase()
                : employee[column.key].toLowerCase();

      return display.includes(query) || raw.includes(query);
    }),
  );
}

function sortDirectory(
  employees: StaffEmployee[],
  key: DirectoryColumnKey,
  direction: SortDirection,
  locations: { nickname: string; venueName: string }[],
) {
  const factor = direction === "asc" ? 1 : -1;

  return [...employees].sort((left, right) => {
    const compared = compareDirectory(left, right, key, locations);
    if (compared.blank) {
      return compared.blank;
    }

    if (compared.value === 0) {
      return employeeName(left).localeCompare(employeeName(right), undefined, {
        sensitivity: "base",
      });
    }

    return compared.value * factor;
  });
}

function compareDirectory(
  left: StaffEmployee,
  right: StaffEmployee,
  key: DirectoryColumnKey,
  locations: { nickname: string; venueName: string }[],
) {
  if (key === "salary") {
    if (left.salary == null || right.salary == null) {
      return { blank: blankLast(left.salary == null, right.salary == null), value: 0 };
    }

    return { blank: 0, value: left.salary - right.salary };
  }

  const leftValue =
    key === "name"
      ? employeeName(left)
      : key === "venue"
        ? venueNickname(left, locations)
        : key === "position"
          ? left.position.trim()
          : left[key].trim();
  const rightValue =
    key === "name"
      ? employeeName(right)
      : key === "venue"
        ? venueNickname(right, locations)
        : key === "position"
          ? right.position.trim()
          : right[key].trim();

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
        <path d="M1 4.2 4 1.2l3 3" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M1 .8 4 3.8l3-3" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

function downloadFile(bytes: Uint8Array, filename: string) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const url = URL.createObjectURL(
    new Blob([copy.buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
