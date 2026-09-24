"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DeleteConfirmDialog,
  DialogHeading,
  PencilIcon,
  PlusIcon,
  RowActions,
  ShowArchivedButton,
  isArchived,
} from "@/components/directory-actions";
import { DateField, keepDialogForDatePicker } from "@/components/date-field";
import {
  blankColumnFilters,
  ColumnSortFilterHeaders,
} from "@/components/table-column-controls";
import { useDirectoryLookups } from "@/components/use-directory-lookups";
import { usePromotions } from "@/components/use-promotions";
import { useStaffDirectory } from "@/components/use-staff-directory";
import { downloadWorkbook } from "@/lib/download-workbook";
import { buildPromotionsWorkbook, importPromotionsWorkbook } from "@/lib/promotions-workbook";
import {
  linkPromotionToStaff,
  mergeImportedPromotions,
  settleDuePromotions,
  todayIso,
  type StaffPromotion,
} from "@/lib/promotions";
import {
  formatDate,
  formatSalary,
  parseMoneyInput,
  roundMoney,
  splitSalary,
  type SortDirection,
} from "@/lib/staff";

const fieldClass =
  "mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-950 outline-none focus:border-stone-950";
const secondaryButtonClass =
  "inline-flex h-9 items-center justify-center rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-60";
const primaryButtonClass =
  "inline-flex h-9 items-center justify-center rounded-lg bg-stone-950 px-3 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-60";

const keptPositionValue = "__kept__";

const emptyForm = {
  staffId: "",
  currentPosition: "",
  currentSalary: "",
  newPositionId: "",
  newPosition: "",
  newSalary: "",
  effectiveDate: "",
};

type Notice = {
  tone: "ok" | "error";
  text: string;
};

const promotionColumns = [
  { key: "staffName", label: "Staff member" },
  { key: "currentPosition", label: "Current position" },
  { key: "currentSalary", label: "Current salary" },
  { key: "newPosition", label: "New position" },
  { key: "newSalary", label: "New salary package" },
  { key: "effectiveDate", label: "Effective date" },
] as const;

type PromotionColumnKey = (typeof promotionColumns)[number]["key"];

