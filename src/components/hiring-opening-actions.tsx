"use client";

import { useRef, useState } from "react";
import {
  ArchiveIcon,
  DeleteConfirmDialog,
  DialogHeading,
  HireIcon,
  PencilIcon,
  TrashIcon,
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
import { hiringStatuses, type HiringRole, type HiringStatus } from "@/lib/hiring";
import { type OutsourcedPerson } from "@/lib/outsourced";
import { splitSalary, type StaffEmployee } from "@/lib/staff";

const fieldClass =
  "mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-950 outline-none focus:border-stone-950";
const secondaryButtonClass =
  "inline-flex h-9 items-center justify-center rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium text-stone-800 hover:bg-stone-50";
const primaryButtonClass =
  "inline-flex h-9 items-center justify-center rounded-lg bg-stone-950 px-3 text-sm font-medium text-white hover:bg-stone-800";
const optionClass =
  "flex h-10 w-full items-center gap-3 rounded-lg px-2 text-left text-sm text-stone-800 hover:bg-stone-100";

const emptyOutsourced = {
  fullName: "",
  company: "",
  positionId: "",
  position: "",
  venueId: "",
  venue: "",
};

export function HiringOpeningActions({
  role,
  onFinished,
}: {
  role: HiringRole;
  onFinished: (message: string) => void;
}) {
  const { lookups } = useDirectoryLookups();
  const { locations } = useLocations();
  const { update } = useHiring();
  const { update: updateEmployees } = useStaffDirectory();
  const { update: updateOutsourced } = useOutsourced();
  const kindRef = useRef<HTMLDialogElement>(null);
  const positionRef = useRef<HTMLDialogElement>(null);
  const outsourcedRef = useRef<HTMLDialogElement>(null);
  const formToken = useRef(0);
  const keepHire = useRef(false);
  const [hireRole, setHireRole] = useState<HiringRole | null>(null);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [employeeRequest, setEmployeeRequest] = useState<EmployeeFormRequest | null>(null);
  const [positionForm, setPositionForm] = useState(() => formFromRole(role, lookups, locations));
  const [positionError, setPositionError] = useState("");
  const [outsourcedForm, setOutsourcedForm] = useState(emptyOutsourced);
  const [outsourcedError, setOutsourcedError] = useState("");
  const groups = lookups.departments
    .map((department) => ({
      department,
      positions: lookups.positions.filter((position) => position.departmentId === department.id),
    }))
    .filter((group) => group.positions.length > 0);

  function openCreateEmployee() {
    setHireRole(role);
    kindRef.current?.showModal();
  }

  function openEditPosition() {
    setPositionForm(formFromRole(role, lookups, locations));
    setPositionError("");
    positionRef.current?.showModal();
  }

  function archiveRole() {
    update((current) =>
      current.map((item) => (item.id === role.id ? { ...item, archived: true } : item)),
    );
    onFinished(`${role.position} was archived.`);
  }

  function deleteRole() {
    update((current) => current.filter((item) => item.id !== role.id));
    setPendingDelete(false);
    onFinished(`${role.position} was deleted.`);
  }

  function chooseHireKind(kind: "in-house" | "outsourced") {
    keepHire.current = true;
    kindRef.current?.close();
    if (kind === "in-house") {
      formToken.current += 1;
      setEmployeeRequest({
        token: formToken.current,
        employee: null,
        seed: seedFromRole(role, lookups, locations),
        description: `This replaces the ${role.position} hiring card on the location board.`,
      });
      return;
    }

    const position = lookups.positions.find((item) => sameText(item.name, role.position));
    const venue = locations.find(
      (item) => sameText(item.venueName, role.venue) || sameText(item.nickname, role.venue),
    );
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

  function finishHire(message: string) {
    update((current) => current.filter((item) => item.id !== role.id));
    setHireRole(null);
    onFinished(message);
  }

  function saveHiredEmployee(employee: StaffEmployee) {
    updateEmployees((current) => [...current, employee]);
    placeEmployeeInHiringSlot(
      role.id,
      employee.id,
      locations.find((item) => sameText(item.venueName, role.venue) || sameText(item.nickname, role.venue))
        ?.id ?? null,
    );
    finishHire(`${employee.fullName} replaced the ${role.position} card.`);
  }

  function savePosition(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const position = positionForm.position.trim();
    const department = positionForm.department.trim();
    const venue = positionForm.venue.trim();
    const openings = Number(positionForm.openings);
    const salaryText = positionForm.salary.trim();
    const salary = salaryText === "" ? null : Number(salaryText);
    if (!position || !department || !venue) {
      setPositionError("Enter a position, department, and venue.");
      return;
    }

    if (!Number.isInteger(openings) || openings < 0) {
      setPositionError("Openings needs to be a whole number.");
      return;
    }

    if (salaryText && (salary == null || Number.isNaN(salary) || salary < 0)) {
      setPositionError("Enter a salary of zero or more.");
      return;
    }

    update((current) =>
      current.map((item) =>
        item.id === role.id
          ? {
              ...item,
              position,
              department,
              venue,
              openings,
              status: positionForm.status,
              salary,
            }
          : item,
      ),
    );
    positionRef.current?.close();
    onFinished(`Updated hiring for ${position}.`);
  }

  function saveOutsourced(event: React.FormEvent<HTMLFormElement>) {
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
    finishHire(`${person.fullName} replaced the ${role.position} card.`);
  }

  function selectPosition(positionId: string) {
    const next = lookups.positions.find((position) => position.id === positionId);
    const department = lookups.departments.find((item) => item.id === next?.departmentId);
    setPositionForm((current) => ({
      ...current,
      positionId,
      position: next?.name ?? "",
      departmentId: department?.id ?? "",
      department: department?.name ?? current.department,
      salary:
        current.salary !== "" || next?.defaultSalary == null
          ? current.salary
          : String(next?.defaultSalary),
    }));
  }

  return (
    <>
      <div className="flex flex-col gap-1 px-3 py-3">
        <button type="button" className={optionClass} onClick={openCreateEmployee}>
          <ActionIcon>
            <HireIcon />
          </ActionIcon>
          Create employee
        </button>
        <button type="button" className={optionClass} onClick={openEditPosition}>
          <ActionIcon>
            <PencilIcon />
          </ActionIcon>
          Edit position
        </button>
        <button type="button" className={optionClass} onClick={archiveRole}>
          <ActionIcon>
            <ArchiveIcon />
          </ActionIcon>
          Archive
        </button>
        <button type="button" className={optionClass} onClick={() => setPendingDelete(true)}>
          <ActionIcon>
            <TrashIcon />
          </ActionIcon>
          Delete
        </button>
      </div>

      <dialog
        ref={kindRef}
        aria-labelledby="board-hire-kind-title"
        className="m-auto h-fit w-[min(100%-2rem,28rem)] rounded-2xl border border-stone-200 bg-white p-0 text-stone-950 shadow-xl backdrop:bg-stone-950/40"
        onClick={(event) => {
          event.stopPropagation();
          if (event.target === event.currentTarget) {
            event.currentTarget.close();
          }
        }}
        onClose={(event) => {
          event.stopPropagation();
          if (keepHire.current) {
            keepHire.current = false;
            return;
          }
          setHireRole(null);
        }}
      >
        <div className="flex items-start gap-3 px-5 py-4">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-700">
            <HireIcon />
          </span>
          <div>
            <h2 id="board-hire-kind-title" className="text-base font-semibold tracking-tight">
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

      <dialog
        ref={positionRef}
        aria-labelledby="board-edit-position-title"
        className="m-auto h-fit max-h-[calc(100dvh-2rem)] w-[min(100%-2rem,40rem)] overflow-hidden rounded-2xl border border-stone-200 bg-white p-0 text-stone-950 shadow-xl backdrop:bg-stone-950/40"
        onClick={(event) => {
          event.stopPropagation();
          if (event.target === event.currentTarget) {
            event.currentTarget.close();
          }
        }}
        onClose={(event) => event.stopPropagation()}
      >
        <form onSubmit={savePosition} className="flex max-h-[calc(100dvh-2rem)] flex-col">
          <DialogHeading
            titleId="board-edit-position-title"
            title="Edit position"
            description="Saved in this browser with the other hiring positions."
            icon={<PencilIcon />}
            onClose={() => positionRef.current?.close()}
          />
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <label className="block text-sm font-medium text-stone-800">
              Position
              {groups.length > 0 ? (
                <select
                  value={positionForm.positionId}
                  onChange={(event) => selectPosition(event.target.value)}
                  required
                  autoFocus
                  className={fieldClass}
                >
                  <option value="">Select a position</option>
                  {positionForm.positionId.startsWith("name:") ? (
                    <option value={positionForm.positionId}>{positionForm.position}</option>
                  ) : null}
                  {groups.map((group) => (
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
                  value={positionForm.position}
                  onChange={(event) =>
                    setPositionForm((current) => ({
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
                  value={positionForm.departmentId}
                  onChange={(event) => {
                    const next = lookups.departments.find((item) => item.id === event.target.value);
                    setPositionForm((current) => ({
                      ...current,
                      departmentId: event.target.value,
                      department: next?.name ?? "",
                    }));
                  }}
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
                  value={positionForm.department}
                  onChange={(event) =>
                    setPositionForm((current) => ({
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
                  value={positionForm.venueId}
                  onChange={(event) => {
                    const next = locations.find((item) => item.id === event.target.value);
                    setPositionForm((current) => ({
                      ...current,
                      venueId: event.target.value,
                      venue: next?.venueName ?? "",
                    }));
                  }}
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
                  value={positionForm.venue}
                  onChange={(event) =>
                    setPositionForm((current) => ({
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
                  value={positionForm.openings}
                  onChange={(event) =>
                    setPositionForm((current) => ({ ...current, openings: event.target.value }))
                  }
                  required
                  className={fieldClass}
                />
              </label>
              <label className="block text-sm font-medium text-stone-800">
                Status
                <select
                  value={positionForm.status}
                  onChange={(event) =>
                    setPositionForm((current) => ({
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
            <label className="block text-sm font-medium text-stone-800">
              Salary
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={positionForm.salary}
                onChange={(event) =>
                  setPositionForm((current) => ({ ...current, salary: event.target.value }))
                }
                placeholder="Default salary"
                className={fieldClass}
              />
            </label>
            {positionError ? <p className="text-sm text-red-700">{positionError}</p> : null}
          </div>
          <div className="flex shrink-0 justify-end gap-2 border-t border-stone-200 px-5 py-4">
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={() => positionRef.current?.close()}
            >
              Cancel
            </button>
            <button type="submit" className={primaryButtonClass}>
              Save
            </button>
          </div>
        </form>
      </dialog>

      <dialog
        ref={outsourcedRef}
        aria-labelledby="board-hire-outsourced-title"
        className="m-auto h-fit max-h-[calc(100dvh-2rem)] w-[min(100%-2rem,40rem)] overflow-hidden rounded-2xl border border-stone-200 bg-white p-0 text-stone-950 shadow-xl backdrop:bg-stone-950/40"
        onClick={(event) => {
          event.stopPropagation();
          if (event.target === event.currentTarget) {
            event.currentTarget.close();
          }
        }}
        onClose={(event) => event.stopPropagation()}
      >
        <form onSubmit={saveOutsourced} className="flex max-h-[calc(100dvh-2rem)] flex-col">
          <DialogHeading
            titleId="board-hire-outsourced-title"
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
              {groups.length > 0 ? (
                <select
                  value={outsourcedForm.positionId}
                  onChange={(event) => {
                    const next = lookups.positions.find((item) => item.id === event.target.value);
                    setOutsourcedForm((current) => ({
                      ...current,
                      positionId: event.target.value,
                      position: next?.name ?? "",
                    }));
                  }}
                  required
                  className={fieldClass}
                >
                  <option value="">Select a position</option>
                  {groups.map((group) => (
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
                  onChange={(event) => {
                    const next = locations.find((item) => item.id === event.target.value);
                    setOutsourcedForm((current) => ({
                      ...current,
                      venueId: event.target.value,
                      venue: next?.venueName ?? "",
                    }));
                  }}
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

      <EmployeeFormDialog request={employeeRequest} onSave={saveHiredEmployee} />

      <DeleteConfirmDialog
        open={pendingDelete}
        title="Delete position"
        message={`Delete the ${role.position} hiring position?`}
        onCancel={() => setPendingDelete(false)}
        onConfirm={deleteRole}
      />
    </>
  );
}

function ActionIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg text-stone-500">
      {children}
    </span>
  );
}

function formFromRole(
  role: HiringRole,
  lookups: ReturnType<typeof useDirectoryLookups>["lookups"],
  locations: ReturnType<typeof useLocations>["locations"],
) {
  const position = lookups.positions.find((item) => sameText(item.name, role.position));
  const department = lookups.departments.find(
    (item) => item.id === position?.departmentId || sameText(item.name, role.department),
  );
  const venue = locations.find(
    (item) => sameText(item.venueName, role.venue) || sameText(item.nickname, role.venue),
  );
  return {
    positionId: position?.id ?? (role.position ? `name:${role.position}` : ""),
    position: role.position,
    departmentId: department?.id ?? "",
    department: role.department,
    venueId: venue?.id ?? "",
    venue: venue?.venueName || role.venue,
    openings: String(role.openings),
    status: role.status,
    salary: role.salary == null ? "" : String(role.salary),
  };
}

function seedFromRole(
  role: HiringRole,
  lookups: ReturnType<typeof useDirectoryLookups>["lookups"],
  locations: ReturnType<typeof useLocations>["locations"],
): EmployeeFormSeed {
  const position = lookups.positions.find((item) => sameText(item.name, role.position));
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
