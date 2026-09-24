"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DeleteConfirmDialog,
  RowActions,
  ShowArchivedButton,
  isArchived,
} from "@/components/directory-actions";
import { DateField } from "@/components/date-field";
import { useDirectoryLookups } from "@/components/use-directory-lookups";
import { usePromotions } from "@/components/use-promotions";
import { useStaffDirectory } from "@/components/use-staff-directory";
import { downloadWorkbook } from "@/lib/download-workbook";
import { buildPromotionsWorkbook, importPromotionsWorkbook } from "@/lib/promotions-workbook";
import {
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
  const rows = useMemo(
    () =>
      [...promotions]
        .filter((promotion) => showArchived || !isArchived(promotion))
        .sort((left, right) => right.effectiveDate.localeCompare(left.effectiveDate)),
    [promotions, showArchived],
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

  const countLabel = `${rows.length} ${rows.length === 1 ? "promotion" : "promotions"}`;

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
            ? "No promotions were imported. Each row needs a staff member, a new position, a salary package, and an effective date."
            : "That sheet has the right columns, but no rows yet.",
        });
        return;
      }

      const linked = result.promotions.map((promotion) => {
        const employee = staff.find(
          (item) => item.fullName.trim().toLowerCase() === promotion.staffName.toLowerCase(),
        );
        return employee ? { ...promotion, staffId: employee.id } : promotion;
      });
      update((current) => [...linked, ...current]);

      const skipped = result.skipped
        ? ` ${result.skipped} ${result.skipped === 1 ? "row was" : "rows were"} skipped.`
        : "";
      setNotice({
        tone: "ok",
        text: `Imported ${linked.length} ${linked.length === 1 ? "promotion" : "promotions"}.${skipped}`,
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-stone-500">{countLabel}</p>
          <p className="mt-1 max-w-xl text-sm text-stone-500">
            Saved in this browser, so they stay after a refresh. A future date stays on the
            location card until that day, then the in-house salary updates.
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
          <thead className="sticky top-0 bg-stone-50 text-stone-500">
            <tr>
              <th className="border-b border-stone-200 px-3 py-2 font-medium">Staff member</th>
              <th className="border-b border-stone-200 px-3 py-2 font-medium">Current position</th>
              <th className="border-b border-stone-200 px-3 py-2 font-medium">Current salary</th>
              <th className="border-b border-stone-200 px-3 py-2 font-medium">New position</th>
              <th className="border-b border-stone-200 px-3 py-2 font-medium">New salary package</th>
              <th className="border-b border-stone-200 px-3 py-2 font-medium">Effective date</th>
              <th className="border-b border-stone-200 px-3 py-2 text-right font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-stone-500">
                  {promotions.length === 0
                    ? "No promotions yet. Record one, or import a spreadsheet."
                    : "Archived promotions are hidden."}
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
                  <td className="border-b border-stone-100 px-3 py-2 text-stone-700 tabular-nums">
                    {promotion.currentSalary == null ? "—" : formatSalary(promotion.currentSalary)}
                  </td>
                  <td className="border-b border-stone-100 px-3 py-2 text-stone-700">
                    {promotion.newPosition}
                  </td>
                  <td className="border-b border-stone-100 px-3 py-2 text-stone-700 tabular-nums">
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
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            event.currentTarget.close();
          }
        }}
      >
        <form onSubmit={recordPromotion} className="flex max-h-[calc(100dvh-2rem)] flex-col">
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-stone-200 px-5 py-4">
            <div>
              <h2 id="new-promotion-title" className="text-base font-semibold tracking-tight">
                {editingId ? "Edit promotion" : "New promotion"}
              </h2>
              <p className="mt-1 text-sm text-stone-500">
                {editingId
                  ? "Change any of the details. The directory updates on the effective date."
                  : "A promotion or an increment. It updates the directory on the effective date."}
              </p>
            </div>
            <button
              type="button"
              className="flex size-8 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-950"
              aria-label="Close"
              onClick={() => dialogRef.current?.close()}
            >
              <CloseIcon />
            </button>
          </div>

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

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M3 3l8 8M11 3 3 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