export function Promotions() {
  const { lookups } = useDirectoryLookups();
  const { employees, update: updateEmployees } = useStaffDirectory();
  const { promotions, update } = usePromotions();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState<"import" | "export" | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [filters, setFilters] = useState(() => blankColumnFilters(promotionColumns));
  const [sortKey, setSortKey] = useState<PromotionColumnKey>("effectiveDate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [pendingDelete, setPendingDelete] = useState<StaffPromotion | null>(null);
  const staff = useMemo(
    () =>
      [...employees]
        .filter((employee) => !isArchived(employee))
        .sort((left, right) =>
          left.fullName.localeCompare(right.fullName, undefined, { sensitivity: "base" }),
        ),
    [employees],
  );
  const positionGroups = useMemo(
    () =>
      lookups.departments
        .map((department) => ({
          department,
          positions: lookups.positions.filter(
            (position) => position.departmentId === department.id,
          ),
        }))
        .filter((group) => group.positions.length > 0),
    [lookups.departments, lookups.positions],
  );
  const archivedCount = promotions.filter((promotion) => isArchived(promotion)).length;
  const listed = useMemo(
    () => promotions.filter((promotion) => showArchived || !isArchived(promotion)),
    [promotions, showArchived],
  );
  const filtersActive = promotionColumns.some((column) => filters[column.key].trim());
  const rows = useMemo(
    () => sortPromotions(filterPromotions(listed, filters), sortKey, sortDirection),
    [listed, filters, sortKey, sortDirection],
  );

  useEffect(() => {
    const settled = settleDuePromotions(promotions, employees);
    if (!settled) {
      return;
    }

    update(settled.promotions);
    if (settled.employeesChanged) {
      updateEmployees(settled.employees);
    }
  }, [employees, promotions, update, updateEmployees]);

  const countLabel = filtersActive
    ? `${rows.length} of ${listed.length} ${listed.length === 1 ? "promotion" : "promotions"}`
    : `${listed.length} ${listed.length === 1 ? "promotion" : "promotions"}`;

  function toggleSort(key: PromotionColumnKey) {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(key);
    setSortDirection(key === "effectiveDate" ? "desc" : "asc");
  }

  function openDialog() {
    setEditingId(null);
    setForm({ ...emptyForm, effectiveDate: todayIso() });
    setFormError("");
    dialogRef.current?.showModal();
  }

  function openPromotion(promotion: StaffPromotion) {
    const match = lookups.positions.find(
      (position) => position.name.toLowerCase() === promotion.newPosition.trim().toLowerCase(),
    );
    setEditingId(promotion.id);
    setForm({
      staffId: promotion.staffId,
      currentPosition: promotion.currentPosition,
      currentSalary: promotion.currentSalary == null ? "" : String(promotion.currentSalary),
      newPositionId: match?.id ?? (promotion.newPosition ? keptPositionValue : ""),
      newPosition: promotion.newPosition,
      newSalary: String(promotion.newSalary),
      effectiveDate: promotion.effectiveDate,
    });
    setFormError("");
    dialogRef.current?.showModal();
  }

  function selectStaff(staffId: string) {
    const employee = staff.find((item) => item.id === staffId);
    const currentPosition = employee?.position.trim() ?? "";
    const position = lookups.positions.find(
      (item) => item.name.toLowerCase() === currentPosition.toLowerCase(),
    );
    setForm((current) => ({
      ...current,
      staffId,
      currentPosition,
      currentSalary: employee?.salary == null ? "" : String(employee.salary),
      newPositionId: position?.id ?? (currentPosition ? keptPositionValue : ""),
      newPosition: currentPosition,
      newSalary: position?.defaultSalary == null ? "" : String(position.defaultSalary),
    }));
  }

  function selectPosition(positionId: string) {
    if (positionId === keptPositionValue) {
      setForm((current) => ({
        ...current,
        newPositionId: keptPositionValue,
        newPosition: current.currentPosition.trim() || current.newPosition,
      }));
      return;
    }

    const next = lookups.positions.find((position) => position.id === positionId);
    setForm((current) => ({
      ...current,
      newPositionId: positionId,
      newPosition: next?.name ?? "",
      newSalary: next?.defaultSalary == null ? "" : String(next.defaultSalary),
    }));
  }

  function recordPromotion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const employee = staff.find((item) => item.id === form.staffId);
    const previous = promotions.find((item) => item.id === editingId) ?? null;
    const staffName = employee?.fullName ?? previous?.staffName ?? "";
    const newPosition = form.newPosition.trim().replace(/\s+/g, " ");
    const currentPosition = form.currentPosition.trim().replace(/\s+/g, " ");
    const currentSalary = parseMoneyInput(form.currentSalary);
    const newSalary = parseMoneyInput(form.newSalary);
    if (!staffName || (!employee && !previous)) {
      setFormError("Choose a staff member.");
      return;
    }

    if (!newPosition) {
      setFormError("Choose a new position.");
      return;
    }

    if (form.currentSalary.trim() && (currentSalary == null || currentSalary < 0)) {
      setFormError("Enter a current salary of zero or more.");
      return;
    }

    if (newSalary == null || newSalary < 0) {
      setFormError("Enter a salary package of zero or more.");
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.effectiveDate)) {
      setFormError("Choose an effective date.");
      return;
    }

    const packageAmount = roundMoney(newSalary);
    const samePosition = newPosition.toLowerCase() === currentPosition.toLowerCase();
    const sameSalary = currentSalary != null && roundMoney(currentSalary) === packageAmount;
    if (samePosition && sameSalary) {
      setFormError("Change the position or the salary package.");
      return;
    }

    const due = form.effectiveDate <= todayIso();
    const promotion: StaffPromotion = {
      id: editingId ?? crypto.randomUUID(),
      staffId: employee?.id ?? previous?.staffId ?? "",
      staffName,
      currentPosition,
      currentSalary: currentSalary == null ? null : roundMoney(currentSalary),
      newPosition,
      newSalary: packageAmount,
      effectiveDate: form.effectiveDate,
      applied: due,
    };
    const nextPromotions = editingId
      ? promotions.map((item) => (item.id === editingId ? promotion : item))
      : [promotion, ...promotions];
    update(nextPromotions);
    const affected = new Set(
      [promotion.staffId, previous?.staffId ?? ""].filter((id) => id.length > 0),
    );
    if (affected.size > 0) {
      updateEmployees((current) =>
        current.map((item) => {
          if (!affected.has(item.id)) {
            return item;
          }

          const latest = latestDuePromotion(nextPromotions, item.id);
          if (latest) {
            const pay = splitSalary(latest.newSalary);
            if (item.position === latest.newPosition && item.salary === pay.salary) {
              return item;
            }

            return { ...item, position: latest.newPosition, ...pay };
          }

          if (
            previous &&
            previous.staffId === item.id &&
            previous.applied &&
            item.position === previous.newPosition &&
            item.salary === previous.newSalary
          ) {
            if (previous.currentSalary == null) {
              return { ...item, position: previous.currentPosition };
            }

            return {
              ...item,
              position: previous.currentPosition,
              ...splitSalary(previous.currentSalary),
            };
          }

          return item;
        }),
      );
    }
    setNotice({
      tone: "ok",
      text: editingId
        ? `${staffName}'s promotion was updated.`
        : due
          ? `${staffName} now shows ${newPosition} at ${formatSalary(packageAmount)}.`
          : `${staffName}'s promotion to ${newPosition} at ${formatSalary(packageAmount)} takes effect ${formatDate(form.effectiveDate)}.`,
    });
    dialogRef.current?.close();
  }

  function toggleArchive(promotion: StaffPromotion) {
    const archived = !isArchived(promotion);
    update((current) =>
      current.map((item) => (item.id === promotion.id ? { ...item, archived } : item)),
    );
    setNotice({
      tone: "ok",
      text: archived
        ? `${promotion.staffName}'s promotion was archived.`
        : `${promotion.staffName}'s promotion was restored.`,
    });
  }

  function deletePromotion(promotion: StaffPromotion) {
    update((current) => current.filter((item) => item.id !== promotion.id));
    setPendingDelete(null);
    setNotice({ tone: "ok", text: `${promotion.staffName}'s promotion was deleted.` });
  }

  async function exportSheet() {
    setBusy("export");
    setNotice(null);
    try {
      const bytes = await buildPromotionsWorkbook(rows);
      downloadWorkbook(bytes, "promotions.xlsx");
      setNotice({
        tone: "ok",
        text: promotions.length
          ? `Exported ${promotions.length} ${promotions.length === 1 ? "promotion" : "promotions"}.`
          : "Exported a blank sheet with the promotion columns. Fill it in, then import it.",
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
      const result = await importPromotionsWorkbook(await file.arrayBuffer());
      if (result.error) {
        setNotice({ tone: "error", text: result.error });
        return;
      }

      if (result.promotions.length === 0) {
        setNotice({
          tone: "error",
          text: result.skipped
            ? "No promotions were imported. Each row needs an employee ID or staff member, a new position, a salary package, and an effective date."
            : "That sheet has the right columns, but no rows yet.",
        });
        return;
      }

      const linked: StaffPromotion[] = [];
      let unresolved = 0;
      for (const promotion of result.promotions) {
        const next = linkPromotionToStaff(promotion, employees);
        if (!next.staffName.trim()) {
          unresolved += 1;
          continue;
        }

        linked.push(next);
      }

      if (linked.length === 0) {
        setNotice({
          tone: "error",
          text: "No promotions were imported. Each row needs an employee ID or staff member, a new position, a salary package, and an effective date.",
        });
        return;
      }

      const merged = mergeImportedPromotions(promotions, linked);
      update(merged.promotions);

      const skipped = result.skipped + unresolved;
      const addedLabel = `${merged.added} ${merged.added === 1 ? "promotion" : "promotions"}`;
      const updatedLabel = `${merged.updated} existing ${merged.updated === 1 ? "promotion" : "promotions"}`;
      let text = `Imported ${addedLabel}.`;
      if (merged.added && merged.updated) {
        text = `Added ${addedLabel} and updated ${updatedLabel}.`;
      } else if (merged.updated) {
        text = `Updated ${updatedLabel}.`;
      }
      if (skipped) {
        text += ` ${skipped} ${skipped === 1 ? "row was" : "rows were"} skipped.`;
      }
      setNotice({ tone: "ok", text });
    } catch {
      setNotice({ tone: "error", text: "That spreadsheet could not be imported." });
    } finally {
      setBusy(null);
      if (importRef.current) {
        importRef.current.value = "";
      }
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-stone-500">{countLabel}</p>
          <p className="mt-1 max-w-xl text-sm text-stone-500">
            Saved in this browser, so they stay after a refresh. A future date stays on the
            location card until that day, then the in-house salary updates. The spreadsheet
            includes each employee ID so a promotion stays attached to the right person.
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
          <button type="button" className={primaryButtonClass} onClick={openDialog}>
            New promotion
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

      <div className="mt-4 min-h-0 flex-1 overflow-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full border-separate border-spacing-0 text-left text-sm">
          <thead className="sticky top-0 z-10">
            <ColumnSortFilterHeaders
              columns={promotionColumns}
              sortKey={sortKey}
              sortDirection={sortDirection}
              onSort={toggleSort}
              filters={filters}
              onFilter={(key, value) =>
                setFilters((current) => ({
                  ...current,
                  [key]: value,
                }))
              }
              filtersActive={filtersActive}
              onClear={() => setFilters(blankColumnFilters(promotionColumns))}
              endAligned={(key) => key === "currentSalary" || key === "newSalary"}
            />
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-stone-500">
                  {listed.length === 0
                    ? promotions.length === 0
                      ? "No promotions yet. Record one, or import a spreadsheet."
                      : "Archived promotions are hidden."
                    : "No promotions match these filters."}
                </td>
              </tr>
            ) : (
              rows.map((promotion) => (
                <tr
                  key={promotion.id}
                  className={`cursor-pointer hover:bg-stone-50 ${isArchived(promotion) ? "opacity-60" : ""}`}
                  onClick={() => openPromotion(promotion)}
                >
                  <td className="border-b border-stone-100 px-3 py-2 font-medium text-stone-950">
                    {promotion.staffName}
                  </td>
                  <td className="border-b border-stone-100 px-3 py-2 text-stone-700">
                    {promotion.currentPosition || "—"}
                  </td>
                  <td className="border-b border-stone-100 px-3 py-2 text-right text-stone-950 tabular-nums">
                    {promotion.currentSalary == null ? "—" : formatSalary(promotion.currentSalary)}
                  </td>
                  <td className="border-b border-stone-100 px-3 py-2 text-stone-700">
                    {promotion.newPosition}
                  </td>
                  <td className="border-b border-stone-100 px-3 py-2 text-right text-stone-950 tabular-nums">
                    {formatSalary(promotion.newSalary)}
                  </td>
                  <td className="border-b border-stone-100 px-3 py-2 text-stone-700">
                    {formatDate(promotion.effectiveDate)}
                  </td>
                  <td className="border-b border-stone-100 px-2 py-1">
                    <RowActions
                      archived={isArchived(promotion)}
                      onEdit={() => openPromotion(promotion)}
                      onArchive={() => toggleArchive(promotion)}
                      onDelete={() => setPendingDelete(promotion)}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <dialog
        ref={dialogRef}
        aria-labelledby="new-promotion-title"
        className="m-auto h-fit max-h-[calc(100dvh-2rem)] w-[min(100%-2rem,40rem)] overflow-hidden rounded-2xl border border-stone-200 bg-white p-0 text-stone-950 shadow-xl backdrop:bg-stone-950/40"
        onCancel={(event) => {
          if (keepDialogForDatePicker(event.currentTarget)) {
            event.preventDefault();
          }
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget || keepDialogForDatePicker(event.currentTarget)) {
            return;
          }
          event.currentTarget.close();
        }}
      >
        <form onSubmit={recordPromotion} className="flex max-h-[calc(100dvh-2rem)] flex-col">
          <DialogHeading
            titleId="new-promotion-title"
            title={editingId ? "Edit promotion" : "New promotion"}
            description={
              editingId
                ? "Change any of the details. The directory updates on the effective date."
                : "A promotion or an increment. It updates the directory on the effective date."
            }
            icon={editingId ? <PencilIcon /> : <PlusIcon />}
            onClose={() => dialogRef.current?.close()}
          />

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <label className="block text-sm font-medium text-stone-800">
              Staff member
              <select
                value={form.staffId}
                onChange={(event) => selectStaff(event.target.value)}
                required
                autoFocus
                className={fieldClass}
              >
                <option value="">Select a staff member</option>
                {form.staffId && !staff.some((employee) => employee.id === form.staffId) ? (
                  <option value={form.staffId}>
                    {promotions.find((item) => item.id === editingId)?.staffName ?? "Former staff"}
                  </option>
                ) : null}
                {staff.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.fullName}
                  </option>
                ))}
              </select>
            </label>
            {staff.length === 0 ? (
              <p className="text-sm text-stone-500">Add in-house staff before recording a promotion.</p>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-stone-800">
                Current position
                <input
                  value={form.currentPosition}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, currentPosition: event.target.value }))
                  }
                  className={fieldClass}
                />
              </label>
              <label className="block text-sm font-medium text-stone-800">
                Current salary
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.currentSalary}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, currentSalary: event.target.value }))
                  }
                  placeholder="0.00"
                  className={fieldClass}
                />
              </label>
            </div>
            <label className="block text-sm font-medium text-stone-800">
              New position
              {positionGroups.length > 0 ? (
                <select
                  value={form.newPositionId}
                  onChange={(event) => selectPosition(event.target.value)}
                  required
                  className={fieldClass}
                >
                  <option value="">Select a position</option>
                  {form.newPositionId === keptPositionValue && form.newPosition ? (
                    <option value={keptPositionValue}>{form.newPosition}</option>
                  ) : null}
                  {positionGroups.map((group) => (
                    <optgroup key={group.department.id} label={group.department.name}>
                      {group.positions.map((position) => (
                        <option key={position.id} value={position.id}>
                          {position.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              ) : (
                <input
                  value={form.newPosition}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      newPositionId: "",
                      newPosition: event.target.value,
                    }))
                  }
                  required
                  className={fieldClass}
                />
              )}
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-stone-800">
                New salary package
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.newSalary}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, newSalary: event.target.value }))
                  }
                  required
                  placeholder="0.00"
                  className={fieldClass}
                />
              </label>
              <label className="block text-sm font-medium text-stone-800">
                Effective date
                <DateField
                  value={form.effectiveDate}
                  onChange={(effectiveDate) => setForm((current) => ({ ...current, effectiveDate }))}
                />
              </label>
            </div>
            {formError ? <p className="text-sm text-red-700">{formError}</p> : null}
          </div>

          <div className="flex shrink-0 justify-end gap-2 border-t border-stone-200 px-5 py-4">
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={() => dialogRef.current?.close()}
            >
              Cancel
            </button>
            <button type="submit" className={primaryButtonClass} disabled={staff.length === 0 && !editingId}>
              {editingId ? "Save promotion" : "Record promotion"}
            </button>
          </div>
        </form>
      </dialog>
      <DeleteConfirmDialog
        open={pendingDelete != null}
        title="Delete promotion"
        message={
          pendingDelete
            ? `Delete ${pendingDelete.staffName}'s promotion to ${pendingDelete.newPosition}?`
            : ""
        }
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) {
            deletePromotion(pendingDelete);
          }
        }}
      />
    </div>
  );
}

