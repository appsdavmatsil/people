"use client";

import { useMemo, useRef, useState } from "react";
import {
  DeleteConfirmDialog,
  DialogHeading,
  HireIcon,
  IconButton,
  PencilIcon,
  PlusIcon,
  RowActions,
  ShowArchivedButton,
  isArchived,
} from "@/components/directory-actions";
import {
  EmployeeFormDialog,
  type EmployeeFormRequest,
  type EmployeeFormSeed,
} from "@/components/employee-form-dialog";
import { useDirectoryLookups } from "@/components/use-directory-lookups";
import { useHiring } from "@/components/use-hiring";
import { useLocations } from "@/components/use-locations";
import { useOutsourced } from "@/components/use-outsourced";
import { useStaffDirectory } from "@/components/use-staff-directory";
import { columnOrderKey, getBoardOrderSnapshot, saveBoardOrder } from "@/lib/board-order";
import { downloadWorkbook } from "@/lib/download-workbook";
import {
  hiringStatuses,
  hiringStatusLabel,
  type HiringRole,
  type HiringStatus,
} from "@/lib/hiring";
import { buildHiringWorkbook, importHiringWorkbook } from "@/lib/hiring-workbook";
import { type OutsourcedPerson } from "@/lib/outsourced";
import { formatSalary, splitSalary, type StaffEmployee } from "@/lib/staff";

const fieldClass =
  "mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-950 outline-none focus:border-stone-950";
const secondaryButtonClass =
  "inline-flex h-9 items-center justify-center rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-60";
const primaryButtonClass =
  "inline-flex h-9 items-center justify-center rounded-lg bg-stone-950 px-3 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-60";

const emptyOutsourcedForm = {
  fullName: "",
  company: "",
  positionId: "",
  position: "",
  venueId: "",
  venue: "",
};

const emptyForm = {
  positionId: "",
  position: "",
  departmentId: "",
  department: "",
  venueId: "",
  venue: "",
  openings: "1",
  status: "open" as HiringStatus,
};

type Notice = {
  tone: "ok" | "error";
  text: string;
};

