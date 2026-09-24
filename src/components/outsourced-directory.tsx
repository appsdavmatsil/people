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
import { useDirectoryLookups } from "@/components/use-directory-lookups";
import { useLocations } from "@/components/use-locations";
import { useOutsourced } from "@/components/use-outsourced";
import { downloadWorkbook } from "@/lib/download-workbook";
import type { OutsourcedPerson } from "@/lib/outsourced";
import {
  buildOutsourcedWorkbook,
  importOutsourcedWorkbook,
} from "@/lib/outsourced-workbook";

const fieldClass =
  "mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-950 outline-none focus:border-stone-950";
const secondaryButtonClass =
  "inline-flex h-9 items-center justify-center rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-60";
const primaryButtonClass =
  "inline-flex h-9 items-center justify-center rounded-lg bg-stone-950 px-3 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-60";

const emptyForm = {
  fullName: "",
  company: "",
  positionId: "",
  position: "",
  venueId: "",
  venue: "",
};

type Notice = {
  tone: "ok" | "error";
  text: string;
};

export function OutsourcedDirectory({ editId }: { editId?: string }) {
  const { lookups } = useDirectoryLookups();
  const { locations } = useLocations();
  const { people, update } = useOutsourced();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState<"import" | "export" | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<OutsourcedPerson | null>(null);
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

  const archivedCount = people.filter((person) => isArchived(person)).length;
  const visible = people.filter((person) => showArchived || !isArchived(person));
  const countLabel = `${visible.length} ${visible.length === 1 ? "person" : "people"}`;

  function openDialog() {
    setEditingId(null);
    setForm(emptyForm);
    setFormError("");
    dialogRef.current?.showModal();
  }

  function openPerson(person: OutsourcedPerson) {
    const position = lookups.positions.find(
      (item) => item.name.trim().toLowerCase() === person.position.trim().toLowerCase(),
    );
    const venue = locations.find(
      (item) => item.venueName.trim().toLowerCase() === person.venue.trim().toLowerCase(),
    );
    setEditingId(person.id);
    setForm({
      fullName: person.fullName,
      company: person.company,
      positionId: position?.id ?? "",
      position: person.position,
      venueId: venue?.id ?? "",
      venue: person.venue,
    });
    setFormError("");
    dialogRef.current?.showModal();
  }

  const openedEdit = useRef<string | null>(null);
  useEffect(() => {
    if (!editId || openedEdit.current === editId) {
      return;
    }
    const person = people.find((item) => item.id === editId);
    if (!person) {
      return;
    }
    openedEdit.current = editId;
    openPerson(person);
  }, [editId, people]);

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
    setForm((current) => ({
      ...current,
      positionId,
      position: next?.name ?? "",
    }));
  }

  function addPerson(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fullName = form.fullName.trim().replace(/\s+/g, " ");
    const company = form.company.trim();
    const position = form.position.trim();
    const venue = form.venue.trim();
    if (!fullName || !company || !position || !venue) {
      setFormError("Enter a name, company, position, and venue.");
      return;
    }

    const previous = people.find((item) => item.id === editingId) ?? null;
    const person: OutsourcedPerson = {
      id: editingId ?? crypto.randomUUID(),
      fullName,
      company,
      position,
      venue,
      startDate: previous?.startDate ?? "",
      endDate: previous?.endDate ?? "",
      rate: previous?.rate ?? null,
      archived: previous?.archived,
    };
    if (editingId) {
      update((current) => current.map((item) => (item.id === editingId ? person : item)));
      setNotice({ tone: "ok", text: `${person.fullName} was updated.` });
    } else {
      update((current) => [...current, person]);
      setNotice({ tone: "ok", text: `${person.fullName} was added.` });
    }
    dialogRef.current?.close();
  }

  function toggleArchive(person: OutsourcedPerson) {
    const archived = !isArchived(person);
    update((current) =>
      current.map((item) => (item.id === person.id ? { ...item, archived } : item)),
    );
    setNotice({
      tone: "ok",
      text: archived ? `${person.fullName} was archived.` : `${person.fullName} was restored.`,
    });
  }

  function deletePerson(person: OutsourcedPerson) {
    update((current) => current.filter((item) => item.id !== person.id));
    setPendingDelete(null);
    setNotice({ tone: "ok", text: `${person.fullName} was deleted.` });
  }

  async function exportSheet() {
    setBusy("export");
    setNotice(null);
    try {
      const bytes = await buildOutsourcedWorkbook(people);
      downloadWorkbook(bytes, "outsourced-staff.xlsx");
      setNotice({
        tone: "ok",
        text: people.length
          ? `Exported ${people.length} ${people.length === 1 ? "person" : "people"}.`
          : "Exported a blank sheet with the outsourced columns. Fill it in, then import it.",
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
      const result = await importOutsourcedWorkbook(await file.arrayBuffer());
      if (result.error) {
        setNotice({ tone: "error", text: result.error });
        return;
      }

      if (result.people.length === 0) {
        setNotice({
          tone: "error",
          text: result.skipped
            ? "No people were imported. Each row needs a full name."
            : "That sheet has the right columns, but no rows yet.",
        });
        return;
      }

      update((current) => [...current, ...result.people]);
      const skipped = result.skipped
        ? ` ${result.skipped} ${result.skipped === 1 ? "row was" : "rows were"} skipped because a name was missing.`
        : "";
      setNotice({
        tone: "ok",
        text: `Imported ${result.people.length} ${result.people.length === 1 ? "person" : "people"}.${skipped}`,
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
            Kept on this page until you refresh. Nothing is written to the database yet. Export a
            sheet so the same file can be filled in and imported.
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
            New person
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
              <th className="border-b border-stone-200 px-3 py-2 font-medium">Name</th>
              <th className="border-b border-stone-200 px-3 py-2 font-medium">Company</th>
              <th className="border-b border-stone-200 px-3 py-2 font-medium">Position</th>
              <th className="border-b border-stone-200 px-3 py-2 font-medium">Venue</th>
              <th className="border-b border-stone-200 px-3 py-2 text-right font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-stone-500">
                  {people.length === 0
                    ? "No outsourced staff yet. Add someone, or import a spreadsheet."
                    : "Archived people are hidden."}
                </td>
              </tr>
            ) : (
              visible.map((person) => (
                <tr
                  key={person.id}
                  className={`cursor-pointer hover:bg-stone-50 ${isArchived(person) ? "opacity-60" : ""}`}
                  onClick={() => openPerson(person)}
                >
                  <td className="border-b border-stone-100 px-3 py-2 font-medium text-stone-950">
                    {person.fullName}
                  </td>
                  <td className="border-b border-stone-100 px-3 py-2 text-stone-700">{person.company}</td>
                  <td className="border-b border-stone-100 px-3 py-2 text-stone-700">{person.position}</td>
                  <td className="border-b border-stone-100 px-3 py-2 text-stone-700">{person.venue}</td>
                  <td className="border-b border-stone-100 px-2 py-1">
                    <RowActions
                      archived={isArchived(person)}
                      onEdit={() => openPerson(person)}
                      onArchive={() => toggleArchive(person)}
                      onDelete={() => setPendingDelete(person)}
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
        aria-labelledby="new-outsourced-title"
        className="m-auto h-fit max-h-[calc(100dvh-2rem)] w-[min(100%-2rem,40rem)] overflow-hidden rounded-2xl border border-stone-200 bg-white p-0 text-stone-950 shadow-xl backdrop:bg-stone-950/40"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            event.currentTarget.close();
          }
        }}
        onClose={() => setEditingId(null)}
      >
        <form onSubmit={addPerson} className="flex max-h-[calc(100dvh-2rem)] flex-col">
          <DialogHeading
            titleId="new-outsourced-title"
            title={editingId ? "Edit person" : "New person"}
            description="This stays on the page until you refresh."
            icon={editingId ? <PencilIcon /> : <PlusIcon />}
            onClose={() => dialogRef.current?.close()}
          />

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <label className="block text-sm font-medium text-stone-800">
              Full name
              <input
                value={form.fullName}
                onChange={(event) =>
                  setForm((current) => ({ ...current, fullName: event.target.value }))
                }
                autoComplete="name"
                required
                autoFocus
                className={fieldClass}
              />
            </label>
            <label className="block text-sm font-medium text-stone-800">
              Company
              <input
                value={form.company}
                onChange={(event) =>
                  setForm((current) => ({ ...current, company: event.target.value }))
                }
                required
                className={fieldClass}
              />
            </label>
            <label className="block text-sm font-medium text-stone-800">
              Position
              {positionGroups.length > 0 ? (
                <select
                  value={form.positionId}
                  onChange={(event) => selectPosition(event.target.value)}
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
                  value={form.position}
                  onChange={(event) =>
                    setForm((current) => ({
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
              {editingId ? "Save" : "Add person"}
            </button>
          </div>
        </form>
      </dialog>
      <DeleteConfirmDialog
        open={pendingDelete != null}
        title="Delete person"
        message={
          pendingDelete
            ? `Delete ${pendingDelete.fullName}? This removes them from outsourced staff.`
            : ""
        }
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) {
            deletePerson(pendingDelete);
          }
        }}
      />
    </div>
  );
}