function promotionCell(promotion: StaffPromotion, key: PromotionColumnKey) {
  if (key === "currentSalary") {
    return promotion.currentSalary == null ? "" : formatSalary(promotion.currentSalary);
  }

  if (key === "newSalary") {
    return formatSalary(promotion.newSalary);
  }

  if (key === "effectiveDate") {
    return formatDate(promotion.effectiveDate);
  }

  return promotion[key];
}

function filterPromotions(
  promotions: StaffPromotion[],
  filters: Record<PromotionColumnKey, string>,
) {
  return promotions.filter((promotion) =>
    promotionColumns.every((column) => {
      const query = filters[column.key].trim().toLowerCase();
      if (!query) {
        return true;
      }

      const display = promotionCell(promotion, column.key).toLowerCase();
      const raw =
        column.key === "currentSalary"
          ? promotion.currentSalary == null
            ? ""
            : String(promotion.currentSalary)
          : column.key === "newSalary"
            ? String(promotion.newSalary)
            : column.key === "effectiveDate"
              ? promotion.effectiveDate.toLowerCase()
              : promotion[column.key].toLowerCase();
      return display.includes(query) || raw.includes(query);
    }),
  );
}

function sortPromotions(
  promotions: StaffPromotion[],
  key: PromotionColumnKey,
  direction: SortDirection,
) {
  const factor = direction === "asc" ? 1 : -1;

  return [...promotions].sort((left, right) => {
    const compared = comparePromotions(left, right, key);
    if (compared.blank) {
      return compared.blank;
    }

    if (compared.value === 0) {
      const byDate = right.effectiveDate.localeCompare(left.effectiveDate);
      if (byDate !== 0) {
        return byDate;
      }

      return left.staffName.localeCompare(right.staffName, undefined, { sensitivity: "base" });
    }

    return compared.value * factor;
  });
}