export function HiringPositions() {
  const { lookups } = useDirectoryLookups();
  const { locations } = useLocations();
  const { roles, update } = useHiring();
  const { update: updateEmployees } = useStaffDirectory();
  const { update: updateOutsourced } = useOutsourced();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const kindRef = useRef<HTMLDialogElement>(null);
  const outsourcedRef = useRef<HTMLDialogElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const formToken = useRef(0);
  const keepHire = useRef(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState<"import" | "export" | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<HiringRole | null>(null);
  const [hireRole, setHireRole] = useState<HiringRole | null>(null);
  const [employeeRequest, setEmployeeRequest] = useState<EmployeeFormRequest | null>(null);
  const [outsourcedForm, setOutsourcedForm] = useState(emptyOutsourcedForm);
  const [outsourcedError, setOutsourcedError] = useState("");
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

  const archivedCount = roles.filter((role) => isArchived(role)).length;
  const visible = roles.filter((role) => showArchived || !isArchived(role));
  const countLabel = `${visible.length} ${visible.length === 1 ? "position" : "positions"}`;

  function openDialog() {
    setEditingId(null);
    setForm(emptyForm);
    setFormError("");
    dialogRef.current?.showModal();
  }

  function openRole(role: HiringRole) {
    const position = lookups.positions.find(
      (item) => item.name.trim().toLowerCase() === role.position.trim().toLowerCase(),
    );
    const department = lookups.departments.find(
      (item) => item.name.trim().toLowerCase() === role.department.trim().toLowerCase(),
    );
    const venue = locations.find(
      (item) =>
        item.venueName.trim().toLowerCase() === role.venue.trim().toLowerCase() ||
        item.nickname.trim().toLowerCase() === role.venue.trim().toLowerCase(),
    );
    setEditingId(role.id);
    setForm({
      positionId: position?.id ?? "",
      position: role.position,
      departmentId: department?.id ?? position?.departmentId ?? "",
      department: role.department,
      venueId: venue?.id ?? "",
      venue: venue?.venueName || role.venue,
      openings: String(role.openings),
      status: role.status,
    });
    setFormError("");
    dialogRef.current?.showModal();
  }

  function selectVenue(venueId: string) {
    const next = locations.find((location) => location.id === venueId);
    setForm((current) => ({
      ...current,
      venueId,
      venue: next?.venueName ?? "",
    }));
  }

  function selectPosition(positionId: string) {
    const next = lookups.positions.find((position) => position.id === positionId);
    const department = lookups.departments.find((item) => item.id === next?.departmentId);
    setForm((current) => ({
      ...current,
      positionId,
      position: next?.name ?? "",
      departmentId: department?.id ?? "",
      department: department?.name ?? current.department,
    }));
  }

  function selectDepartment(departmentId: string) {
    const next = lookups.departments.find((department) => department.id === departmentId);
    setForm((current) => ({
      ...current,
      departmentId,
      department: next?.name ?? "",
    }));
  }

  function addRole(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const position = form.position.trim();
    const department = form.department.trim();
    const venue = form.venue.trim();
    const openings = Number(form.openings);
    if (!position || !department || !venue) {
      setFormError("Enter a position, department, and venue.");
      return;
    }

    if (!Number.isInteger(openings) || openings < 0) {
      setFormError("Openings needs to be a whole number.");
      return;
    }

    const previous = roles.find((item) => item.id === editingId) ?? null;
    const role: HiringRole = {
      id: editingId ?? crypto.randomUUID(),
      position,
      department,
      venue,
      openings,
      status: form.status,
      salary: previous?.salary ?? null,
      archived: previous?.archived,
    };
    if (editingId) {
      update((current) => current.map((item) => (item.id === editingId ? role : item)));
      setNotice({ tone: "ok", text: `${role.position} was updated.` });
    } else {
      update((current) => [...current, role]);
      setNotice({ tone: "ok", text: `${role.position} was added.` });
    }
    dialogRef.current?.close();
  }

  function toggleArchive(role: HiringRole) {
    const archived = !isArchived(role);
    update((current) =>
      current.map((item) => (item.id === role.id ? { ...item, archived } : item)),
    );
    setNotice({
      tone: "ok",
      text: archived ? `${role.position} was archived.` : `${role.position} was restored.`,
    });
  }

  function deleteRole(role: HiringRole) {
    update((current) => current.filter((item) => item.id !== role.id));
    setPendingDelete(null);
    setNotice({ tone: "ok", text: `${role.position} was deleted.` });
  }

  function openHire(role: HiringRole) {
    setHireRole(role);
    kindRef.current?.showModal();
  }

  function chooseHireKind(kind: "in-house" | "outsourced") {
    const role = hireRole;
    if (!role) {
      return;
    }

    keepHire.current = true;
    kindRef.current?.close();
    if (kind === "in-house") {
      formToken.current += 1;
      setEmployeeRequest({
        token: formToken.current,
        employee: null,
        seed: seedFromRole(role),
        description: `This replaces the ${role.position} hiring card on the location board.`,
      });
      return;
    }

    const position = lookups.positions.find(
      (item) => item.name.trim().toLowerCase() === role.position.trim().toLowerCase(),
    );
    const venue = locations.find((item) => sameText(item.venueName, role.venue) || sameText(item.nickname, role.venue));
    setOutsourcedForm({
      fullName: "",
      company: "",
      positionId: position?.id ?? "",
      position: role.position,
      venueId: venue?.id ?? "",
      venue: venue?.venueName || role.venue,
    });
    setOutsourcedError("");
    outsourcedRef.current?.showModal();
  }

  function seedFromRole(role: HiringRole): EmployeeFormSeed {
    const position = lookups.positions.find(
      (item) => item.name.trim().toLowerCase() === role.position.trim().toLowerCase(),
    );
    const venue = locations.find(
      (item) => sameText(item.venueName, role.venue) || sameText(item.nickname, role.venue),
    );
    const salary = role.salary ?? position?.defaultSalary ?? null;
    const split = salary == null ? null : splitSalary(salary);
    return {
      positionId: position?.id ?? "",
      position: role.position,
      venueId: venue?.id ?? "",
      venue: venue?.venueName || role.venue,
      basicSalary: split ? String(split.basicSalary) : "",
      allowances: split ? String(split.allowances) : "",
      salary: split ? String(split.salary) : "",
    };
  }

  function finishHire(label: string) {
    const role = hireRole;
    if (!role) {
      return;
    }

    update((current) => current.filter((item) => item.id !== role.id));
    setHireRole(null);
    setNotice({ tone: "ok", text: label });
  }

  function saveHiredEmployee(employee: StaffEmployee) {
    const role = hireRole;
    updateEmployees((current) => [...current, employee]);
    if (role) {
      placeEmployeeInHiringSlot(
        role.id,
        employee.id,
        locations.find((item) => sameText(item.venueName, role.venue) || sameText(item.nickname, role.venue))
          ?.id ?? null,
      );
    }
    finishHire(`${employee.fullName} replaced the ${role?.position ?? "hiring"} card.`);
  }

  function saveHiredOutsourced(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fullName = outsourcedForm.fullName.trim().replace(/\s+/g, " ");
    const company = outsourcedForm.company.trim();
    const position = outsourcedForm.position.trim();
    const venue = outsourcedForm.venue.trim();
    if (!fullName || !company || !position || !venue) {
      setOutsourcedError("Enter a name, company, position, and venue.");
      return;
    }

    const person: OutsourcedPerson = {
      id: crypto.randomUUID(),
      fullName,
      company,
      position,
      venue,
      startDate: "",
      endDate: "",
      rate: null,
    };
    updateOutsourced((current) => [...current, person]);
    outsourcedRef.current?.close();
    finishHire(`${person.fullName} replaced the ${hireRole?.position ?? "hiring"} card.`);
  }

  function selectOutsourcedVenue(venueId: string) {
    const next = locations.find((location) => location.id === venueId);
    setOutsourcedForm((current) => ({
      ...current,
      venueId,
      venue: next?.venueName ?? "",
    }));
  }

  function selectOutsourcedPosition(positionId: string) {
    const next = lookups.positions.find((position) => position.id === positionId);
    setOutsourcedForm((current) => ({
      ...current,
      positionId,
      position: next?.name ?? "",
    }));
  }

  async function exportSheet() {
    setBusy("export");
    setNotice(null);
    try {
      const bytes = await buildHiringWorkbook(roles);
      downloadWorkbook(bytes, "hiring-positions.xlsx");
      setNotice({
        tone: "ok",
        text: roles.length
          ? `Exported ${roles.length} ${roles.length === 1 ? "position" : "positions"}.`
          : "Exported a blank sheet with the hiring columns. Fill it in, then import it.",
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
      const result = await importHiringWorkbook(await file.arrayBuffer());
      if (result.error) {
        setNotice({ tone: "error", text: result.error });
        return;
      }

      if (result.roles.length === 0) {
        setNotice({
          tone: "error",
          text: result.skipped
            ? "No positions were imported. Each row needs a position, a whole number of openings, and a known status."
            : "That sheet has the right columns, but no rows yet.",
        });
        return;
      }

      update((current) => [...current, ...result.roles]);
      const skipped = result.skipped
        ? ` ${result.skipped} ${result.skipped === 1 ? "row was" : "rows were"} skipped.`
        : "";
      setNotice({
        tone: "ok",
        text: `Imported ${result.roles.length} ${result.roles.length === 1 ? "position" : "positions"}.${skipped}`,
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
            Saved in this browser, so they stay after a refresh. Export a sheet so the same file
            can be filled in and imported.
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
            New position
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
              <th className="border-b border-stone-200 px-3 py-2 font-medium">Position</th>
              <th className="border-b border-stone-200 px-3 py-2 font-medium">Department</th>
              <th className="border-b border-stone-200 px-3 py-2 font-medium">Venue</th>
              <th className="border-b border-stone-200 px-3 py-2 font-medium">Openings</th>
              <th className="border-b border-stone-200 px-3 py-2 font-medium">Status</th>
              <th className="border-b border-stone-200 px-3 py-2 font-medium">Salary</th>
              <th className="border-b border-stone-200 px-3 py-2 text-right font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-stone-500">
                  {roles.length === 0
                    ? "No hiring positions yet. Add one, or import a spreadsheet."
                    : "Archived positions are hidden."}
                </td>
              </tr>
            ) : (
              visible.map((role) => (
                <tr
                  key={role.id}
                  className={`cursor-pointer hover:bg-stone-50 ${isArchived(role) ? "opacity-60" : ""}`}
                  onClick={() => openRole(role)}
                >
                  <td className="border-b border-stone-100 px-3 py-2 font-medium text-stone-950">
                    {role.position}
                  </td>
                  <td className="border-b border-stone-100 px-3 py-2 text-stone-700">{role.department}</td>
                  <td className="border-b border-stone-100 px-3 py-2 text-stone-700">{role.venue}</td>
                  <td className="border-b border-stone-100 px-3 py-2 text-stone-700">{role.openings}</td>
                  <td className="border-b border-stone-100 px-3 py-2 text-stone-700">
                    {hiringStatusLabel(role.status)}
                  </td>
                  <td className="border-b border-stone-100 px-3 py-2 text-stone-700 tabular-nums">
                    {role.salary == null ? "—" : formatSalary(role.salary)}
                  </td>
                  <td className="border-b border-stone-100 px-2 py-1">
                    <RowActions
                      archived={isArchived(role)}
                      onEdit={() => openRole(role)}
                      onArchive={() => toggleArchive(role)}
                      onDelete={() => setPendingDelete(role)}
                      leading={
                        <IconButton label="Create employee" onClick={() => openHire(role)}>
                          <HireIcon />
                        </IconButton>
                      }
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
        aria-labelledby="new-hiring-title"
        className="m-auto h-fit max-h-[calc(100dvh-2rem)] w-[min(100%-2rem,40rem)] overflow-hidden rounded-2xl border border-stone-200 bg-white p-0 text-stone-950 shadow-xl backdrop:bg-stone-950/40"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            event.currentTarget.close();
          }
        }}
      >
        <form onSubmit={addRole} className="flex max-h-[calc(100dvh-2rem)] flex-col">
          <DialogHeading
            titleId="new-hiring-title"
            title={editingId ? "Edit position" : "New position"}
            description="Saved in this browser with the other hiring positions."
            icon={editingId ? <PencilIcon /> : <PlusIcon />}
            onClose={() => dialogRef.current?.close()}
          />

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <label className="block text-sm font-medium text-stone-800">
              Position
              {positionGroups.length > 0 ? (
                <select
                  value={form.positionId}
                  onChange={(event) => selectPosition(event.target.value)}
                  required
                  autoFocus
                  className={fieldClass}
                >
                  <option value="">Select a position</option>
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
                  value={form.position}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      positionId: "",
                      position: event.target.value,
                    }))
                  }
                  required
                  autoFocus
                  className={fieldClass}
                />
              )}
            </label>
            <label className="block text-sm font-medium text-stone-800">
              Department
              {lookups.departments.length > 0 ? (
                <select
                  value={form.departmentId}
                  onChange={(event) => selectDepartment(event.target.value)}
                  required
                  className={fieldClass}
                >
                  <option value="">Select a department</option>
                  {lookups.departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={form.department}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      departmentId: "",
                      department: event.target.value,
                    }))
                  }
                  required
                  className={fieldClass}
                />
              )}
            </label>
            <label className="block text-sm font-medium text-stone-800">
              Venue
              {locations.length > 0 ? (
                <select
                  value={form.venueId}
                  onChange={(event) => selectVenue(event.target.value)}
                  required
                  className={fieldClass}
                >
                  <option value="">Select a venue</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.nickname} — {location.venueName}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={form.venue}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      venueId: "",
                      venue: event.target.value,
                    }))
                  }
                  required
                  className={fieldClass}
                />
              )}
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-stone-800">
                Openings
                <input
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={form.openings}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, openings: event.target.value }))
                  }
                  required
                  className={fieldClass}
                />
              </label>
              <label className="block text-sm font-medium text-stone-800">
                Status
                <select
                  value={form.status}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      status: event.target.value as HiringStatus,
                    }))
                  }
                  className={fieldClass}
                >
                  {hiringStatuses.map((status) => (
                    <option key={status.id} value={status.id}>
                      {status.label}
                    </option>
                  ))}
                </select>
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
            <button type="submit" className={primaryButtonClass}>
              {editingId ? "Save" : "Add position"}
            </button>
          </div>
        </form>
      </dialog>

      <dialog
        ref={kindRef}
        aria-labelledby="hire-kind-title"
        className="m-auto h-fit w-[min(100%-2rem,28rem)] rounded-2xl border border-stone-200 bg-white p-0 text-stone-950 shadow-xl backdrop:bg-stone-950/40"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            event.currentTarget.close();
          }
        }}
        onClose={() => {
          if (keepHire.current) {
            keepHire.current = false;
            return;
          }
          setHireRole(null);
        }}
      >
        <div className="flex items-start gap-3 border-b border-stone-200 px-5 py-4">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-700">
            <HireIcon />
          </span>
          <div>
            <h2 id="hire-kind-title" className="text-base font-semibold tracking-tight">
              Create employee
            </h2>
            <p className="mt-1 text-sm text-stone-500">
              {hireRole
                ? `What kind of employee is replacing ${hireRole.position}?`
                : "What kind of employee is this?"}
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-stone-200 px-5 py-4">
          <button type="button" className={secondaryButtonClass} onClick={() => kindRef.current?.close()}>
            Cancel
          </button>
          <button type="button" className={secondaryButtonClass} onClick={() => chooseHireKind("outsourced")}>
            Outsourced
          </button>
          <button type="button" className={primaryButtonClass} onClick={() => chooseHireKind("in-house")}>
            In-house
          </button>
        </div>
      </dialog>

      <EmployeeFormDialog request={employeeRequest} onSave={saveHiredEmployee} />

      <dialog
        ref={outsourcedRef}
        aria-labelledby="hire-outsourced-title"
        className="m-auto h-fit max-h-[calc(100dvh-2rem)] w-[min(100%-2rem,40rem)] overflow-hidden rounded-2xl border border-stone-200 bg-white p-0 text-stone-950 shadow-xl backdrop:bg-stone-950/40"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            event.currentTarget.close();
          }
        }}
      >
        <form onSubmit={saveHiredOutsourced} className="flex max-h-[calc(100dvh-2rem)] flex-col">
          <DialogHeading
            titleId="hire-outsourced-title"
            title="New person"
            description="This replaces the hiring card and adds the person to outsourced staff."
            icon={<HireIcon />}
            onClose={() => outsourcedRef.current?.close()}
          />
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <label className="block text-sm font-medium text-stone-800">
              Full name
              <input
                value={outsourcedForm.fullName}
                onChange={(event) =>
                  setOutsourcedForm((current) => ({ ...current, fullName: event.target.value }))
                }
                required
                autoFocus
                className={fieldClass}
              />
            </label>
            <label className="block text-sm font-medium text-stone-800">
              Company
              <input
                value={outsourcedForm.company}
                onChange={(event) =>
                  setOutsourcedForm((current) => ({ ...current, company: event.target.value }))
                }
                required
                className={fieldClass}
              />
            </label>
            <label className="block text-sm font-medium text-stone-800">
              Position
              {positionGroups.length > 0 ? (
                <select
                  value={outsourcedForm.positionId}
                  onChange={(event) => selectOutsourcedPosition(event.target.value)}
                  required
                  className={fieldClass}
                >
                  <option value="">Select a position</option>
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
                  value={outsourcedForm.position}
                  onChange={(event) =>
                    setOutsourcedForm((current) => ({
                      ...current,
                      positionId: "",
                      position: event.target.value,
                    }))
                  }
                  required
                  className={fieldClass}
                />
              )}
            </label>
            <label className="block text-sm font-medium text-stone-800">
              Venue
              {locations.length > 0 ? (
                <select
                  value={outsourcedForm.venueId}
                  onChange={(event) => selectOutsourcedVenue(event.target.value)}
                  required
                  className={fieldClass}
                >
                  <option value="">Select a venue</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.nickname} — {location.venueName}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={outsourcedForm.venue}
                  onChange={(event) =>
                    setOutsourcedForm((current) => ({
                      ...current,
                      venueId: "",
                      venue: event.target.value,
                    }))
                  }
                  required
                  className={fieldClass}
                />
              )}
            </label>
            {outsourcedError ? <p className="text-sm text-red-700">{outsourcedError}</p> : null}
          </div>
          <div className="flex shrink-0 justify-end gap-2 border-t border-stone-200 px-5 py-4">
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={() => outsourcedRef.current?.close()}
            >
              Cancel
            </button>
            <button type="submit" className={primaryButtonClass}>
              Add person
            </button>
          </div>
        </form>
      </dialog>

      <DeleteConfirmDialog
        open={pendingDelete != null}
        title="Delete position"
        message={
          pendingDelete
            ? `Delete the ${pendingDelete.position} hiring position?`
            : ""
        }
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) {
            deleteRole(pendingDelete);
          }
        }}
      />
    </div>
  );
}

function placeEmployeeInHiringSlot(roleId: string, employeeId: string, locationId: string | null) {
  const orders = getBoardOrderSnapshot();
  const next = { ...orders };
  let swapped = false;
  for (const [key, ids] of Object.entries(orders)) {
    if (!ids.includes(roleId)) {
      continue;
    }

    swapped = true;
    next[key] = ids.map((id) => (id === roleId ? employeeId : id));
  }

  if (!swapped) {
    const key = columnOrderKey(locationId);
    const column = (orders[key] ?? []).filter((id) => id !== employeeId && id !== roleId);
    next[key] = [employeeId, ...column];
  }

  saveBoardOrder(next);
}

function sameText(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}