function comparePromotions(left: StaffPromotion, right: StaffPromotion, key: PromotionColumnKey) {
  if (key === "currentSalary" || key === "newSalary") {
    const leftValue = left[key];
    const rightValue = right[key];
    if (leftValue == null || rightValue == null) {
      return { blank: blankLast(leftValue == null, rightValue == null), value: 0 };
    }

    return { blank: 0, value: leftValue - rightValue };
  }

  const leftValue = (key === "effectiveDate" ? left.effectiveDate : left[key]).trim();
  const rightValue = (key === "effectiveDate" ? right.effectiveDate : right[key]).trim();
  if (!leftValue || !rightValue) {
    return { blank: blankLast(!leftValue, !rightValue), value: 0 };
  }

  return {
    blank: 0,
    value: leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: "base" }),
  };
}

function blankLast(leftBlank: boolean, rightBlank: boolean) {
  if (leftBlank && rightBlank) {
    return 0;
  }

  return leftBlank ? 1 : -1;
}

function latestDuePromotion(promotions: StaffPromotion[], staffId: string) {
  const today = todayIso();
  return promotions.reduce<StaffPromotion | null>((latest, promotion) => {
    if (promotion.staffId !== staffId || promotion.effectiveDate > today) {
      return latest;
    }

    if (!latest || promotion.effectiveDate >= latest.effectiveDate) {
      return promotion;
    }

    return latest;
  }, null);
}

