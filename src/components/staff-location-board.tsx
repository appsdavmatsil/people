"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { columnRows, reanchorLabels, type BoardLabel, type ColumnRow } from "@/lib/board-labels";
import { columnOrderKey, type ColumnOrders } from "@/lib/board-order";
import { type CardLabel } from "@/lib/card-labels";
import { useEventBoard, useEvents } from "@/components/use-events";
import { useLocationBoard, useLocations } from "@/components/use-locations";
import { useBoardLabels, useEventBoardLabels } from "@/components/use-board-labels";
import { useBoardOrder, useEventBoardOrder } from "@/components/use-board-order";
import { useCardLabels, useEventCardLabels } from "@/components/use-card-labels";
import { DashboardVisibilityButton } from "@/components/dashboard-visibility";
import { usePrivacy } from "@/components/privacy-provider";
import { privacyUnlockAction } from "@/lib/privacy-actions";
import { DateField } from "@/components/date-field";
import { HireIcon, PencilIcon, PlusIcon, TrashIcon } from "@/components/directory-actions";
import { HiringOpeningActions } from "@/components/hiring-opening-actions";
import { useDirectoryLookups } from "@/components/use-directory-lookups";
import { useHiring } from "@/components/use-hiring";
import { useOutsourced } from "@/components/use-outsourced";
import { usePayrollView } from "@/components/use-payroll-view";
import { usePromotions } from "@/components/use-promotions";
import { useStaffDirectory } from "@/components/use-staff-directory";
import { useEventPlacements } from "@/components/use-staff-placements";
import { countryFlag } from "@/lib/countries";
import { normalizeName, type DirectoryLookups } from "@/lib/directory-lookups";
import { type EventDefinition } from "@/lib/events";
import { type HiringRole } from "@/lib/hiring";
import {
  pendingPromotion,
  settleDuePromotions,
  todayIso,
  type StaffPromotion,
} from "@/lib/promotions";
import { type OutsourcedPerson } from "@/lib/outsourced";
import { sameLocationName, type LocationReference } from "@/lib/locations";
import { featureIsProtected, salaryHidden } from "@/lib/privacy";
import {
  formatDate,
  formatSalary,
  parseMoneyInput,
  resolvePay,
  roundMoney,
  splitFullName,
  splitSalary,
  sumSalary,
  type StaffEmployee,
} from "@/lib/staff";
import {
  normalizePlacementName,
  type StaffPlacement,
} from "@/lib/staff-placements";

const unassignedDropId = "unassigned";

const fieldClass =
  "mt-1.5 h-9 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none focus:border-stone-950";
const secondaryButtonClass =
  "inline-flex h-9 items-center justify-center rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium text-stone-800 hover:bg-stone-50";
const primaryButtonClass =
  "inline-flex h-9 items-center justify-center rounded-lg bg-stone-950 px-3 text-sm font-medium text-white hover:bg-stone-800";
const iconButtonClass =
  "inline-flex size-9 items-center justify-center rounded-lg border border-stone-300 bg-white text-stone-800 hover:bg-stone-50";
const iconPrimaryButtonClass =
  "inline-flex size-9 items-center justify-center rounded-lg bg-stone-950 text-white hover:bg-stone-800";

type DialogMode =
  | "venue"
  | "staff"
  | "unassigned"
  | "label"
  | "cardLabel"
  | "editStaff"
  | "hiring"
  | "editHiring"
  | "promotion"
  | "profile"
  | null;

type StaffEditForm = {
  id: string;
  fullName: string;
  firstName: string;
  lastName: string;
  nationality: string;
  dateOfBirth: string;
  joiningDate: string;
  position: string;
  locationId: string;
  basicSalary: string;
  allowances: string;
  salary: string;
  photo: string | null;
};

type VisualRow = { kind: "staff" | "label" | "hiring"; id: string };

type BoardItem =
  | { kind: "staff"; person: StaffPlacement }
  | { kind: "label"; label: BoardLabel }
  | { kind: "hiring"; role: HiringRole };

type LabelSlot = {
  locationId: string | null;
  beforeId: string | null;
  index: number;
  beforeItemId: string | null;
};

type UnassignedPerson = {
  id: string;
  name: string;
  position: string;
};

type DragState = {
  staffId: string;
  pointerId: number;
  x: number;
  y: number;
  over: string | null;
};

type PendingDrag = {
  staffId: string;
  pointerId: number;
  x: number;
  y: number;
};

export function StaffLocationBoard() {
  const { locations: catalog } = useLocations();
  const { ids: boardIds, update: updateBoardIds } = useLocationBoard();
  const locations = boardIds
    ? boardIds.flatMap((id) => {
        const location = catalog.find((item) => item.id === id);
        return location ? [location] : [];
      })
    : catalog;

  function updateLocations(next: LocationReference[]) {
    const known = new Set(catalog.map((item) => item.id));
    updateBoardIds(next.map((item) => item.id).filter((id) => known.has(id)));
  }
  const { labels, update: updateLabels } = useBoardLabels();
  const { labels: cardLabels, update: updateCardLabels } = useCardLabels();
  const { orders, update: updateOrders } = useBoardOrder();
  const { employees, update: updateEmployees } = useStaffDirectory();
  const activeEmployees = employees.filter((employee) => !employee.archived);
  const placements = activeEmployees.map((employee) => ({
    id: employee.id,
    name: employee.fullName,
    locationId: locationIdForVenue(employee.venue, locations),
    position: employee.position,
    salary: employee.salary,
  }));
  const unassignedPeople = activeEmployees.flatMap((employee) => {
    if (locationIdForVenue(employee.venue, locations)) {
      return [];
    }

    return [{ id: employee.id, name: employee.fullName, position: employee.position }];
  });

  function updatePlacements(next: StaffPlacement[]) {
    const incoming = new Map(next.map((person) => [person.id, person]));
    const updated = employees.flatMap((employee) => {
      if (employee.archived) {
        return [employee];
      }

      const person = incoming.get(employee.id);
      if (!person) {
        return [];
      }

      const location = locations.find((item) => item.id === person.locationId);
      const venue = location ? location.venueName || location.nickname : "";
      return employee.venue === venue ? [employee] : [{ ...employee, venue }];
    });
    const added = next
      .filter((person) => !employees.some((employee) => employee.id === person.id))
      .map((person) => employeeFromPlacement(person, locations));
    updateEmployees([...updated, ...added]);
  }

  return (
    <PlacementBoard
      titleId="staff-location-dialog-title"
      locations={locations}
      updateLocations={updateLocations}
      placements={placements}
      updatePlacements={updatePlacements}
      labels={labels}
      updateLabels={updateLabels}
      cardLabels={cardLabels}
      updateCardLabels={updateCardLabels}
      orders={orders}
      updateOrders={updateOrders}
      unassignedPeople={unassignedPeople}
      staffChoices={unassignedPeople}
      venueCatalog={catalog}
      employees={employees}
      updateEmployees={updateEmployees}
      updateEmployee={(next) => {
        updateEmployees(employees.map((employee) => (employee.id === next.id ? next : employee)));
      }}
    />
  );
}

export function EventsManningBoard() {
  const { events } = useEvents();
  const { employees } = useStaffDirectory();
  const { ids, update: updateIds } = useEventBoard();
  const { placements, update: updatePlacements } = useEventPlacements();
  const { labels, update: updateLabels } = useEventBoardLabels();
  const { labels: cardLabels, update: updateCardLabels } = useEventCardLabels();
  const { orders, update: updateOrders } = useEventBoardOrder();
  const locations = ids.flatMap((id) => {
    const event = events.find((item) => item.id === id);
    return event ? [{ id: event.id, nickname: event.name, venueName: "", color: "" }] : [];
  });

  function updateLocations(next: LocationReference[]) {
    const known = new Set(events.map((item) => item.id));
    updateIds(next.map((item) => item.id).filter((id) => known.has(id)));
  }

  const onBoard = new Set(ids);
  const placedIds = new Set(
    placements.flatMap((person) =>
      person.locationId && onBoard.has(person.locationId) ? [person.id] : [],
    ),
  );
  const staffChoices = employees.filter((employee) => !employee.archived).flatMap((employee) =>
    placedIds.has(employee.id)
      ? []
      : [{ id: employee.id, name: employee.fullName, position: employee.position }],
  );

  return (
    <PlacementBoard
      kind="event"
      catalog={events}
      staffChoices={staffChoices}
      employees={employees}
      titleId="events-manning-dialog-title"
      locations={locations}
      updateLocations={updateLocations}
      placements={placements}
      updatePlacements={updatePlacements}
      labels={labels}
      updateLabels={updateLabels}
      cardLabels={cardLabels}
      updateCardLabels={updateCardLabels}
      orders={orders}
      updateOrders={updateOrders}
    />
  );
}

function PlacementBoard({
  kind = "venue",
  catalog = [],
  venueCatalog = [],
  titleId,
  locations,
  updateLocations,
  placements,
  updatePlacements,
  labels,
  updateLabels,
  cardLabels,
  updateCardLabels,
  orders,
  updateOrders,
  unassignedPeople,
  staffChoices = [],
  employees = [],
  updateEmployees,
  updateEmployee,
}: {
  kind?: "venue" | "event";
  catalog?: EventDefinition[];
  venueCatalog?: LocationReference[];
  titleId: string;
  locations: LocationReference[];
  updateLocations: (next: LocationReference[]) => void;
  placements: StaffPlacement[];
  updatePlacements: (next: StaffPlacement[]) => void;
  labels: BoardLabel[];
  updateLabels: (next: BoardLabel[]) => void;
  cardLabels: CardLabel[];
  updateCardLabels: (next: CardLabel[]) => void;
  orders: ColumnOrders;
  updateOrders: (next: ColumnOrders) => void;
  unassignedPeople?: UnassignedPerson[];
  staffChoices?: UnassignedPerson[];
  employees?: StaffEmployee[];
  updateEmployees?: (next: StaffEmployee[]) => void;
  updateEmployee?: (employee: StaffEmployee) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const arrangeDialogRef = useRef<HTMLDialogElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const pendingRef = useRef<PendingDrag | null>(null);
  const htmlDragIdRef = useRef<string | null>(null);
  const placementsRef = useRef(placements);
  const locationsRef = useRef(locations);
  const labelsRef = useRef(labels);
  const ordersRef = useRef(orders);
  const { lookups } = useDirectoryLookups();
  const { roles: hiringRoles, update: updateHiring } = useHiring();
  const hiringRolesRef = useRef(hiringRoles);
  const { people: outsourcedPeople } = useOutsourced();
  const { promotions, update: updatePromotions } = usePromotions();
  const { includePromotions, setIncludePromotions } = usePayrollView();
  const privacy = usePrivacy();
  const [arrangementLocked, setArrangementLocked] = useState(kind === "venue");
  const [arrangePrompt, setArrangePrompt] = useState(false);
  const [arrangePassword, setArrangePassword] = useState("");
  const [arrangeError, setArrangeError] = useState("");
  const [arrangePending, setArrangePending] = useState(false);
  const hideSalary = (position: string) => salaryHidden(privacy.snapshot.hiddenSalaryPositions, position);
  const showHiring = privacy.snapshot.showHiring;
  const showPromotions = privacy.snapshot.showPromotions;
  const [today, setToday] = useState(todayIso);
  const [dialog, setDialog] = useState<DialogMode>(null);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [selectedVenueId, setSelectedVenueId] = useState("");
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [staffLocation, setStaffLocation] = useState("");
  const [labelText, setLabelText] = useState("");
  const [labelLocation, setLabelLocation] = useState("");
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [cardLabelStaffId, setCardLabelStaffId] = useState<string | null>(null);
  const [cardLabelText, setCardLabelText] = useState("");
  const [editForm, setEditForm] = useState<StaffEditForm | null>(null);
  const [hiringLocationId, setHiringLocationId] = useState("");
  const [hiringRoleId, setHiringRoleId] = useState("");
  const [hiringPositionId, setHiringPositionId] = useState("");
  const [hiringSalary, setHiringSalary] = useState("");
  const [promotionId, setPromotionId] = useState<string | null>(null);
  const [promotionStaffId, setPromotionStaffId] = useState<string | null>(null);
  const [promotionPositionId, setPromotionPositionId] = useState("");
  const [promotionPosition, setPromotionPosition] = useState("");
  const [promotionSalary, setPromotionSalary] = useState("");
  const [promotionDate, setPromotionDate] = useState("");
  const [profileStaffId, setProfileStaffId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [htmlDragId, setHtmlDragId] = useState<string | null>(null);
  const [htmlOver, setHtmlOver] = useState<string | null>(null);
  const columnDragIdRef = useRef<string | null>(null);
  const [columnDragId, setColumnDragId] = useState<string | null>(null);
  const [columnShift, setColumnShift] = useState<{ id: string; side: "before" | "after" } | null>(
    null,
  );
  const [labelSlot, setLabelSlot] = useState<LabelSlot | null>(null);
  const labelSlotRef = useRef<LabelSlot | null>(null);
  const labelInsertRef = useRef<LabelSlot | null>(null);
  const [status, setStatus] = useState("");
  const dragging = drag !== null;

  useLayoutEffect(() => {
    placementsRef.current = placements;
    locationsRef.current = locations;
    labelsRef.current = labels;
    ordersRef.current = orders;
    hiringRolesRef.current = hiringRoles;
  });

  const knownIds = new Set(locations.map((location) => location.id));

  useEffect(() => {
    function syncToday() {
      setToday(todayIso());
    }

    const timer = window.setInterval(syncToday, 60_000);
    document.addEventListener("visibilitychange", syncToday);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", syncToday);
    };
  }, []);

  useEffect(() => {
    if (kind !== "venue" || !updateEmployees) {
      return;
    }

    const settled = settleDuePromotions(promotions, employees, today);
    if (!settled) {
      return;
    }

    updatePromotions(settled.promotions);
    if (settled.employeesChanged) {
      updateEmployees(settled.employees);
    }
  }, [employees, kind, promotions, today, updateEmployees, updatePromotions]);

  useLayoutEffect(() => {
    const node = dialogRef.current;
    if (!node?.isConnected) {
      return;
    }

    if (dialog && !node.open) {
      node.showModal();
      node.querySelector<HTMLInputElement>("input")?.focus();
    }

    if (!dialog && node.open) {
      node.close();
    }
  }, [dialog]);

  useLayoutEffect(() => {
    const node = arrangeDialogRef.current;
    if (!node?.isConnected) {
      return;
    }

    if (arrangePrompt && !node.open) {
      node.showModal();
    }

    if (!arrangePrompt && node.open) {
      node.close();
    }
  }, [arrangePrompt]);

  function dismissDialog() {
    setEditingLabelId(null);
    setCardLabelStaffId(null);
    setEditForm(null);
    setProfileStaffId(null);
    setDialog(null);
  }

  function requestArrangeToggle() {
    if (!arrangementLocked) {
      setArrangementLocked(true);
      return;
    }

    const arrangeProtected =
      privacy.snapshot.passwordEnabled &&
      featureIsProtected("location-arrange", privacy.snapshot.protectedFeatures);

    if (!arrangeProtected) {
      setArrangementLocked(false);
      return;
    }

    setArrangePassword("");
    setArrangeError("");
    setArrangePrompt(true);
  }

  async function submitArrangePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setArrangePending(true);
    setArrangeError("");
    const result = await privacyUnlockAction(arrangePassword);
    setArrangePending(false);

    if (result.snapshot) {
      privacy.applySnapshot(result.snapshot);
    }

    if (!result.ok) {
      setArrangeError(result.error && result.error !== "Incorrect password" ? result.error : "Incorrect password.");
      return;
    }

    if (result.snapshot) {
      privacy.unlock(result.snapshot.stamp);
    }

    setArrangePassword("");
    setArrangePrompt(false);
    setArrangementLocked(false);
  }

  const moveStaff = useCallback(
    (staffId: string, slot: LabelSlot) => {
      const currentLocations = locationsRef.current;
      const known = new Set(currentLocations.map((location) => location.id));
      if (slot.locationId && !known.has(slot.locationId)) {
        return;
      }

      const current = placementsRef.current;
      const person = current.find((item) => item.id === staffId);
      if (!person) {
        return;
      }

      const from = resolvedLocationId(person, known);
      const to = slot.locationId;
      const currentLabels = labelsRef.current;
      const currentOrders = ordersRef.current;
      const sourceRows = visualRows(
        from,
        staffId,
        current,
        known,
        currentOrders,
        currentLabels,
        hiringRolesRef.current,
        currentLocations,
      );
      const targetRows =
        from === to
          ? sourceRows
          : visualRows(
              to,
              staffId,
              current,
              known,
              currentOrders,
              currentLabels,
              hiringRolesRef.current,
              currentLocations,
            );
      const inserted = insertStaff(targetRows, staffId, slot.beforeItemId);
      const unchanged =
        from === to &&
        sameVisual(
          visualRows(
            from,
            undefined,
            current,
            known,
            currentOrders,
            currentLabels,
            hiringRolesRef.current,
            currentLocations,
          ),
          inserted,
        );
      if (unchanged) {
        return;
      }

      let nextLabels = currentLabels;
      const nextOrders = { ...currentOrders };
      if (from !== to) {
        nextLabels = reanchorLabels(nextLabels, from, sourceRows);
        nextOrders[columnOrderKey(from)] = persistedOrder(sourceRows);
        updatePlacements(
          current.map((item) => (item.id === staffId ? { ...item, locationId: to } : item)),
        );
      }

      nextLabels = reanchorLabels(nextLabels, to, inserted);
      nextOrders[columnOrderKey(to)] = persistedOrder(inserted);
      updateLabels(nextLabels);
      updateOrders(nextOrders);

      const place = to
        ? (currentLocations.find((location) => location.id === to)?.nickname ??
          (kind === "event" ? "an event" : "a venue"))
        : "Not placed";
      setStatus(from === to ? `Moved ${person.name}.` : `Moved ${person.name} to ${place}.`);
    },
    [kind, updateLabels, updateOrders, updatePlacements],
  );

  const placeLabel = useCallback(
    (labelId: string, slot: LabelSlot, labels = labelsRef.current) => {
      const currentLocations = locationsRef.current;
      const known = new Set(currentLocations.map((location) => location.id));
      if (slot.locationId && !known.has(slot.locationId)) {
        return;
      }

      const label = labels.find((item) => item.id === labelId);
      if (!label) {
        return;
      }

      const alreadyPlaced = labelsRef.current.some((item) => item.id === labelId);
      const from = label.locationId && known.has(label.locationId) ? label.locationId : null;
      const to = slot.locationId;
      const placements = placementsRef.current;
      const currentOrders = ordersRef.current;
      const hiring = hiringRolesRef.current;
      const sourceRows = visualRows(
        from,
        labelId,
        placements,
        known,
        currentOrders,
        labels,
        hiring,
        currentLocations,
      );
      const targetRows =
        from === to
          ? sourceRows
          : visualRows(to, labelId, placements, known, currentOrders, labels, hiring, currentLocations);
      const inserted = insertItem(targetRows, { kind: "label", id: labelId }, slot.beforeItemId);
      const unchanged =
        alreadyPlaced &&
        from === to &&
        sameVisual(
          visualRows(from, undefined, placements, known, currentOrders, labels, hiring, currentLocations),
          inserted,
        );
      if (unchanged) {
        return;
      }

      let nextLabels = labels.filter((item) => item.id !== labelId);
      const nextOrders = { ...currentOrders };
      if (from !== to) {
        nextLabels = reanchorLabels(nextLabels, from, sourceRows);
        nextOrders[columnOrderKey(from)] = persistedOrder(sourceRows);
      }

      nextLabels = reanchorLabels(
        [...nextLabels, { ...label, locationId: to, beforeId: null, rank: 0 }],
        to,
        inserted,
      );
      nextOrders[columnOrderKey(to)] = persistedOrder(inserted);
      updateLabels(nextLabels);
      updateOrders(nextOrders);

      const place = to
        ? (currentLocations.find((location) => location.id === to)?.nickname ??
          (kind === "event" ? "an event" : "a venue"))
        : "Not placed";
      setStatus(from === to ? `Moved ${label.text}.` : `Moved ${label.text} to ${place}.`);
    },
    [kind, updateLabels, updateOrders],
  );

  const moveHiring = useCallback(
    (roleId: string, slot: LabelSlot) => {
      const currentLocations = locationsRef.current;
      const to = slot.locationId;
      if (!to || !currentLocations.some((location) => location.id === to)) {
        return;
      }

      const roles = hiringRolesRef.current;
      const role = roles.find((item) => item.id === roleId);
      if (!role) {
        return;
      }

      const from = locationIdForRole(role, currentLocations);
      const known = new Set(currentLocations.map((location) => location.id));
      const current = placementsRef.current;
      const currentLabels = labelsRef.current;
      const currentOrders = ordersRef.current;
      const sourceRows = visualRows(
        from,
        roleId,
        current,
        known,
        currentOrders,
        currentLabels,
        roles,
        currentLocations,
      );
      const targetRows =
        from === to
          ? sourceRows
          : visualRows(to, roleId, current, known, currentOrders, currentLabels, roles, currentLocations);
      const inserted = insertItem(targetRows, { kind: "hiring", id: roleId }, slot.beforeItemId);
      const unchanged =
        from === to &&
        sameVisual(
          visualRows(from, undefined, current, known, currentOrders, currentLabels, roles, currentLocations),
          inserted,
        );
      if (unchanged) {
        return;
      }

      const nextOrders = { ...currentOrders };
      if (from && from !== to) {
        nextOrders[columnOrderKey(from)] = persistedOrder(sourceRows);
      }

      nextOrders[columnOrderKey(to)] = persistedOrder(inserted);
      updateOrders(nextOrders);
      if (from !== to) {
        const location = currentLocations.find((item) => item.id === to);
        const venue = location ? location.venueName || location.nickname : role.venue;
        updateHiring(roles.map((item) => (item.id === roleId ? { ...item, venue } : item)));
      }

      const place = currentLocations.find((location) => location.id === to)?.nickname ?? "a venue";
      setStatus(from === to ? `Moved ${role.position}.` : `Moved ${role.position} to ${place}.`);
    },
    [updateHiring, updateOrders],
  );

  const syncLabelSlot = useCallback((x: number, y: number) => {
    const id = htmlDragIdRef.current ?? dragRef.current?.staffId ?? null;
    const next = id ? slotAt(x, y, id) : null;
    const label = id ? labelsRef.current.find((item) => item.id === id) : undefined;
    let slot = next;
    if (!next || !id) {
      slot = null;
    } else if (label) {
      slot = labelDropUnchanged(
        label.id,
        next,
        placementsRef.current,
        locationsRef.current,
        ordersRef.current,
        labelsRef.current,
        hiringRolesRef.current,
      )
        ? null
        : next;
    } else if (
      staffDropUnchanged(
        id,
        next,
        placementsRef.current,
        locationsRef.current,
        ordersRef.current,
        labelsRef.current,
        hiringRolesRef.current,
      )
    ) {
      slot = null;
    }

    if (sameLabelSlot(labelSlotRef.current, slot)) {
      return;
    }

    labelSlotRef.current = slot;
    setLabelSlot(slot);
  }, []);

  const finishDrag = useCallback(
    (clientX: number, clientY: number) => {
      const active = dragRef.current;
      dragRef.current = null;
      pendingRef.current = null;
      labelSlotRef.current = null;
      setDrag(null);
      setLabelSlot(null);
      if (!active) {
        return;
      }

      const slot = slotAt(clientX, clientY, active.staffId);
      if (!slot) {
        return;
      }

      if (labelsRef.current.some((item) => item.id === active.staffId)) {
        placeLabel(active.staffId, slot);
        return;
      }

      if (hiringRolesRef.current.some((role) => role.id === active.staffId)) {
        moveHiring(active.staffId, slot);
        return;
      }

      moveStaff(active.staffId, slot);
    },
    [moveHiring, moveStaff, placeLabel],
  );

  useEffect(() => {
    if (!dragging) {
      return;
    }

    const { style } = document.body;
    const previousCursor = style.cursor;
    const previousUserSelect = style.userSelect;
    style.cursor = "grabbing";
    style.userSelect = "none";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      dragRef.current = null;
      pendingRef.current = null;
      labelSlotRef.current = null;
      setDrag(null);
      setLabelSlot(null);
    }

    function onPointerUp(event: PointerEvent) {
      if (dragRef.current && event.pointerId !== dragRef.current.pointerId) {
        return;
      }

      finishDrag(event.clientX, event.clientY);
    }

    function onPointerCancel(event: PointerEvent) {
      if (dragRef.current && event.pointerId !== dragRef.current.pointerId) {
        return;
      }

      dragRef.current = null;
      pendingRef.current = null;
      labelSlotRef.current = null;
      setDrag(null);
      setLabelSlot(null);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    return () => {
      style.cursor = previousCursor;
      style.userSelect = previousUserSelect;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
    };
  }, [dragging, finishDrag]);

  useEffect(() => {
    if (!dragging) {
      return;
    }

    let frame = 0;
    const tick = () => {
      const current = dragRef.current;
      const scroller = scrollerRef.current;
      if (current && scroller) {
        const rect = scroller.getBoundingClientRect();
        const edge = 72;
        if (current.x < rect.left + edge) {
          scroller.scrollLeft -= 14;
        } else if (current.x > rect.right - edge) {
          scroller.scrollLeft += 14;
        }

        const over = dropIdAt(current.x, current.y);
        if (over !== current.over) {
          const next = { ...current, over };
          dragRef.current = next;
          setDrag(next);
        }

        syncLabelSlot(current.x, current.y);
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [dragging, syncLabelSlot]);

  function peopleAt(locationId: string | null) {
    return orderedPeople(
      placements.filter((person) => resolvedLocationId(person, knownIds) === locationId),
      locationId,
      orders,
    );
  }

  function openVenueDialog() {
    setFormError("");
    setPendingRemoveId(null);
    if (kind === "event") {
      const available = catalog.filter((item) => !locations.some((location) => location.id === item.id));
      setSelectedEventId(available[0]?.id ?? "");
    } else {
      const available = venueCatalog.filter(
        (item) => !locations.some((location) => location.id === item.id),
      );
      setSelectedVenueId(available[0]?.id ?? "");
    }
    setDialog("venue");
  }

  function openStaffDialog(locationId = "") {
    setSelectedStaffId("");
    setStaffLocation(locationId || (kind === "event" ? (locations[0]?.id ?? "") : ""));
    setFormError("");
    setPendingRemoveId(null);
    setDialog("staff");
  }

  function addVenue(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (kind === "event") {
      const chosen = catalog.find((item) => item.id === selectedEventId);
      if (!chosen || locations.some((location) => location.id === chosen.id)) {
        setFormError(catalog.length === 0 ? "Add events in Settings first." : "Choose an event.");
        return;
      }

      updateLocations([...locations, { id: chosen.id, nickname: chosen.name, venueName: "", color: "" }]);
      setDialog(null);
      return;
    }

    const chosen = venueCatalog.find((item) => item.id === selectedVenueId);
    if (!chosen || locations.some((location) => location.id === chosen.id)) {
      setFormError(venueCatalog.length === 0 ? "Add venues in Settings first." : "Choose a venue.");
      return;
    }

    updateLocations([...locations, chosen]);
    setDialog(null);
  }

  function addStaff(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const person = staffChoices.find((item) => item.id === selectedStaffId);
    if (!person) {
      setFormError(staffChoices.length === 0 ? "No unassigned employees." : "Choose an employee.");
      return;
    }

    const locationId = staffLocation && knownIds.has(staffLocation) ? staffLocation : null;
    if (kind === "event" && !locationId) {
      setFormError(locations.length === 0 ? "Add an event first." : "Choose an event.");
      return;
    }

    const next = placements.some((item) => item.id === person.id)
      ? placements.map((item) => (item.id === person.id ? { ...item, locationId } : item))
      : [
          ...placements,
          { id: person.id, name: person.name, locationId, position: person.position },
        ];
    updatePlacements(next);
    setDialog(null);
    const label = locationId
      ? (locations.find((location) => location.id === locationId)?.nickname ??
        (kind === "event" ? "an event" : "a venue"))
      : "Not placed";
    setStatus(`Added ${person.name} to ${label}.`);
  }

  function openPromotion(staffId: string) {
    const employee = employees.find((item) => item.id === staffId);
    const person = placements.find((item) => item.id === staffId);
    const currentPosition = (employee?.position ?? person?.position ?? "").trim();
    const match = lookups.positions.find(
      (position) => position.name.toLowerCase() === currentPosition.toLowerCase(),
    );
    setPromotionId(null);
    setPromotionStaffId(staffId);
    setPromotionPositionId(match?.id ?? (currentPosition ? "__kept__" : ""));
    setPromotionPosition(currentPosition);
    setPromotionSalary(defaultSalaryText(match));
    setPromotionDate(today);
    setFormError("");
    setPendingRemoveId(null);
    setDialog("promotion");
  }

  function openEditPromotion(staffId: string) {
    const existing = pendingPromotion(promotions, staffId, today);
    if (!existing) {
      openPromotion(staffId);
      return;
    }

    const match = lookups.positions.find(
      (position) => position.name.toLowerCase() === existing.newPosition.trim().toLowerCase(),
    );
    setPromotionId(existing.id);
    setPromotionStaffId(staffId);
    setPromotionPositionId(match?.id ?? (existing.newPosition ? "__kept__" : ""));
    setPromotionPosition(existing.newPosition);
    setPromotionSalary(String(existing.newSalary));
    setPromotionDate(existing.effectiveDate);
    setFormError("");
    setPendingRemoveId(null);
    setDialog("promotion");
  }

  function selectPromotionPosition(positionId: string) {
    if (positionId === "__kept__") {
      const employee = employees.find((item) => item.id === promotionStaffId);
      const person = placements.find((item) => item.id === promotionStaffId);
      setPromotionPositionId("__kept__");
      setPromotionPosition((employee?.position ?? person?.position ?? promotionPosition).trim());
      return;
    }

    const next = lookups.positions.find((position) => position.id === positionId);
    setPromotionPositionId(positionId);
    setPromotionPosition(next?.name ?? "");
    setPromotionSalary(defaultSalaryText(next));
  }

  function savePromotion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const employee = employees.find((item) => item.id === promotionStaffId);
    const person = placements.find((item) => item.id === promotionStaffId);
    const newPosition = promotionPosition.trim().replace(/\s+/g, " ");
    const newSalary = parseMoneyInput(promotionSalary);
    if (!employee && !person) {
      setFormError("Choose a staff member.");
      return;
    }

    if (!newPosition) {
      setFormError("Choose a position.");
      return;
    }

    if (newSalary == null || newSalary < 0) {
      setFormError("Enter a salary package of zero or more.");
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(promotionDate)) {
      setFormError("Choose an effective date.");
      return;
    }

    const currentPosition = (employee?.position ?? person?.position ?? "").trim();
    const currentSalary = employee?.salary ?? person?.salary ?? null;
    const packageAmount = roundMoney(newSalary);
    const samePosition = newPosition.toLowerCase() === currentPosition.toLowerCase();
    const sameSalary = currentSalary != null && roundMoney(currentSalary) === packageAmount;
    if (samePosition && sameSalary) {
      setFormError("Change the position or the salary package.");
      return;
    }

    const due = promotionDate <= today;
    const previous = promotions.find((item) => item.id === promotionId) ?? null;
    const promotion: StaffPromotion = {
      id: promotionId ?? crypto.randomUUID(),
      staffId: employee?.id ?? person?.id ?? "",
      staffName: employee?.fullName ?? person?.name ?? "",
      currentPosition: previous?.currentPosition ?? currentPosition,
      currentSalary: previous?.currentSalary ?? currentSalary,
      newPosition,
      newSalary: packageAmount,
      effectiveDate: promotionDate,
      applied: due,
    };
    updatePromotions((current) =>
      promotionId
        ? current.map((item) => (item.id === promotionId ? promotion : item))
        : [promotion, ...current],
    );
    if (due && employee && updateEmployee) {
      updateEmployee({ ...employee, position: newPosition, ...splitSalary(packageAmount) });
    }
    const name = promotion.staffName;
    setStatus(
      promotionId
        ? `Updated the promotion for ${name}.`
        : due
          ? `${name} now shows ${newPosition} at ${formatBoardSalary(packageAmount)}.`
          : `Promotion recorded for ${name}. It takes effect ${promotionDate}.`,
    );
    setDialog(null);
  }

  function openEditStaff(staffId: string) {
    const employee = employees.find((item) => item.id === staffId);
    const person = placements.find((item) => item.id === staffId);
    if (!employee && !person) {
      return;
    }

    const locationId = employee
      ? (locationIdForVenue(employee.venue, locations) ?? "")
      : person?.locationId && knownIds.has(person.locationId)
        ? person.locationId
        : "";
    setEditForm({
      id: staffId,
      fullName: employee?.fullName ?? person?.name ?? "",
      firstName: employee?.firstName ?? "",
      lastName: employee?.lastName ?? "",
      nationality: employee?.nationality ?? "",
      dateOfBirth: employee?.dateOfBirth ?? "",
      joiningDate: employee?.joiningDate ?? "",
      position: employee?.position ?? person?.position ?? "",
      locationId,
      basicSalary: moneyField(employee?.basicSalary ?? null),
      allowances: moneyField(employee?.allowances ?? null),
      salary: moneyField(employee?.salary ?? person?.salary ?? null),
      photo: employee?.photo ?? null,
    });
    setFormError("");
    setPendingRemoveId(null);
    setDialog("editStaff");
  }

  function saveEditStaff(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editForm) {
      return;
    }

    const name = normalizePlacementName(editForm.fullName);
    if (!name) {
      setFormError("Enter a name.");
      return;
    }

    const position = normalizePlacementName(editForm.position);
    if (!position) {
      setFormError("Enter a position.");
      return;
    }

    const basicSalary = parseMoneyInput(editForm.basicSalary);
    const allowances = parseMoneyInput(editForm.allowances);
    const salary = parseMoneyInput(editForm.salary);
    if ([basicSalary, allowances, salary].some((amount) => amount != null && amount < 0)) {
      setFormError("Salary can't be negative.");
      return;
    }

    if (editForm.dateOfBirth && editForm.dateOfBirth > new Date().toISOString().slice(0, 10)) {
      setFormError("Date of birth can't be in the future.");
      return;
    }

    const pay = resolvePay(basicSalary, allowances, salary);
    const locationId = editForm.locationId && knownIds.has(editForm.locationId) ? editForm.locationId : null;
    if (kind === "event" && !locationId) {
      setFormError(locations.length === 0 ? "Add an event first." : "Choose an event.");
      return;
    }
    const employee = employees.find((item) => item.id === editForm.id);
    if (kind === "venue" && employee && updateEmployee) {
      const location = locations.find((item) => item.id === locationId);
      const parts = splitFullName(name);
      updateEmployee({
        ...employee,
        fullName: name,
        firstName: editForm.firstName.trim() || parts.firstName,
        lastName: editForm.lastName.trim() || parts.lastName,
        nationality: editForm.nationality.trim(),
        dateOfBirth: editForm.dateOfBirth,
        joiningDate: editForm.joiningDate,
        position,
        venue: location ? location.venueName || location.nickname : "",
        photo: editForm.photo,
        ...pay,
      });
    } else {
      updatePlacements(
        placements.map((person) =>
          person.id === editForm.id
            ? { ...person, name, locationId, position, salary: pay.salary }
            : person,
        ),
      );
    }

    setEditForm(null);
    setDialog(null);
    setStatus(`Updated ${name}.`);
  }

  function openAddHiring(locationId: string) {
    setHiringLocationId(locationId);
    setHiringRoleId("");
    setHiringPositionId("");
    setHiringSalary("");
    setFormError("");
    setPendingRemoveId(null);
    setDialog("hiring");
  }

  function openEditHiring(locationId: string, roleId: string | null = null) {
    const roles = hiringAt(locationId);
    const role = roles.find((item) => item.id === roleId) ?? roles[0];
    setHiringLocationId(locationId);
    setHiringRoleId(role?.id ?? "");
    applyHiringRole(role);
    setFormError("");
    setPendingRemoveId(null);
    setDialog("editHiring");
  }

  function applyHiringRole(role: HiringRole | undefined) {
    if (!role) {
      setHiringPositionId("");
      setHiringSalary("");
      return;
    }

    const match = lookups.positions.find(
      (position) => position.name.toLowerCase() === role.position.toLowerCase(),
    );
    setHiringPositionId(match?.id ?? `name:${role.position}`);
    setHiringSalary(role.salary == null ? "" : String(role.salary));
  }

  function selectHiringPosition(positionId: string) {
    if (positionId.startsWith("name:")) {
      setHiringPositionId(positionId);
      return;
    }

    const position = lookups.positions.find((item) => item.id === positionId);
    setHiringPositionId(positionId);
    setHiringSalary(position?.defaultSalary == null ? "" : String(position.defaultSalary));
  }

  function saveHiringRole(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const position = lookups.positions.find((item) => item.id === hiringPositionId);
    const namedPosition = hiringPositionId.startsWith("name:") ? hiringPositionId.slice(5) : "";
    if (!position && !namedPosition) {
      setFormError("Choose a position.");
      return;
    }

    const salaryText = hiringSalary.trim();
    const salary = salaryText ? parseMoneyInput(salaryText) : null;
    if (salaryText && (salary == null || salary < 0)) {
      setFormError("Enter a salary of zero or more.");
      return;
    }

    const department = position
      ? (lookups.departments.find((item) => item.id === position.departmentId)?.name ?? "")
      : "";
    const positionName = position?.name ?? namedPosition;
    const location = locations.find((item) => item.id === hiringLocationId);
    if (!location) {
      return;
    }

    if (dialog === "editHiring") {
      const current = hiringRoles.find((item) => item.id === hiringRoleId);
      if (!current) {
        setFormError("Choose a hiring position.");
        return;
      }

      updateHiring(
        hiringRoles.map((item) =>
          item.id === current.id
            ? {
                ...item,
                position: positionName,
                department: department || item.department,
                salary,
              }
            : item,
        ),
      );
      setDialog(null);
      setStatus(`Updated hiring for ${positionName}.`);
      return;
    }

    const role: HiringRole = {
      id: crypto.randomUUID(),
      position: positionName,
      department,
      venue: location.venueName || location.nickname,
      openings: 1,
      status: "open",
      salary,
    };
    updateHiring([...hiringRoles, role]);
    setDialog(null);
    setStatus(`Added hiring for ${positionName} at ${location.nickname}.`);
  }

  function openLabelDialog(locationId = "", x = 0, y = 0, aboveItemId: string | null = null) {
    setEditingLabelId(null);
    setLabelText("");
    setLabelLocation(locationId === unassignedDropId ? "" : locationId);
    const columnId = !locationId || locationId === unassignedDropId ? null : locationId;
    labelInsertRef.current = aboveItemId
      ? slotBeforeItem(columnId, rowsAt(columnId), aboveItemId)
      : slotAt(x, y, "");
    setFormError("");
    setPendingRemoveId(null);
    setDialog("label");
  }

  function openCardLabelDialog(staffId: string) {
    const current = cardLabels.find((item) => item.staffId === staffId);
    setCardLabelStaffId(staffId);
    setCardLabelText(current?.text ?? "");
    setFormError("");
    setPendingRemoveId(null);
    setDialog("cardLabel");
  }

  function removeCardLabel(staffId: string) {
    const current = cardLabels.find((item) => item.staffId === staffId);
    updateCardLabels(cardLabels.filter((item) => item.staffId !== staffId));
    if (current) {
      setStatus(`Removed the label from ${placements.find((item) => item.id === staffId)?.name ?? "this card"}.`);
    }
  }

  function saveCardLabel(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = normalizePlacementName(cardLabelText);
    if (!text) {
      setFormError("Enter a label.");
      return;
    }

    if (!cardLabelStaffId) {
      return;
    }

    const existing = cardLabels.some((item) => item.staffId === cardLabelStaffId);
    updateCardLabels([
      ...cardLabels.filter((item) => item.staffId !== cardLabelStaffId),
      { staffId: cardLabelStaffId, text },
    ]);
    const name = placements.find((item) => item.id === cardLabelStaffId)?.name ?? "this card";
    setCardLabelStaffId(null);
    setDialog(null);
    setStatus(`${existing ? "Updated" : "Added"} the label on ${name}.`);
  }

  function restartPositions(locationId: string | null) {
    const people = peopleAt(locationId);
    const rank = positionRanks(lookups);
    const sorted = [...people].sort((left, right) => {
      const leftRank = rank.get(normalizeName(left.position ?? "").toLowerCase());
      const rightRank = rank.get(normalizeName(right.position ?? "").toLowerCase());
      return (leftRank ?? Number.MAX_SAFE_INTEGER) - (rightRank ?? Number.MAX_SAFE_INTEGER);
    });
    const rows = columnRows(people, labels, locationId).map((row) =>
      row.kind === "staff"
        ? { kind: "staff" as const, id: row.person.id }
        : { kind: "label" as const, id: row.label.id },
    );
    let cursor = 0;
    const nextRows = rows.map((row) => {
      if (row.kind === "label") {
        return row;
      }

      const person = sorted[cursor];
      cursor += 1;
      return person ? { kind: "staff" as const, id: person.id } : row;
    });
    updateLabels(reanchorLabels(labels, locationId, nextRows));
    updateOrders({
      ...orders,
      [columnOrderKey(locationId)]: staffIdsOf(nextRows),
    });
    const place = locationId
      ? locations.find((location) => location.id === locationId)?.nickname
      : "Not placed";
    setStatus(
      place ? `Restored the default position order in ${place}.` : "Restored the default position order.",
    );
  }

  function openEditLabel(id: string) {
    const current = labels.find((item) => item.id === id);
    if (!current) {
      return;
    }

    setEditingLabelId(id);
    setLabelText(current.text);
    setFormError("");
    setPendingRemoveId(null);
    setDialog("label");
  }

  function deleteLabel(id: string) {
    const current = labels.find((item) => item.id === id);
    updateLabels(labels.filter((item) => item.id !== id));
    if (current) {
      setStatus(`Removed ${current.text}.`);
    }
  }

  function addLabel(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = normalizePlacementName(labelText);
    if (!text) {
      setFormError("Enter a separation.");
      return;
    }

    if (editingLabelId) {
      updateLabels(
        labels.map((item) => (item.id === editingLabelId ? { ...item, text } : item)),
      );
      setEditingLabelId(null);
      setDialog(null);
      setStatus(`Updated ${text}.`);
      return;
    }

    const locationId = labelLocation && knownIds.has(labelLocation) ? labelLocation : null;
    const clicked = labelInsertRef.current;
    const slot =
      clicked && (clicked.locationId ?? null) === locationId
        ? clicked
        : {
            locationId,
            beforeId: peopleAt(locationId)[0]?.id ?? null,
            index: 0,
            beforeItemId: peopleAt(locationId)[0]?.id ?? null,
          };
    const id = crypto.randomUUID();
    labelInsertRef.current = null;
    setDialog(null);
    placeLabel(
      id,
      { ...slot, locationId },
      [...labels, { id, text, locationId: null, beforeId: null, rank: 0 }],
    );
    const place = locationId
      ? (locations.find((location) => location.id === locationId)?.nickname ??
        (kind === "event" ? "an event" : "a venue"))
      : "Not placed";
    setStatus(`Added ${text} to ${place}.`);
  }

  function removeStaff(id: string) {
    const person = placements.find((item) => item.id === id);
    if (!person) {
      return;
    }

    const locationId = resolvedLocationId(person, knownIds);
    const people = peopleAt(locationId);
    const nextPerson = people[people.findIndex((item) => item.id === id) + 1];
    updateLabels(
      labels.map((label) =>
        label.beforeId === id ? { ...label, beforeId: nextPerson?.id ?? null } : label,
      ),
    );
    updateCardLabels(cardLabels.filter((item) => item.staffId !== id));
    const nextOrders = { ...orders };
    for (const key of Object.keys(nextOrders)) {
      const remaining = nextOrders[key].filter((item) => item !== id);
      if (remaining.length === 0) {
        delete nextOrders[key];
      } else {
        nextOrders[key] = remaining;
      }
    }
    updateOrders(nextOrders);
    updatePlacements(placements.filter((item) => item.id !== id));
    setStatus(`Removed ${person.name}.`);
  }

  function removeVenue(id: string) {
    updateLocations(locations.filter((location) => location.id !== id));
    updatePlacements(
      kind === "event"
        ? placements.filter((person) => person.locationId !== id)
        : placements.map((person) =>
            person.locationId === id ? { ...person, locationId: null } : person,
          ),
    );
    updateLabels(labels.filter((label) => label.locationId !== id));
    setPendingRemoveId(null);
  }

  function openUnassignedDialog() {
    setFormError("");
    setPendingRemoveId(null);
    setDialog("unassigned");
  }

  function startDrag(event: React.PointerEvent<HTMLElement>, staffId: string) {
    if (arrangementLocked) {
      return;
    }

    if (event.pointerType !== "touch" && event.pointerType !== "pen") {
      return;
    }

    if (event.button !== 0) {
      return;
    }

    if ((event.target as HTMLElement).closest("button")) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pendingRef.current = {
      staffId,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
    setPendingRemoveId(null);
  }

  function moveDrag(event: React.PointerEvent<HTMLElement>) {
    const pending = pendingRef.current;
    if (!pending || event.pointerId !== pending.pointerId) {
      return;
    }

    if (!dragRef.current) {
      const dx = event.clientX - pending.x;
      const dy = event.clientY - pending.y;
      if (dx * dx + dy * dy < 25) {
        return;
      }
    }

    const next = {
      staffId: pending.staffId,
      pointerId: pending.pointerId,
      x: event.clientX,
      y: event.clientY,
      over: dropIdAt(event.clientX, event.clientY),
    };
    dragRef.current = next;
    setDrag(next);
  }

  function endDrag(event: React.PointerEvent<HTMLElement>) {
    const pending = pendingRef.current;
    const active = dragRef.current;
    const pointerId = active?.pointerId ?? pending?.pointerId;
    if (pointerId == null || event.pointerId !== pointerId) {
      return;
    }

    finishDrag(event.clientX, event.clientY);
  }

  function openProfile(staffId: string) {
    setProfileStaffId(staffId);
    setFormError("");
    setPendingRemoveId(null);
    setDialog("profile");
  }

  function scrollBoard(clientX: number) {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }

    const rect = scroller.getBoundingClientRect();
    const edge = 72;
    if (clientX < rect.left + edge) {
      scroller.scrollLeft -= 18;
    } else if (clientX > rect.right - edge) {
      scroller.scrollLeft += 18;
    }
  }

  function columnSide(dropId: string, clientX: number): "before" | "after" {
    const column = document.querySelector(`[data-drop-id="${CSS.escape(dropId)}"]`);
    if (!(column instanceof HTMLElement)) {
      return "before";
    }

    const rect = column.getBoundingClientRect();
    return clientX < rect.left + rect.width / 2 ? "before" : "after";
  }

  function startColumnDrag(event: React.DragEvent<HTMLElement>, locationId: string) {
    columnDragIdRef.current = locationId;
    event.stopPropagation();
    try {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", `column:${locationId}`);
      const section = event.currentTarget.closest("section");
      if (section instanceof HTMLElement) {
        const rect = section.getBoundingClientRect();
        event.dataTransfer.setDragImage(section, event.clientX - rect.left, event.clientY - rect.top);
      }
    } catch {
      // The column id is kept in memory when the browser blocks the drag payload.
    }
    setColumnDragId(locationId);
    setColumnShift(null);
    setPendingRemoveId(null);
  }

  function endColumnDrag() {
    columnDragIdRef.current = null;
    setColumnDragId(null);
    setColumnShift(null);
  }

  function dragColumnOver(event: React.DragEvent<HTMLElement>, dropId: string) {
    const fromId = columnDragIdRef.current;
    if (!fromId) {
      return false;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    scrollBoard(event.clientX);
    if (fromId === dropId) {
      setColumnShift((current) => (current == null ? current : null));
      return true;
    }

    const side = columnSide(dropId, event.clientX);
    setColumnShift((current) =>
      current?.id === dropId && current.side === side ? current : { id: dropId, side },
    );
    return true;
  }

  function dropColumn(event: React.DragEvent<HTMLElement>, dropId: string) {
    const fromId = columnDragIdRef.current;
    if (!fromId) {
      return false;
    }

    event.preventDefault();
    const side = columnSide(dropId, event.clientX);
    endColumnDrag();
    if (fromId === dropId) {
      return true;
    }

    const current = locationsRef.current;
    const moved = current.find((item) => item.id === fromId);
    if (!moved || !current.some((item) => item.id === dropId)) {
      return true;
    }

    const rest = current.filter((item) => item.id !== fromId);
    const targetIndex = rest.findIndex((item) => item.id === dropId);
    const insertAt = side === "after" ? targetIndex + 1 : targetIndex;
    const next = rest.slice();
    next.splice(insertAt, 0, moved);
    updateLocations(next);
    const target = current.find((item) => item.id === dropId);
    setStatus(
      `Moved ${moved.nickname} ${side === "before" ? "before" : "after"} ${target?.nickname ?? "the column"}.`,
    );
    return true;
  }

  function startHtmlDrag(event: React.DragEvent<HTMLElement>, staffId: string) {
    if (arrangementLocked) {
      event.preventDefault();
      return;
    }

    if ((event.target as HTMLElement).closest("[data-profile]")) {
      return;
    }

    htmlDragIdRef.current = staffId;
    event.dataTransfer.setData("text/plain", staffId);
    event.dataTransfer.effectAllowed = "move";
    setHtmlDragId(staffId);
    setPendingRemoveId(null);
  }

  function endHtmlDrag() {
    htmlDragIdRef.current = null;
    labelSlotRef.current = null;
    setHtmlDragId(null);
    setHtmlOver(null);
    setLabelSlot(null);
  }

  function dropHtml(event: React.DragEvent<HTMLElement>, dropId: string) {
    if (dropColumn(event, dropId)) {
      return;
    }

    event.preventDefault();
    if (arrangementLocked) {
      endHtmlDrag();
      return;
    }

    const staffId = htmlDragIdRef.current || event.dataTransfer.getData("text/plain");
    const droppedLabel = staffId
      ? labelsRef.current.find((item) => item.id === staffId)
      : undefined;
    const slot = staffId ? (slotAt(event.clientX, event.clientY, staffId) ?? labelSlotRef.current) : null;
    endHtmlDrag();
    if (!staffId) {
      return;
    }

    if (droppedLabel) {
      if (slot) {
        placeLabel(droppedLabel.id, slot);
      }
      return;
    }

    if (hiringRoles.some((role) => role.id === staffId)) {
      moveHiring(
        staffId,
        slot ?? {
          locationId: dropId === unassignedDropId ? null : dropId,
          beforeId: null,
          index: 0,
          beforeItemId: null,
        },
      );
      return;
    }

    moveStaff(
      staffId,
      slot ?? {
        locationId: dropId === unassignedDropId ? null : dropId,
        beforeId: null,
        index: 0,
        beforeItemId: null,
      },
    );
  }

  function rowsAt(locationId: string | null) {
    return columnRows(peopleAt(locationId), labels, locationId);
  }

  function matchesVenue(venue: string, locationId: string | null) {
    if (kind !== "venue" || !locationId) {
      return false;
    }

    const location = locations.find((item) => item.id === locationId);
    if (!location) {
      return false;
    }

    return (
      sameLocationName(venue, location.venueName) || sameLocationName(venue, location.nickname)
    );
  }

  function hiringAt(locationId: string | null) {
    if (!locationId) {
      return [];
    }

    return hiringRoles.filter(
      (role) => !role.archived && locationIdForRole(role, locations) === locationId,
    );
  }

  function outsourcedAt(locationId: string | null) {
    return outsourcedPeople.filter(
      (person) => !person.archived && matchesVenue(person.venue, locationId),
    );
  }

  function itemsAt(locationId: string | null) {
    const rows = placeHiring(rowsAt(locationId), hiringAt(locationId), orders[columnOrderKey(locationId)]);
    if (showHiring) {
      return rows;
    }

    return rows.filter((row) => row.kind !== "hiring");
  }

  function columnSize(locationId: string | null) {
    const rows = itemsAt(locationId).length;
    const slotHere = labelSlot != null && (labelSlot.locationId ?? null) === locationId;
    return rows === 0 && slotHere ? 1 : rows;
  }

  function venueColor(locationId: string | null) {
    if (!locationId) {
      return "";
    }

    return locations.find((location) => location.id === locationId)?.color ?? "";
  }

  function renderRows(locationId: string | null) {
    const rows = itemsAt(locationId);
    const color = venueColor(locationId);
    const slot = labelSlot && (labelSlot.locationId ?? null) === locationId ? labelSlot : null;
    return (
      <>
        {rows.map((row) => {
          const itemId = boardItemId(row);
          const employee =
            row.kind === "staff"
              ? employees.find((item) => item.id === row.person.id)
              : undefined;
          return (
            <Fragment key={`${row.kind}-${itemId}`}>
              {slot?.beforeItemId === itemId ? <DropLine /> : null}
              {row.kind === "staff" ? (
                <StaffCard
                  person={row.person}
                  displayName={employeeCardName(employee, row.person.name)}
                  photo={employee?.photo ?? null}
                  color={color}
                  cardLabel={cardLabels.find((item) => item.staffId === row.person.id)?.text ?? ""}
                  onOpenProfile={() => openProfile(row.person.id)}
                  promotion={
                    kind === "venue" && showPromotions
                      ? pendingPromotion(promotions, row.person.id, today)
                      : null
                  }
                  hideSalary={hideSalary(row.person.position ?? "")}
                  hidePromotionSalary={hideSalary(
                    (kind === "venue" && showPromotions
                      ? pendingPromotion(promotions, row.person.id, today)?.newPosition
                      : "") ?? "",
                  )}
                  dragging={drag?.staffId === row.person.id || htmlDragId === row.person.id}
                  movable={!arrangementLocked}
                  onPointerDown={startDrag}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onHtmlDragStart={startHtmlDrag}
                  onHtmlDragEnd={endHtmlDrag}
                />
              ) : row.kind === "label" ? (
                <LabelCard
                  label={row.label}
                  color={color}
                  dragging={drag?.staffId === row.label.id || htmlDragId === row.label.id}
                  movable={!arrangementLocked}
                  onPointerDown={startDrag}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onHtmlDragStart={startHtmlDrag}
                  onHtmlDragEnd={endHtmlDrag}
                />
              ) : (
                <HiringCard
                  role={row.role}
                  hideSalary={hideSalary(row.role.position)}
                  dragging={drag?.staffId === row.role.id || htmlDragId === row.role.id}
                  movable={!arrangementLocked}
                  onPointerDown={startDrag}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onHtmlDragStart={startHtmlDrag}
                  onHtmlDragEnd={endHtmlDrag}
                />
              )}
            </Fragment>
          );
        })}
        {slot && slot.beforeItemId == null ? <DropLine /> : null}
      </>
    );
  }

  const draggedLabel = drag ? labels.find((label) => label.id === drag.staffId) : null;
  const dragged =
    drag && !draggedLabel ? placements.find((person) => person.id === drag.staffId) : null;
  const draggedEmployee = dragged
    ? employees.find((employee) => employee.id === dragged.id)
    : undefined;
  const draggedCardName = dragged ? employeeCardName(draggedEmployee, dragged.name) : "";
  const draggedHiring =
    drag && !draggedLabel && !dragged
      ? hiringRoles.find((role) => role.id === drag.staffId)
      : null;
  const cardLabelByStaff = new Map(cardLabels.map((item) => [item.staffId, item.text]));
  const promotedStaff = new Set(
    kind === "venue"
      ? placements.flatMap((person) =>
          pendingPromotion(promotions, person.id, today) ? [person.id] : [],
        )
      : [],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-5 md:px-6">
      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-xl text-sm text-stone-500">
          {kind === "event"
            ? "Drag an event heading to change its position. Drag a card to reorder it or move it to another event. Saved in this browser."
            : arrangementLocked
              ? "The board is locked. Unlock it to move staff. Drag a venue heading to change its position."
              : "Drag a venue heading to change its position. Drag a card to reorder it in the column, or onto another venue to move it. Saved in this browser."}
        </p>
        <div className="flex shrink-0 gap-2">
          {kind === "venue" ? <DashboardVisibilityButton /> : null}
          {kind === "venue" ? (
            <button
              type="button"
              aria-pressed={!arrangementLocked}
              aria-label={arrangementLocked ? "Unlock moving staff" : "Lock moving staff"}
              title={
                arrangementLocked
                  ? "Board is locked. Unlock to move staff."
                  : "Board is unlocked. Lock to stop moving staff."
              }
              className={`inline-flex size-9 items-center justify-center rounded-lg border ${
                arrangementLocked
                  ? "border-stone-300 bg-white text-stone-800 hover:bg-stone-50"
                  : "border-stone-950 bg-stone-950 text-white hover:bg-stone-800"
              }`}
              onClick={requestArrangeToggle}
            >
              {arrangementLocked ? <LockIcon /> : <UnlockIcon />}
            </button>
          ) : null}
          {kind === "venue" && showPromotions ? (
            <button
              type="button"
              aria-pressed={includePromotions}
              aria-label={
                includePromotions
                  ? "Venue totals include pending promotions"
                  : "Venue totals use current salaries"
              }
              title={
                includePromotions
                  ? "Showing totals with pending promotions. Click to use current salaries."
                  : "Showing current salary totals. Click to include pending promotions."
              }
              className={`inline-flex size-9 items-center justify-center rounded-lg border ${
                includePromotions
                  ? "border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800"
                  : "border-stone-300 bg-white text-stone-800 hover:bg-stone-50"
              }`}
              onClick={() => setIncludePromotions(!includePromotions)}
            >
              <UpArrowIcon />
            </button>
          ) : null}
          {unassignedPeople ? (
            <button
              type="button"
              aria-label={`Unassigned (${unassignedPeople.length})`}
              title={`Unassigned (${unassignedPeople.length})`}
              className={iconButtonClass}
              onClick={openUnassignedDialog}
            >
              <UnassignedIcon />
            </button>
          ) : null}
          <button
            type="button"
            aria-label={kind === "event" ? "Add event" : "Add venue"}
            title={kind === "event" ? "Add event" : "Add venue"}
            className={iconButtonClass}
            onClick={openVenueDialog}
          >
            {kind === "event" ? <AddEventIcon /> : <AddVenueIcon />}
          </button>
          <button
            type="button"
            aria-label="Add staff"
            title="Add staff"
            className={iconPrimaryButtonClass}
            onClick={() => openStaffDialog()}
          >
            <AddStaffIcon />
          </button>
        </div>
      </div>
      <p className="sr-only" role="status">
        {status}
      </p>
      {arrangePrompt ? (
        <ModalPortal>
        <dialog
          ref={arrangeDialogRef}
          className="m-auto h-fit w-[min(100%-2rem,28rem)] rounded-2xl border border-stone-200 bg-white p-0 text-stone-950 shadow-xl backdrop:bg-stone-950/40"
          aria-labelledby="arrange-lock-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setArrangePassword("");
              setArrangePrompt(false);
            }
          }}
          onClose={() => setArrangePrompt(false)}
        >
          <form onSubmit={submitArrangePassword}>
            <div className="border-b border-stone-200 px-5 py-4">
              <h2 id="arrange-lock-title" className="text-base font-semibold tracking-tight">
                Unlock the location board
              </h2>
              <p className="mt-1 text-sm text-stone-500">Enter the shared password to move staff.</p>
            </div>
            <div className="space-y-3 px-5 py-4">
              <label className="block text-sm font-medium text-stone-800">
                Password
                <input
                  type="password"
                  name="arrange-password"
                  autoComplete="off"
                  value={arrangePassword}
                  onChange={(event) => setArrangePassword(event.target.value)}
                  autoFocus
                  required
                  className={fieldClass}
                />
              </label>
              {arrangeError ? <p className="text-sm text-red-700">{arrangeError}</p> : null}
            </div>
            <div className="flex justify-end gap-2 border-t border-stone-200 px-5 py-3">
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={() => {
                  setArrangePassword("");
                  setArrangePrompt(false);
                }}
              >
                Cancel
              </button>
              <button type="submit" disabled={arrangePending} className={primaryButtonClass}>
                {arrangePending ? "Checking…" : "Unlock"}
              </button>
            </div>
          </form>
        </dialog>
        </ModalPortal>
      ) : null}

      <div
        ref={scrollerRef}
        className="mt-4 flex min-h-0 flex-1 items-stretch gap-3 overflow-x-auto overflow-y-hidden pb-1"
      >
        {locations.map((location) => (
          <LocationColumn
            key={location.id}
            dropId={location.id}
            title={location.nickname}
            subtitle={location.venueName}
            color={location.color}
            count={peopleAt(location.id).length}
            itemCount={columnSize(location.id)}
            costs={
              location.venueName
                ? venueCostBreakdown(
                    peopleAt(location.id),
                    outsourcedAt(location.id),
                    showHiring ? hiringAt(location.id) : [],
                    kind === "venue" && includePromotions && showPromotions ? promotions : [],
                    today,
                    hideSalary,
                    !showHiring,
                  )
                : undefined
            }
            active={!columnDragId && (drag?.over === location.id || htmlOver === location.id)}
            columnDragging={columnDragId === location.id}
            columnShift={columnShift?.id === location.id ? columnShift.side : null}
            onColumnDragStart={(event) => startColumnDrag(event, location.id)}
            onColumnDragEnd={endColumnDrag}
            pendingRemove={pendingRemoveId === location.id}
            onDragOver={(event) => {
              if (dragColumnOver(event, location.id)) {
                return;
              }

              event.preventDefault();
              setHtmlOver((current) => (current === location.id ? current : location.id));
              syncLabelSlot(event.clientX, event.clientY);
            }}
            onDrop={(event) => dropHtml(event, location.id)}
            onAdd={() => openStaffDialog(location.id)}
            onRemoveStaff={removeStaff}
            onEditStaff={openEditStaff}
            onApplyPromotion={kind === "venue" ? openPromotion : undefined}
            onEditPromotion={kind === "venue" ? openEditPromotion : undefined}
            promotedStaff={promotedStaff}
            onAddLabel={(x, y, aboveItemId) => openLabelDialog(location.id, x, y, aboveItemId)}
            onEditLabel={openEditLabel}
            onDeleteLabel={deleteLabel}
            labeledStaff={cardLabelByStaff}
            onAddCardLabel={openCardLabelDialog}
            onRemoveCardLabel={removeCardLabel}
            onRestartPositions={() => restartPositions(location.id)}
            onAddHiring={() => openAddHiring(location.id)}
            onEditHiring={(roleId) => openEditHiring(location.id, roleId)}
            onAskRemove={() =>
              setPendingRemoveId((current) => (current === location.id ? null : location.id))
            }
            compactHeading={kind === "event"}
            removeLabel={kind === "event" ? "Remove event" : "Remove venue"}
            onRemove={() => removeVenue(location.id)}
            emptyLabel={unassignedPeople ? "No staff" : undefined}
          >
            {renderRows(location.id)}
          </LocationColumn>
        ))}
      </div>

      {draggedLabel ? (
        <div
          className="pointer-events-none fixed z-50 flex w-64 items-center rounded-xl border border-stone-300 bg-white px-2.5 py-2 shadow-lg"
          style={{
            left: drag?.x,
            top: drag?.y,
            transform: "translate(-50%, -60%)",
            ...labelSurface(venueColor(draggedLabel.locationId)),
          }}
        >
          <span className="w-full truncate text-center text-sm font-medium text-stone-950">
            {draggedLabel.text}
          </span>
        </div>
      ) : null}

      {draggedHiring ? (
        <div
          className="pointer-events-none fixed z-50 w-64 rounded-xl border border-yellow-200 bg-yellow-100 px-2.5 py-2 shadow-lg"
          style={{ left: drag?.x, top: drag?.y, transform: "translate(-50%, -60%)" }}
        >
          <span className="block truncate text-sm font-medium text-stone-950">{draggedHiring.position}</span>
          <span className="mt-0.5 flex items-baseline justify-between gap-2 text-xs text-stone-600">
            <span>Hiring</span>
            <span className="shrink-0 tabular-nums">
              {hideSalary(draggedHiring.position) || draggedHiring.salary == null
                ? "—"
                : formatBoardSalary(draggedHiring.salary)}
            </span>
          </span>
        </div>
      ) : null}

      {dragged ? (
        <div
          className="pointer-events-none fixed z-50 w-64 overflow-hidden rounded-xl border border-stone-300 bg-white shadow-lg"
          style={{ left: drag?.x, top: drag?.y, transform: "translate(-50%, -60%)" }}
        >
          {cardLabelByStaff.get(dragged.id) ? (
            <span
              className="block truncate border-b px-2.5 py-1 text-center text-sm font-medium text-stone-950"
              style={cardLabelBand(venueColor(resolvedLocationId(dragged, knownIds)))}
            >
              {cardLabelByStaff.get(dragged.id)}
            </span>
          ) : null}
          <span className="flex items-start gap-2 px-2.5 py-2">
            <Initials name={draggedCardName} photo={draggedEmployee?.photo ?? null} />
            <span className="min-w-0 flex-1">
              <span className="flex h-7 items-center">
                <span className="block min-w-0 truncate text-sm font-medium text-stone-950" title={dragged.name}>
                  {draggedCardName}
                </span>
              </span>
              <PromotionTag
                promotion={
                  kind === "venue" && showPromotions
                    ? pendingPromotion(promotions, dragged.id, today)
                    : null
                }
                hideSalary={hideSalary(
                  pendingPromotion(promotions, dragged.id, today)?.newPosition ?? "",
                )}
              />
            </span>
          </span>
        </div>
      ) : null}

      <ModalPortal>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className={`m-auto rounded-2xl border border-stone-200 bg-white p-0 text-stone-950 shadow-xl backdrop:bg-stone-950/40 ${
          dialog === "editStaff" || dialog === "promotion" || dialog === "profile"
            ? "flex h-fit max-h-[min(100%-2rem,40rem)] w-[min(100%-2rem,28rem)] flex-col"
            : "h-fit w-[min(100%-2rem,24rem)]"
        }`}
        onCancel={(event) => {
          event.preventDefault();
          dismissDialog();
        }}
        onClose={dismissDialog}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            dismissDialog();
          }
        }}
      >
        {dialog === "venue" ? (
          kind === "event" ? (
            <EventPicker
              titleId={titleId}
              catalog={catalog}
              locations={locations}
              selectedEventId={selectedEventId}
              formError={formError}
              onSelect={setSelectedEventId}
              onSubmit={addVenue}
              onClose={dismissDialog}
            />
          ) : (
            <VenuePicker
              titleId={titleId}
              catalog={venueCatalog}
              locations={locations}
              selectedVenueId={selectedVenueId}
              formError={formError}
              onSelect={setSelectedVenueId}
              onSubmit={addVenue}
              onClose={dismissDialog}
            />
          )
        ) : null}

        {dialog === "unassigned" && unassignedPeople ? (
          <div>
            <DialogHeader
              titleId={titleId}
              title="Unassigned staff"
              description="People in the staff directory who are not linked to a venue."
              icon={<UnassignedIcon />}
              onClose={dismissDialog}
            />
            <ul className="max-h-[min(24rem,calc(100dvh-12rem))] overflow-y-auto px-5 py-2">
              {unassignedPeople.length === 0 ? (
                <li className="py-6 text-sm text-stone-500">
                  Everyone in the directory is linked to a venue.
                </li>
              ) : (
                unassignedPeople.map((person) => (
                  <li
                    key={person.id}
                    className="flex items-center justify-between gap-3 border-b border-stone-100 py-2.5 last:border-b-0"
                  >
                    <span className="min-w-0 truncate text-sm font-medium text-stone-950">
                      {person.name}
                    </span>
                    <span className="shrink-0 text-sm text-stone-500">
                      {person.position || "—"}
                    </span>
                  </li>
                ))
              )}
            </ul>
            <div className="flex justify-end border-t border-stone-200 px-5 py-4">
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={dismissDialog}
              >
                Close
              </button>
            </div>
          </div>
        ) : null}

        {dialog === "staff" ? (
          <form onSubmit={addStaff}>
            <DialogHeader
              titleId={titleId}
              title="Add staff"
              description={
                kind === "event"
                  ? "They land on the event you pick. Drag the card to move them."
                  : "They land in the location you pick. Drag the card to move them."
              }
              icon={<AddStaffIcon />}
              onClose={dismissDialog}
            />
            <div className="space-y-4 px-5 py-4">
              <StaffCombobox
                people={staffChoices}
                selectedId={selectedStaffId}
                onSelect={setSelectedStaffId}
                emptyLabel={
                  kind === "event"
                    ? "Everyone in the directory is already on an event."
                    : "Everyone in the directory is already on a venue."
                }
              />
              <label className="block text-sm font-medium text-stone-800">
                {kind === "event" ? "Event" : "Location"}
                <select
                  value={staffLocation}
                  onChange={(event) => setStaffLocation(event.target.value)}
                  className={fieldClass}
                >
                  {kind === "event" ? null : <option value="">Not placed</option>}
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.nickname}
                    </option>
                  ))}
                </select>
              </label>
              {formError ? <p className="text-sm text-red-700">{formError}</p> : null}
            </div>
            <DialogFooter onClose={dismissDialog} submitLabel="Add staff" />
          </form>
        ) : null}

        {dialog === "label" ? (
          <form onSubmit={addLabel}>
            <DialogHeader
              titleId={titleId}
              title={editingLabelId ? "Edit separation" : "Add separation"}
              description={
                editingLabelId
                  ? "Change the text. It stays where it is in the column."
                  : "It is placed above the card you right-clicked."
              }
              icon={editingLabelId ? <PencilIcon /> : <PlusIcon />}
              onClose={dismissDialog}
            />
            <div className="space-y-4 px-5 py-4">
              <label className="block text-sm font-medium text-stone-800">
                Separation
                <input
                  value={labelText}
                  onChange={(event) => setLabelText(event.target.value)}
                  placeholder="Kitchen"
                  className={fieldClass}
                />
              </label>
              {formError ? <p className="text-sm text-red-700">{formError}</p> : null}
            </div>
            <DialogFooter
              onClose={dismissDialog}
              submitLabel={editingLabelId ? "Save separation" : "Add separation"}
            />
          </form>
        ) : null}

        {dialog === "editStaff" && editForm ? (
          <form onSubmit={saveEditStaff} className="flex max-h-[min(100dvh-4rem,40rem)] min-h-0 flex-col">
            <DialogHeader
              titleId={titleId}
              title="Edit staff"
              description="Changes save on this person."
              icon={<PencilIcon />}
              onClose={dismissDialog}
            />
            <StaffEditFields
              form={editForm}
              kind={kind}
              locations={locations}
              lookups={lookups}
              onChange={setEditForm}
            />
            {formError ? <p className="px-5 pb-4 text-sm text-red-700">{formError}</p> : null}
            <DialogFooter onClose={dismissDialog} submitLabel="Save staff" />
          </form>
        ) : null}

        {dialog === "hiring" || dialog === "editHiring" ? (
          <HiringDialog
            titleId={titleId}
            mode={dialog}
            roles={hiringAt(hiringLocationId)}
            roleId={hiringRoleId}
            positionId={hiringPositionId}
            salary={hiringSalary}
            lookups={lookups}
            formError={formError}
            onRole={(roleId) => {
              setHiringRoleId(roleId);
              applyHiringRole(hiringRoles.find((item) => item.id === roleId));
            }}
            onPosition={selectHiringPosition}
            onSalary={setHiringSalary}
            onSubmit={saveHiringRole}
            onClose={dismissDialog}
            onFinished={(message) => {
              setStatus(message);
              dismissDialog();
            }}
          />
        ) : null}

        {dialog === "promotion" ? (
          <form onSubmit={savePromotion}>
            <DialogHeader
              titleId={titleId}
              title={promotionId ? "Edit promotion" : "Apply promotion"}
              description={
                employees.find((item) => item.id === promotionStaffId)?.fullName ??
                placements.find((item) => item.id === promotionStaffId)?.name ??
                "Choose the new position, salary package, and effective date."
              }
              icon={<UpArrowIcon />}
              onClose={dismissDialog}
            />
            <PromotionFields
              positionId={promotionPositionId}
              position={promotionPosition}
              salary={promotionSalary}
              effectiveDate={promotionDate}
              lookups={lookups}
              onPosition={selectPromotionPosition}
              onPositionText={(value) => {
                setPromotionPositionId("");
                setPromotionPosition(value);
              }}
              onSalary={setPromotionSalary}
              onDate={setPromotionDate}
            />
            {formError ? <p className="px-5 pb-4 text-sm text-red-700">{formError}</p> : null}
            <DialogFooter
              onClose={dismissDialog}
              submitLabel={promotionId ? "Save promotion" : "Apply promotion"}
            />
          </form>
        ) : null}

        {dialog === "cardLabel" ? (
          <form onSubmit={saveCardLabel}>
            <DialogHeader
              titleId={titleId}
              title={
                cardLabelStaffId && cardLabelByStaff.has(cardLabelStaffId) ? "Edit label" : "Add label"
              }
              description="The name sits on this person's card."
              icon={
                cardLabelStaffId && cardLabelByStaff.has(cardLabelStaffId) ? (
                  <PencilIcon />
                ) : (
                  <PlusIcon />
                )
              }
              onClose={dismissDialog}
            />
            <div className="space-y-4 px-5 py-4">
              <label className="block text-sm font-medium text-stone-800">
                Label
                <input
                  value={cardLabelText}
                  onChange={(event) => setCardLabelText(event.target.value)}
                  placeholder="Opening"
                  className={fieldClass}
                />
              </label>
              {formError ? <p className="text-sm text-red-700">{formError}</p> : null}
            </div>
            <DialogFooter
              onClose={dismissDialog}
              submitLabel={
                cardLabelStaffId && cardLabelByStaff.has(cardLabelStaffId) ? "Save label" : "Add label"
              }
            />
          </form>
        ) : null}

        {dialog === "profile" && profileStaffId ? (
          <ProfileDialog
            titleId={titleId}
            employee={employees.find((employee) => employee.id === profileStaffId) ?? null}
            person={placements.find((person) => person.id === profileStaffId) ?? null}
            venue={profileVenue(
              employees.find((employee) => employee.id === profileStaffId) ?? null,
              placements.find((person) => person.id === profileStaffId) ?? null,
              locations,
            )}
            promotions={promotions
              .filter((promotion) => promotion.staffId === profileStaffId)
              .sort((left, right) =>
                textValue(right.effectiveDate).localeCompare(textValue(left.effectiveDate)),
              )}
            showPromotions={showPromotions}
            salaryIsHidden={hideSalary}
            onClose={dismissDialog}
          />
        ) : null}
      </dialog>
      </ModalPortal>
    </div>
  );
}

function ModalPortal({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    setReady(true);
  }, []);

  if (!ready) {
    return null;
  }

  return createPortal(children, document.body);
}

type VenueCosts = {
  inHouse: number;
  outsource: number;
  hiring: number;
  total: number;
  inHouseMasked: boolean;
  hiringMasked: boolean;
  hideHiring: boolean;
};

function sumAmounts(amounts: Array<number | null | undefined>) {
  return roundMoney(amounts.reduce<number>((total, amount) => total + (amount ?? 0), 0));
}

function venueCostBreakdown(
  people: StaffPlacement[],
  outsourced: OutsourcedPerson[],
  hiring: HiringRole[],
  promotions: StaffPromotion[] = [],
  today = todayIso(),
  salaryIsHidden: (position: string) => boolean = () => false,
  hideHiringLine = false,
): VenueCosts {
  let inHouseMasked = false;
  const inHouse = sumAmounts(
    people.map((person) => {
      const pending = pendingPromotion(promotions, person.id, today);
      const position = pending ? pending.newPosition : person.position;
      const salary = pending ? pending.newSalary : person.salary;

      if (salaryIsHidden(position ?? "")) {
        inHouseMasked = true;
        return 0;
      }

      return salary;
    }),
  );
  const outsource = sumAmounts(outsourced.map((person) => person.rate));
  let hiringMasked = false;
  const hiringCost = sumAmounts(
    hiring.map((role) => {
      if (salaryIsHidden(role.position)) {
        hiringMasked = true;
        return 0;
      }

      return role.salary == null ? 0 : role.salary * Math.max(role.openings, 0);
    }),
  );
  return {
    inHouse,
    outsource,
    hiring: hiringCost,
    total: roundMoney(inHouse + outsource + hiringCost),
    inHouseMasked,
    hiringMasked,
    hideHiring: hideHiringLine,
  };
}

function hexToHsl(color: string) {
  const red = Number.parseInt(color.slice(1, 3), 16) / 255;
  const green = Number.parseInt(color.slice(3, 5), 16) / 255;
  const blue = Number.parseInt(color.slice(5, 7), 16) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const lightness = (max + min) / 2;
  let hue = 0;
  let saturation = 0;

  if (delta !== 0) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1));
    if (max === red) {
      hue = ((green - blue) / delta) % 6;
    } else if (max === green) {
      hue = (blue - red) / delta + 2;
    } else {
      hue = (red - green) / delta + 4;
    }
    hue *= 60;
    if (hue < 0) {
      hue += 360;
    }
  }

  return { hue, saturation };
}

function hslToHex(hue: number, saturation: number, lightness: number) {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const sector = hue / 60;
  const match = chroma * (1 - Math.abs((sector % 2) - 1));
  let red = 0;
  let green = 0;
  let blue = 0;

  if (sector < 1) {
    red = chroma;
    green = match;
  } else if (sector < 2) {
    red = match;
    green = chroma;
  } else if (sector < 3) {
    green = chroma;
    blue = match;
  } else if (sector < 4) {
    green = match;
    blue = chroma;
  } else if (sector < 5) {
    red = match;
    blue = chroma;
  } else {
    red = chroma;
    blue = match;
  }

  const offset = lightness - chroma / 2;
  const channel = (value: number) =>
    Math.round((value + offset) * 255)
      .toString(16)
      .padStart(2, "0");

  return `#${channel(red)}${channel(green)}${channel(blue)}`;
}

function cardLabelBand(color: string): React.CSSProperties {
  const surface = labelSurface(color);
  if (!surface) {
    return {
      backgroundColor: "#e7e5e4",
      borderBottomColor: "#d6d3d1",
    };
  }

  return {
    backgroundColor: surface.backgroundColor,
    borderBottomColor: surface.borderColor,
  };
}

function labelSurface(color: string): React.CSSProperties | undefined {
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
    return undefined;
  }

  const { hue, saturation } = hexToHsl(color);
  if (saturation < 0.08) {
    return {
      backgroundColor: "#f5f5f4",
      borderColor: "#e7e5e4",
    };
  }

  const tint = Math.min(0.38, Math.max(0.18, saturation * 0.45));
  return {
    backgroundColor: hslToHex(hue, tint, 0.94),
    borderColor: hslToHex(hue, Math.min(0.48, tint + 0.1), 0.82),
  };
}

function headerInk(color: string) {
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
    return null;
  }

  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance > 0.62 ? "dark" : "light";
}

function LocationColumn({
  dropId,
  title,
  subtitle,
  color = "",
  count,
  itemCount = count,
  costs,
  active,
  pendingRemove = false,
  onAdd,
  onRemoveStaff,
  onEditStaff,
  onApplyPromotion,
  onEditPromotion,
  promotedStaff,
  onAddLabel,
  onEditLabel,
  onDeleteLabel,
  labeledStaff,
  onAddCardLabel,
  onRemoveCardLabel,
  onRestartPositions,
  onAddHiring,
  onEditHiring,
  onAskRemove,
  onRemove,
  compactHeading = false,
  removeLabel = "Remove venue",
  onColumnDragStart,
  onColumnDragEnd,
  columnDragging = false,
  columnShift = null,
  onDragOver,
  onDrop,
  emptyLabel = "Drop staff here",
  children,
}: {
  dropId: string;
  title: string;
  subtitle: string;
  color?: string;
  count: number;
  itemCount?: number;
  costs?: VenueCosts;
  active: boolean;
  pendingRemove?: boolean;
  onAdd: () => void;
  onRemoveStaff: (staffId: string) => void;
  onEditStaff: (staffId: string) => void;
  onApplyPromotion?: (staffId: string) => void;
  onEditPromotion?: (staffId: string) => void;
  promotedStaff: Set<string>;
  onAddLabel: (x: number, y: number, aboveItemId: string | null) => void;
  onEditLabel: (labelId: string) => void;
  onDeleteLabel: (labelId: string) => void;
  labeledStaff: Map<string, string>;
  onAddCardLabel: (staffId: string) => void;
  onRemoveCardLabel: (staffId: string) => void;
  onRestartPositions: () => void;
  onAddHiring?: () => void;
  onEditHiring?: (roleId: string | null) => void;
  onAskRemove?: () => void;
  onRemove?: () => void;
  compactHeading?: boolean;
  removeLabel?: string;
  onColumnDragStart?: (event: React.DragEvent<HTMLElement>) => void;
  onColumnDragEnd?: () => void;
  columnDragging?: boolean;
  columnShift?: "before" | "after" | null;
  onDragOver: (event: React.DragEvent<HTMLElement>) => void;
  onDrop: (event: React.DragEvent<HTMLElement>) => void;
  emptyLabel?: string;
  children: React.ReactNode;
}) {
  const venue = dropId !== unassignedDropId;
  const empty = itemCount === 0;
  const ink = headerInk(color);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    originX: number;
    originY: number;
    staffId: string | null;
    labelId: string | null;
    hiringId: string | null;
    onList: boolean;
  } | null>(null);

  useEffect(() => {
    if (!menu) {
      return;
    }

    function dismiss(event: Event) {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) {
        return;
      }

      setMenu(null);
      if (pendingRemove) {
        onAskRemove?.();
      }
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenu(null);
        if (pendingRemove) {
          onAskRemove?.();
        }
      }
    }

    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, [menu, onAskRemove, pendingRemove]);

  function openMenu(event: React.MouseEvent<HTMLElement>) {
    event.preventDefault();
    const target = event.target instanceof Element ? event.target : null;
    const labelRow = target?.closest("li[data-item-kind='label']");
    const labelId = labelRow?.getAttribute("data-item-id") ?? null;
    const hiringRow = labelId ? null : target?.closest("li[data-item-kind='hiring']");
    const hiringId = hiringRow?.getAttribute("data-item-id") ?? null;
    const staffRow = labelId || hiringId ? null : target?.closest("li[data-item-kind='staff']");
    const staffId = staffRow?.getAttribute("data-item-id") ?? null;
    const list = target?.closest("[data-column-list]");
    const onList = Boolean(
      list && event.currentTarget.contains(list) && !staffId && !labelId && !hiringId,
    );
    const removeItem = Boolean(staffId || (onAskRemove && onRemove));
    const cardItems = staffId ? (labeledStaff.has(staffId) ? 2 : 1) : 0;
    const hiringItems = (onAddHiring && onList ? 1 : 0) + (hiringId && onEditHiring ? 1 : 0);
    const itemCount =
      2 +
      (removeItem ? 1 : 0) +
      (staffId ? 1 : 0) +
      (staffId && onApplyPromotion ? 1 : 0) +
      (staffId && onEditPromotion && promotedStaff.has(staffId) ? 1 : 0) +
      cardItems +
      (labelId ? 2 : 0) +
      (onList ? 1 : 0) +
      hiringItems;
    const width = 192;
    const height = 16 + itemCount * 32;
    const pad = 8;
    setMenu({
      x: Math.min(Math.max(pad, event.clientX), window.innerWidth - width - pad),
      y: Math.min(Math.max(pad, event.clientY), window.innerHeight - height - pad),
      originX: event.clientX,
      originY: event.clientY,
      staffId,
      labelId,
      hiringId,
      onList,
    });
  }

  return (
    <section
      data-drop-id={dropId}
      aria-label={title}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onContextMenu={openMenu}
      className={`relative flex min-w-56 flex-1 basis-0 flex-col overflow-hidden rounded-2xl border ${
        columnDragging ? "opacity-40" : ""
      } ${
        active
          ? "border-stone-950 bg-stone-50 shadow-sm"
          : venue
            ? "border-stone-200 bg-white shadow-sm"
            : "border-dashed border-stone-300 bg-stone-50"
      }`}
    >
      {columnShift ? (
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-y-0 z-10 w-1 bg-stone-950 ${
            columnShift === "before" ? "left-0" : "right-0"
          }`}
        />
      ) : null}
      <header
        draggable={Boolean(onColumnDragStart)}
        title={onColumnDragStart ? "Drag to change position" : undefined}
        onDragStart={onColumnDragStart}
        onDragEnd={(event) => {
          event.stopPropagation();
          onColumnDragEnd?.();
        }}
        className={`shrink-0 px-4 pt-4 text-center ${costs == null ? "pb-3" : ""} ${
          onColumnDragStart ? "cursor-grab active:cursor-grabbing" : ""
        }`}
        style={ink ? { backgroundColor: color } : undefined}
      >
        <div className="relative">
          {onColumnDragStart ? (
            <span
              className={`absolute top-1.5 left-0 ${ink === "light" ? "text-white/70" : "text-stone-400"}`}
              aria-hidden="true"
            >
              <ColumnGripIcon />
            </span>
          ) : null}
          <h2
            className={`truncate px-6 tracking-tight ${ink === "light" ? "text-white" : "text-stone-950"} ${
              venue
                ? compactHeading
                  ? "text-xl font-semibold"
                  : "text-2xl font-semibold"
                : "text-sm font-medium"
            }`}
            title={title}
          >
            {title}
          </h2>
          <span
            className={`absolute top-1 right-0 text-xs tabular-nums ${
              ink === "light" ? "text-white/70" : "text-stone-500"
            }`}
          >
            {count}
          </span>
        </div>
        {subtitle ? (
          <p
            className={`mt-1 truncate text-xs ${ink === "light" ? "text-white/75" : "text-stone-500"}`}
            title={subtitle}
          >
            {subtitle}
          </p>
        ) : null}
        {costs == null ? null : (
          <>
            <div
              className={`mt-3 -mx-4 border-t ${ink === "light" ? "border-white/25" : "border-stone-200"}`}
              aria-hidden="true"
            />
            <dl className={`py-2 text-left text-xs ${ink === "light" ? "text-white/75" : "text-stone-500"}`}>
              {(
                [
                  { label: "In house staff cost", value: costs.inHouse, masked: costs.inHouseMasked },
                  { label: "Outsource staff cost", value: costs.outsource, masked: false },
                  ...(costs.hideHiring
                    ? []
                    : [{ label: "Hiring staff cost", value: costs.hiring, masked: costs.hiringMasked }]),
                  {
                    label: "Total venue cost",
                    value: costs.total,
                    masked: costs.inHouseMasked || costs.hiringMasked,
                    total: true,
                  },
                ] as const
              ).map((line) => (
                <div
                  key={line.label}
                  className={`flex items-baseline justify-between gap-3 py-0.5 ${
                    "total" in line && line.total
                      ? `mt-1 border-t pt-1.5 font-medium ${
                          ink === "light" ? "border-white/25 text-white" : "border-stone-200 text-stone-950"
                        }`
                      : ""
                  }`}
                >
                  <dt>{line.label}</dt>
                  <dd
                    className={`shrink-0 font-medium tabular-nums ${
                      ink === "light" ? "text-white" : "text-stone-950"
                    }`}
                  >
                    {line.masked ? "—" : formatBoardSalary(line.value)}
                  </dd>
                </div>
              ))}
            </dl>
            <div
              className={`-mx-4 border-t ${ink === "light" ? "border-white/25" : "border-stone-200"}`}
              aria-hidden="true"
            />
          </>
        )}
      </header>
      <ul
        data-column-list=""
        className={`flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 pb-3 ${
          costs == null ? "" : "pt-3"
        }`}
      >
        {empty ? (
          <li className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-stone-200 px-3 py-8 text-center text-sm text-stone-400">
            {emptyLabel}
          </li>
        ) : (
          children
        )}
      </ul>
      {menu ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label={`${title} actions`}
          onContextMenu={(event) => event.preventDefault()}
          className="fixed z-50 flex w-48 flex-col rounded-lg border border-stone-200 bg-white p-1 shadow-lg"
          style={{ left: menu.x, top: menu.y }}
        >
          <button
            type="button"
            role="menuitem"
            className="flex h-8 items-center gap-2 rounded-md px-2 text-left text-sm text-stone-700 hover:bg-stone-100 hover:text-stone-950"
            onClick={() => {
              setMenu(null);
              onAdd();
            }}
          >
            <MenuGlyph className="text-green-600">
              <PlusIcon />
            </MenuGlyph>
            Add Staff
          </button>
          {menu.staffId ? (
            <button
              type="button"
              role="menuitem"
              className="flex h-8 items-center gap-2 rounded-md px-2 text-left text-sm text-stone-700 hover:bg-stone-100 hover:text-stone-950"
              onClick={() => {
                const staffId = menu.staffId;
                setMenu(null);
                if (staffId) {
                  onRemoveStaff(staffId);
                }
              }}
            >
              <MenuGlyph className="text-red-600">
                <TrashIcon />
              </MenuGlyph>
              Remove Staff
            </button>
          ) : onAskRemove && onRemove ? (
            <button
              type="button"
              role="menuitem"
              className={`flex h-8 items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-stone-100 ${
                pendingRemove ? "text-red-700" : "text-stone-700 hover:text-stone-950"
              }`}
              onClick={() => {
                if (pendingRemove) {
                  setMenu(null);
                  onRemove();
                  return;
                }

                onAskRemove();
              }}
            >
              <MenuGlyph>
                <TrashIcon />
              </MenuGlyph>
              {pendingRemove ? removeLabel : "Remove"}
            </button>
          ) : null}
          {menu.staffId ? (
            <button
              type="button"
              role="menuitem"
              className="flex h-8 items-center gap-2 rounded-md px-2 text-left text-sm text-stone-700 hover:bg-stone-100 hover:text-stone-950"
              onClick={() => {
                const staffId = menu.staffId;
                setMenu(null);
                if (staffId) {
                  onEditStaff(staffId);
                }
              }}
            >
              <MenuGlyph>
                <PencilIcon />
              </MenuGlyph>
              Edit staff
            </button>
          ) : null}
          {menu.staffId && onApplyPromotion ? (
            <button
              type="button"
              role="menuitem"
              className="flex h-8 items-center gap-2 rounded-md bg-emerald-50 px-2 text-left text-sm text-stone-700 hover:bg-emerald-100 hover:text-stone-950"
              onClick={() => {
                const staffId = menu.staffId;
                setMenu(null);
                if (staffId) {
                  onApplyPromotion(staffId);
                }
              }}
            >
              <MenuGlyph className="text-emerald-700">
                <UpArrowIcon />
              </MenuGlyph>
              Apply Promotion
            </button>
          ) : null}
          {menu.staffId && onEditPromotion && promotedStaff.has(menu.staffId) ? (
            <button
              type="button"
              role="menuitem"
              className="flex h-8 items-center gap-2 rounded-md bg-emerald-50 px-2 text-left text-sm text-stone-700 hover:bg-emerald-100 hover:text-stone-950"
              onClick={() => {
                const staffId = menu.staffId;
                setMenu(null);
                if (staffId) {
                  onEditPromotion(staffId);
                }
              }}
            >
              <MenuGlyph className="text-emerald-700">
                <PencilIcon />
              </MenuGlyph>
              Edit Promotion
            </button>
          ) : null}
          {menu.staffId ? (
            labeledStaff.has(menu.staffId) ? (
              <>
                <button
                  type="button"
                  role="menuitem"
                  className="flex h-8 items-center gap-2 rounded-md px-2 text-left text-sm text-stone-700 hover:bg-stone-100 hover:text-stone-950"
                  onClick={() => {
                    const staffId = menu.staffId;
                    setMenu(null);
                    if (staffId) {
                      onAddCardLabel(staffId);
                    }
                  }}
                >
                  <MenuGlyph>
                    <PencilIcon />
                  </MenuGlyph>
                  Edit label
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex h-8 items-center gap-2 rounded-md px-2 text-left text-sm text-stone-700 hover:bg-stone-100 hover:text-stone-950"
                  onClick={() => {
                    const staffId = menu.staffId;
                    setMenu(null);
                    if (staffId) {
                      onRemoveCardLabel(staffId);
                    }
                  }}
                >
                  <MenuGlyph>
                    <TrashIcon />
                  </MenuGlyph>
                  Remove label
                </button>
              </>
            ) : (
              <button
                type="button"
                role="menuitem"
                className="flex h-8 items-center gap-2 rounded-md bg-yellow-100 px-2 text-left text-sm text-stone-700 hover:bg-yellow-200 hover:text-stone-950"
                onClick={() => {
                  const staffId = menu.staffId;
                  setMenu(null);
                  if (staffId) {
                    onAddCardLabel(staffId);
                  }
                }}
              >
                <MenuGlyph>
                  <PlusIcon />
                </MenuGlyph>
                Add label
              </button>
            )
          ) : null}
          <button
            type="button"
            role="menuitem"
            className="flex h-8 items-center gap-2 rounded-md bg-stone-200 px-2 text-left text-sm text-stone-700 hover:bg-stone-300 hover:text-stone-950"
            onClick={() => {
              const { originX, originY, staffId, labelId } = menu;
              setMenu(null);
              onAddLabel(originX, originY, staffId ?? labelId);
            }}
          >
            <MenuGlyph>
              <PlusIcon />
            </MenuGlyph>
            Separation
          </button>
          {menu.labelId ? (
            <>
              <button
                type="button"
                role="menuitem"
                className="flex h-8 items-center gap-2 rounded-md px-2 text-left text-sm text-stone-700 hover:bg-stone-100 hover:text-stone-950"
                onClick={() => {
                  const labelId = menu.labelId;
                  setMenu(null);
                  if (labelId) {
                    onEditLabel(labelId);
                  }
                }}
              >
                <MenuGlyph>
                  <PencilIcon />
                </MenuGlyph>
                Edit Separation
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex h-8 items-center gap-2 rounded-md px-2 text-left text-sm text-stone-700 hover:bg-stone-100 hover:text-stone-950"
                onClick={() => {
                  const labelId = menu.labelId;
                  setMenu(null);
                  if (labelId) {
                    onDeleteLabel(labelId);
                  }
                }}
              >
                <MenuGlyph>
                  <TrashIcon />
                </MenuGlyph>
                Delete Separation
              </button>
            </>
          ) : null}
          {menu.onList && onAddHiring ? (
            <button
              type="button"
              role="menuitem"
              className="flex h-8 items-center gap-2 rounded-md bg-yellow-100 px-2 text-left text-sm text-stone-700 hover:bg-yellow-200 hover:text-stone-950"
              onClick={() => {
                setMenu(null);
                onAddHiring();
              }}
            >
              <MenuGlyph>
                <HireIcon />
              </MenuGlyph>
              Add Hiring
            </button>
          ) : null}
          {menu.hiringId && onEditHiring ? (
            <button
              type="button"
              role="menuitem"
              className="flex h-8 items-center gap-2 rounded-md bg-yellow-100 px-2 text-left text-sm text-stone-700 hover:bg-yellow-200 hover:text-stone-950"
              onClick={() => {
                const hiringId = menu.hiringId;
                setMenu(null);
                onEditHiring(hiringId);
              }}
            >
              <MenuGlyph>
                <PencilIcon />
              </MenuGlyph>
              Edit hiring
            </button>
          ) : null}
          {menu.onList ? (
            <button
              type="button"
              role="menuitem"
              className="flex h-8 items-center gap-2 rounded-md px-2 text-left text-sm text-stone-700 hover:bg-stone-100 hover:text-stone-950"
              onClick={() => {
                setMenu(null);
                onRestartPositions();
              }}
            >
              <MenuGlyph>
                <RefreshIcon />
              </MenuGlyph>
              Restart positions
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function HiringCard({
  role,
  hideSalary = false,
  dragging,
  movable = true,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onHtmlDragStart,
  onHtmlDragEnd,
}: {
  role: HiringRole;
  hideSalary?: boolean;
  dragging: boolean;
  movable?: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLElement>, staffId: string) => void;
  onPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
  onHtmlDragStart: (event: React.DragEvent<HTMLElement>, staffId: string) => void;
  onHtmlDragEnd: () => void;
}) {
  return (
    <li
      data-item-id={role.id}
      data-item-kind="hiring"
      draggable={movable}
      className={`touch-none rounded-xl border border-yellow-200 bg-yellow-100 px-2.5 py-2 shadow-sm select-none ${
        movable ? "cursor-grab active:cursor-grabbing" : ""
      } ${dragging ? "opacity-40" : ""}`}
      onPointerDown={(event) => onPointerDown(event, role.id)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDragStart={(event) => onHtmlDragStart(event, role.id)}
      onDragEnd={onHtmlDragEnd}
    >
      <span className="block truncate text-sm font-medium text-stone-950">{role.position}</span>
      <span className="mt-0.5 flex items-baseline justify-between gap-2 text-xs text-stone-600">
        <span>Hiring</span>
        <span className="shrink-0 tabular-nums">
          {hideSalary || role.salary == null ? "—" : formatBoardSalary(role.salary)}
        </span>
      </span>
    </li>
  );
}

function StaffCard({
  person,
  displayName = "",
  photo = null,
  color = "",
  cardLabel = "",
  promotion = null,
  hideSalary = false,
  hidePromotionSalary = false,
  dragging,
  movable = true,
  onOpenProfile,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onHtmlDragStart,
  onHtmlDragEnd,
}: {
  person: StaffPlacement;
  displayName?: string;
  photo?: string | null;
  color?: string;
  cardLabel?: string;
  promotion?: StaffPromotion | null;
  hideSalary?: boolean;
  hidePromotionSalary?: boolean;
  dragging: boolean;
  movable?: boolean;
  onOpenProfile: () => void;
  onPointerDown: (event: React.PointerEvent<HTMLElement>, staffId: string) => void;
  onPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
  onHtmlDragStart: (event: React.DragEvent<HTMLElement>, staffId: string) => void;
  onHtmlDragEnd: () => void;
}) {
  const labeled = cardLabel.trim().length > 0;
  const shownName = displayName.trim() || person.name;
  return (
    <li
      data-item-id={person.id}
      data-item-kind="staff"
      draggable={movable}
      className={`flex touch-none flex-col overflow-hidden rounded-xl border border-stone-200 shadow-sm select-none ${
        movable ? "cursor-grab active:cursor-grabbing" : ""
      } ${labeled ? "bg-stone-100" : "bg-white"} ${dragging ? "opacity-40" : ""}`}
      onPointerDown={(event) => onPointerDown(event, person.id)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDragStart={(event) => onHtmlDragStart(event, person.id)}
      onDragEnd={onHtmlDragEnd}
    >
      {labeled ? (
        <span
          className="block truncate border-b px-2.5 py-1 text-center text-sm font-medium text-stone-950"
          style={cardLabelBand(color)}
          title={cardLabel}
        >
          {cardLabel}
        </span>
      ) : null}
      <span className="flex items-start gap-2 px-2.5 py-2">
        <Initials name={shownName} photo={photo} onOpen={onOpenProfile} />
        <span className="min-w-0 flex-1">
          <span className="flex h-7 items-center">
            <span className="block min-w-0 truncate text-sm font-medium text-stone-950" title={person.name}>
              {shownName}
            </span>
          </span>
          {person.position || person.salary != null ? (
            <span className="mt-0.5 flex min-w-0 items-baseline gap-1.5 text-xs leading-4 text-stone-500">
              {person.position ? (
                <span className="min-w-0 truncate" title={person.position}>
                  {person.position}
                </span>
              ) : null}
              {hideSalary ? null : (
                <>
                  {person.position ? <span className="shrink-0">-</span> : null}
                  <span className="shrink-0 tabular-nums">
                    {person.salary == null ? "—" : formatBoardSalary(person.salary)}
                  </span>
                </>
              )}
            </span>
          ) : null}
          <PromotionTag promotion={promotion} hideSalary={hidePromotionSalary} />
        </span>
      </span>
    </li>
  );
}

function LabelCard({
  label,
  color = "",
  dragging,
  movable = true,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onHtmlDragStart,
  onHtmlDragEnd,
}: {
  label: BoardLabel;
  color?: string;
  dragging: boolean;
  movable?: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLElement>, staffId: string) => void;
  onPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
  onHtmlDragStart: (event: React.DragEvent<HTMLElement>, staffId: string) => void;
  onHtmlDragEnd: () => void;
}) {
  return (
    <li
      data-item-id={label.id}
      data-item-kind="label"
      draggable={movable}
      className={`flex touch-none items-center rounded-xl border border-stone-200 bg-white px-2.5 py-2 shadow-sm select-none ${
        movable ? "cursor-grab active:cursor-grabbing" : ""
      } ${dragging ? "opacity-40" : ""}`}
      style={labelSurface(color)}
      onPointerDown={(event) => onPointerDown(event, label.id)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDragStart={(event) => onHtmlDragStart(event, label.id)}
      onDragEnd={onHtmlDragEnd}
    >
      <span className="w-full truncate text-center text-sm font-medium text-stone-950" title={label.text}>
        {label.text}
      </span>
    </li>
  );
}

function DropLine() {
  return (
    <li aria-hidden="true" className="px-1">
      <div className="h-0.5 rounded-full bg-stone-950" />
    </li>
  );
}

function Initials({
  name,
  photo = null,
  onOpen,
}: {
  name: string;
  photo?: string | null;
  onOpen?: () => void;
}) {
  const face = photo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={photo} alt="" className="size-full object-cover" />
  ) : (
    initials(name)
  );
  const className =
    "flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-stone-900 text-[11px] font-medium text-white";

  if (!onOpen) {
    return <span className={className}>{face}</span>;
  }

  return (
    <button
      type="button"
      data-profile=""
      draggable={false}
      className={`${className} cursor-pointer`}
      aria-label={`View profile for ${name}`}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
    >
      {face}
    </button>
  );
}

function ProfileDialog({
  titleId,
  employee,
  person,
  venue,
  promotions,
  showPromotions,
  salaryIsHidden,
  onClose,
}: {
  titleId: string;
  employee: StaffEmployee | null;
  person: StaffPlacement | null;
  venue: string;
  promotions: StaffPromotion[];
  showPromotions: boolean;
  salaryIsHidden: (position: string) => boolean;
  onClose: () => void;
}) {
  const name = textValue(employee?.fullName) || textValue(person?.name) || "Staff";
  const position = textValue(employee?.position) || textValue(person?.position);
  const salary = employee?.salary ?? person?.salary ?? null;
  const country = textValue(employee?.nationality);
  const flag = country ? countryFlag(country) : "";
  const dob = textValue(employee?.dateOfBirth);
  const age = ageFromIso(dob);
  const photo = employee?.photo ?? null;
  const records = showPromotions ? promotions : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex justify-end px-3 pt-3">
        <button
          type="button"
          className="flex size-8 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-950"
          aria-label="Close"
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
        <div className="flex justify-center">
          <span className="flex size-28 items-center justify-center overflow-hidden rounded-full bg-stone-900 text-2xl font-medium text-white">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt="" className="size-full object-cover" />
            ) : (
              initials(name)
            )}
          </span>
        </div>
        <h2 id={titleId} className="sr-only">
          {name}
        </h2>
        <dl className="mt-4">
          <ProfileRow label="Full name" value={name} />
          <ProfileRow label="Country" value={country ? `${flag ? `${flag} ` : ""}${country}` : ""} />
          <ProfileRow
            label="DOB"
            value={dob ? `${formatDate(dob)}${age == null ? "" : ` (${age})`}` : ""}
          />
        </dl>
        <div className="my-3 border-t border-stone-200" />
        <dl>
          <ProfileRow label="Current position" value={position} />
          <ProfileRow
            label="Current salary"
            value={salaryIsHidden(position) || salary == null ? "" : formatSalary(salary)}
          />
          <ProfileRow label="Current venue" value={venue} />
        </dl>
        {records.length > 0 ? (
          <>
            <div className="my-3 border-t border-stone-200" />
            <div className="space-y-4">
              {records.map((promotion) => (
                <dl key={promotion.id}>
                  <ProfileRow label="New position" value={promotion.newPosition} />
                  <ProfileRow
                    label="New salary"
                    value={
                      salaryIsHidden(promotion.newPosition)
                        ? ""
                        : formatSalary(promotion.newSalary)
                    }
                  />
                  <ProfileRow label="Date" value={formatDate(promotion.effectiveDate)} />
                </dl>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <dt className="shrink-0 text-sm text-stone-500">{label}</dt>
      <dd className="min-w-0 text-right text-sm font-medium text-stone-950">{value || "—"}</dd>
    </div>
  );
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function profileVenue(
  employee: StaffEmployee | null,
  person: StaffPlacement | null,
  locations: LocationReference[],
) {
  const saved = textValue(employee?.venue);
  if (saved) {
    return saved;
  }

  const location = locations.find((item) => item.id === person?.locationId);
  return location?.venueName || location?.nickname || "";
}

function ageFromIso(iso: string, today = new Date()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) {
    return null;
  }

  let age = today.getFullYear() - Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (today.getMonth() < month || (today.getMonth() === month && today.getDate() < day)) {
    age -= 1;
  }

  return age >= 0 ? age : null;
}

function HiringDialog({
  titleId,
  mode,
  roles,
  roleId,
  positionId,
  salary,
  lookups,
  formError,
  onRole,
  onPosition,
  onSalary,
  onSubmit,
  onClose,
  onFinished,
}: {
  titleId: string;
  mode: "hiring" | "editHiring";
  roles: HiringRole[];
  roleId: string;
  positionId: string;
  salary: string;
  lookups: DirectoryLookups;
  formError: string;
  onRole: (roleId: string) => void;
  onPosition: (positionId: string) => void;
  onSalary: (salary: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  onFinished?: (message: string) => void;
}) {
  const editing = mode === "editHiring";
  const groups = lookups.departments
    .map((department) => ({
      department,
      positions: lookups.positions.filter((position) => position.departmentId === department.id),
    }))
    .filter((group) => group.positions.length > 0);
  const selected = roles.find((role) => role.id === roleId);
  const knownPosition = lookups.positions.some((position) => position.id === positionId);

  if (editing) {
    return (
      <div>
        <DialogHeader
          titleId={titleId}
          title="Edit hiring"
          description="Change the position or the salary for this opening."
          icon={<PencilIcon />}
          onClose={onClose}
        />
        {selected ? (
          <>
            {roles.length > 1 ? (
              <label className="block px-5 pt-4 text-sm font-medium text-stone-800">
                Opening
                <select
                  value={roleId}
                  onChange={(event) => onRole(event.target.value)}
                  className={fieldClass}
                >
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.position}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <HiringOpeningActions
              key={selected.id}
              role={selected}
              onFinished={onFinished ?? (() => onClose())}
            />
          </>
        ) : (
          <p className="px-5 py-6 text-sm text-stone-500">No hiring positions in this venue yet.</p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <DialogHeader
        titleId={titleId}
        title="Add Hiring"
        description="Choose a position. The salary starts from its default and can be changed."
        icon={<HireIcon />}
        onClose={onClose}
      />
      <div className="space-y-4 px-5 py-4">
        {groups.length === 0 ? (
          <p className="text-sm text-stone-500">Add positions in Settings before hiring.</p>
        ) : (
          <>
            <label className="block text-sm font-medium text-stone-800">
              Position
              <select
                value={positionId}
                onChange={(event) => onPosition(event.target.value)}
                className={fieldClass}
                autoFocus
                required
              >
                <option value="">Select a position</option>
                {selected && !knownPosition ? (
                  <option value={positionId || `name:${selected.position}`}>{selected.position}</option>
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
            </label>
            <label className="block text-sm font-medium text-stone-800">
              Salary
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={salary}
                onChange={(event) => onSalary(event.target.value)}
                placeholder="Default salary"
                className={fieldClass}
              />
            </label>
          </>
        )}
        {formError ? <p className="text-sm text-red-700">{formError}</p> : null}
      </div>
      <DialogFooter onClose={onClose} submitLabel="Add Hiring" />
    </form>
  );
}

function moneyField(value: number | null) {
  return value == null ? "" : String(value);
}

function StaffEditFields({
  form,
  kind,
  locations,
  lookups,
  onChange,
}: {
  form: StaffEditForm;
  kind: "venue" | "event";
  locations: LocationReference[];
  lookups: DirectoryLookups;
  onChange: (next: StaffEditForm) => void;
}) {
  const positionGroups = lookups.departments
    .map((department) => ({
      department,
      positions: lookups.positions.filter((position) => position.departmentId === department.id),
    }))
    .filter((group) => group.positions.length > 0);
  const knownPosition = lookups.positions.some((position) => position.name === form.position);

  function updateSalary(salary: string) {
    const amount = parseMoneyInput(salary);
    if (amount == null) {
      onChange({ ...form, salary, basicSalary: "", allowances: "" });
      return;
    }

    const split = splitSalary(amount);
    onChange({
      ...form,
      salary,
      basicSalary: String(split.basicSalary),
      allowances: String(split.allowances),
    });
  }

  function updatePayPart(key: "basicSalary" | "allowances", value: string) {
    const next = { ...form, [key]: value };
    const pay = sumSalary(parseMoneyInput(next.basicSalary), parseMoneyInput(next.allowances));
    onChange({ ...next, salary: pay.salary == null ? "" : String(pay.salary) });
  }

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
      <label className="block text-sm font-medium text-stone-800">
        Full name
        <input
          value={form.fullName}
          onChange={(event) => {
            const fullName = event.target.value;
            const parts = splitFullName(fullName);
            onChange({ ...form, fullName, firstName: parts.firstName, lastName: parts.lastName });
          }}
          className={fieldClass}
          autoFocus
        />
      </label>
      <label className="block text-sm font-medium text-stone-800">
        Position
        {positionGroups.length > 0 ? (
          <select
            value={form.position}
            onChange={(event) => onChange({ ...form, position: event.target.value })}
            className={fieldClass}
          >
            <option value="">Select a position</option>
            {form.position && !knownPosition ? <option value={form.position}>{form.position}</option> : null}
            {positionGroups.map((group) => (
              <optgroup key={group.department.id} label={group.department.name}>
                {group.positions.map((position) => (
                  <option key={position.id} value={position.name}>
                    {position.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        ) : (
          <input
            value={form.position}
            onChange={(event) => onChange({ ...form, position: event.target.value })}
            className={fieldClass}
          />
        )}
      </label>
      <label className="block text-sm font-medium text-stone-800">
        {kind === "event" ? "Event" : "Venue"}
        <select
          value={form.locationId}
          onChange={(event) => onChange({ ...form, locationId: event.target.value })}
          className={fieldClass}
        >
          {kind === "event" ? null : <option value="">Not placed</option>}
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.venueName ? `${location.nickname} — ${location.venueName}` : location.nickname}
            </option>
          ))}
        </select>
      </label>
      {kind === "venue" ? (
        <>
          <label className="block text-sm font-medium text-stone-800">
            Country
            <input
              value={form.nationality}
              onChange={(event) => onChange({ ...form, nationality: event.target.value })}
              list="edit-staff-countries"
              className={fieldClass}
            />
          </label>
          <datalist id="edit-staff-countries">
            {lookups.countries.map((country) => (
              <option key={country.id} value={country.name} />
            ))}
          </datalist>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-stone-800">
              Date of birth
              <input
                type="date"
                value={form.dateOfBirth}
                onChange={(event) => onChange({ ...form, dateOfBirth: event.target.value })}
                className={fieldClass}
              />
            </label>
            <label className="block text-sm font-medium text-stone-800">
              Joining date
              <input
                type="date"
                value={form.joiningDate}
                onChange={(event) => onChange({ ...form, joiningDate: event.target.value })}
                className={fieldClass}
              />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-sm font-medium text-stone-800">
              Basic salary
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={form.basicSalary}
                onChange={(event) => updatePayPart("basicSalary", event.target.value)}
                className={fieldClass}
              />
            </label>
            <label className="block text-sm font-medium text-stone-800">
              Allowances
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={form.allowances}
                onChange={(event) => updatePayPart("allowances", event.target.value)}
                className={fieldClass}
              />
            </label>
            <label className="block text-sm font-medium text-stone-800">
              Current salary
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={form.salary}
                onChange={(event) => updateSalary(event.target.value)}
                className={fieldClass}
              />
            </label>
          </div>
        </>
      ) : (
        <label className="block text-sm font-medium text-stone-800">
          Salary
          <input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={form.salary}
            onChange={(event) => updateSalary(event.target.value)}
            className={fieldClass}
          />
        </label>
      )}
    </div>
  );
}

function VenuePicker({
  titleId,
  catalog,
  locations,
  selectedVenueId,
  formError,
  onSelect,
  onSubmit,
  onClose,
}: {
  titleId: string;
  catalog: LocationReference[];
  locations: LocationReference[];
  selectedVenueId: string;
  formError: string;
  onSelect: (id: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  const available = catalog.filter((item) => !locations.some((location) => location.id === item.id));

  return (
    <form onSubmit={onSubmit}>
      <DialogHeader
        titleId={titleId}
        title="Add venue"
        description="The nickname is what shows on the card."
        icon={<AddVenueIcon />}
        onClose={onClose}
      />
      <div className="space-y-4 px-5 py-4">
        {catalog.length === 0 ? (
          <p className="text-sm text-stone-500">No venues yet. Define them in Settings, on the Locations tab.</p>
        ) : available.length === 0 ? (
          <p className="text-sm text-stone-500">Every venue from Settings is already on the board.</p>
        ) : (
          <label className="block text-sm font-medium text-stone-800">
            Venue
            <select
              value={selectedVenueId}
              onChange={(event) => onSelect(event.target.value)}
              className={fieldClass}
              autoFocus
            >
              {available.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nickname} — {item.venueName}
                </option>
              ))}
            </select>
          </label>
        )}
        {formError ? <p className="text-sm text-red-700">{formError}</p> : null}
      </div>
      {available.length === 0 ? (
        <div className="flex justify-end gap-2 border-t border-stone-200 px-5 py-4">
          <button type="button" className={secondaryButtonClass} onClick={onClose}>
            Cancel
          </button>
          {catalog.length === 0 ? (
            <Link href="/settings?tab=locations" className={primaryButtonClass} onClick={onClose}>
              Open Settings
            </Link>
          ) : null}
        </div>
      ) : (
        <DialogFooter onClose={onClose} submitLabel="Add venue" />
      )}
    </form>
  );
}

function StaffCombobox({
  people,
  selectedId,
  onSelect,
  emptyLabel,
}: {
  people: UnassignedPerson[];
  selectedId: string;
  onSelect: (id: string) => void;
  emptyLabel: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = people.find((person) => person.id === selectedId);
  const needle = query.trim().toLowerCase();
  const matches = people.filter((person) => {
    if (!needle) {
      return true;
    }

    return (
      person.name.toLowerCase().includes(needle) || person.position.toLowerCase().includes(needle)
    );
  });

  if (people.length === 0) {
    return <p className="text-sm text-stone-500">{emptyLabel}</p>;
  }

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-stone-800">
        Employee
        <input
          value={open ? query : (selected?.name ?? "")}
          onChange={(event) => {
            setQuery(event.target.value);
            onSelect("");
            setOpen(true);
          }}
          onFocus={() => {
            setQuery("");
            setOpen(true);
          }}
          onBlur={() => setOpen(false)}
          placeholder="Search unassigned employees"
          className={fieldClass}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          autoComplete="off"
        />
      </label>
      {open ? (
        <ul className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-stone-200 bg-white py-1 shadow-lg">
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-sm text-stone-500">No matching employees.</li>
          ) : (
            matches.map((person) => (
              <li key={person.id}>
                <button
                  type="button"
                  className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left hover:bg-stone-100"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onSelect(person.id);
                    setQuery("");
                    setOpen(false);
                  }}
                >
                  <span className="min-w-0 truncate text-sm font-medium text-stone-950">{person.name}</span>
                  <span className="shrink-0 text-xs text-stone-500">{person.position || "—"}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

function EventPicker({
  titleId,
  catalog,
  locations,
  selectedEventId,
  formError,
  onSelect,
  onSubmit,
  onClose,
}: {
  titleId: string;
  catalog: EventDefinition[];
  locations: LocationReference[];
  selectedEventId: string;
  formError: string;
  onSelect: (id: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  const available = catalog.filter((item) => !locations.some((location) => location.id === item.id));

  return (
    <form onSubmit={onSubmit}>
      <DialogHeader
        titleId={titleId}
        title="Add event"
        description="Choose an event defined in Settings."
        icon={<AddEventIcon />}
        onClose={onClose}
      />
      <div className="space-y-4 px-5 py-4">
        {catalog.length === 0 ? (
          <p className="text-sm text-stone-500">
            No events yet. Define them in Settings, on the Events tab.
          </p>
        ) : available.length === 0 ? (
          <p className="text-sm text-stone-500">Every event from Settings is already on the board.</p>
        ) : (
          <label className="block text-sm font-medium text-stone-800">
            Event
            <select
              value={selectedEventId}
              onChange={(event) => onSelect(event.target.value)}
              className={fieldClass}
            >
              {available.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {formError ? <p className="text-sm text-red-700">{formError}</p> : null}
      </div>
      {available.length === 0 ? (
        <div className="flex justify-end gap-2 border-t border-stone-200 px-5 py-4">
          <button type="button" className={secondaryButtonClass} onClick={onClose}>
            Cancel
          </button>
          {catalog.length === 0 ? (
            <Link href="/settings?tab=events" className={primaryButtonClass} onClick={onClose}>
              Open Settings
            </Link>
          ) : null}
        </div>
      ) : (
        <DialogFooter onClose={onClose} submitLabel="Add event" />
      )}
    </form>
  );
}

function DialogHeader({
  titleId,
  title,
  description,
  icon,
  onClose,
}: {
  titleId: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-stone-200 px-5 py-4">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-700">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 id={titleId} className="text-base font-semibold tracking-tight">
            {title}
          </h2>
          <p className="mt-1 text-sm text-stone-500">{description}</p>
        </div>
      </div>
      <button
        type="button"
        className="flex size-8 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-950"
        aria-label="Close"
        onClick={onClose}
      >
        <CloseIcon />
      </button>
    </div>
  );
}

function DialogFooter({ onClose, submitLabel }: { onClose: () => void; submitLabel: string }) {
  return (
    <div className="flex justify-end gap-2 border-t border-stone-200 px-5 py-4">
      <button type="button" className={secondaryButtonClass} onClick={onClose}>
        Cancel
      </button>
      <button type="submit" className={primaryButtonClass}>
        {submitLabel}
      </button>
    </div>
  );
}

function locationIdForVenue(venue: string, locations: LocationReference[]) {
  const cleaned = venue.trim();
  if (!cleaned) {
    return null;
  }

  const match = locations.find(
    (location) =>
      sameLocationName(location.venueName, cleaned) || sameLocationName(location.nickname, cleaned),
  );
  return match?.id ?? null;
}

function employeeFromPlacement(
  person: StaffPlacement,
  locations: LocationReference[],
): StaffEmployee {
  const parts = splitFullName(person.name);
  const location = locations.find((item) => item.id === person.locationId);
  return {
    id: person.id,
    fullName: person.name,
    firstName: parts.firstName,
    lastName: parts.lastName,
    photo: null,
    nationality: "",
    dateOfBirth: "",
    joiningDate: "",
    position: "",
    venue: location?.venueName || location?.nickname || "",
    basicSalary: null,
    allowances: null,
    salary: null,
  };
}

function resolvedLocationId(person: StaffPlacement, knownIds: Set<string>) {
  return person.locationId && knownIds.has(person.locationId) ? person.locationId : null;
}

function sameLabelSlot(left: LabelSlot | null, right: LabelSlot | null) {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return (
    left.locationId === right.locationId &&
    left.beforeId === right.beforeId &&
    left.index === right.index &&
    left.beforeItemId === right.beforeItemId
  );
}

function orderedPeople<T extends { id: string }>(
  people: T[],
  locationId: string | null,
  orders: ColumnOrders,
) {
  const order = orders[columnOrderKey(locationId)];
  if (!order?.length) {
    return people;
  }

  const index = new Map(order.map((id, position) => [id, position]));
  return [...people].sort((left, right) => {
    const leftIndex = index.get(left.id);
    const rightIndex = index.get(right.id);
    if (leftIndex == null && rightIndex == null) {
      return 0;
    }

    if (leftIndex == null) {
      return 1;
    }

    if (rightIndex == null) {
      return -1;
    }

    return leftIndex - rightIndex;
  });
}

function peopleInColumn(
  placements: StaffPlacement[],
  known: Set<string>,
  locationId: string | null,
  orders: ColumnOrders,
) {
  return orderedPeople(
    placements.filter((person) => resolvedLocationId(person, known) === locationId),
    locationId,
    orders,
  );
}

function visualRows(
  locationId: string | null,
  omitStaffId: string | undefined,
  placements: StaffPlacement[],
  known: Set<string>,
  orders: ColumnOrders,
  labels: BoardLabel[],
  hiring: HiringRole[],
  locations: LocationReference[],
): VisualRow[] {
  const people = peopleInColumn(placements, known, locationId, orders);
  const roles = hiring.filter(
    (role) => locationIdForRole(role, locations) === locationId && role.id !== omitStaffId,
  );
  return placeHiring(columnRows(people, labels, locationId), roles, orders[columnOrderKey(locationId)]).flatMap(
    (item) => {
      const id = boardItemId(item);
      if (id === omitStaffId) {
        return [];
      }

      return [{ kind: item.kind, id }];
    },
  );
}

function placeHiring(
  rows: ColumnRow<StaffPlacement>[],
  roles: HiringRole[],
  order: string[] | undefined,
): BoardItem[] {
  const hiringItems = roles.map((role) => ({ kind: "hiring" as const, role }));
  const baseItems: BoardItem[] = rows.map((row) =>
    row.kind === "staff" ? { kind: "staff", person: row.person } : { kind: "label", label: row.label },
  );
  if (!order?.length || !roles.some((role) => order.includes(role.id))) {
    return [...hiringItems, ...baseItems];
  }

  const byId = new Map<string, BoardItem>();
  for (const item of [...hiringItems, ...baseItems]) {
    byId.set(boardItemId(item), item);
  }

  const seen = new Set<string>();
  const placed: BoardItem[] = [];
  for (const id of order) {
    const item = byId.get(id);
    if (!item || seen.has(id)) {
      continue;
    }

    seen.add(id);
    placed.push(item);
  }

  const missingHiring = hiringItems.filter((item) => !seen.has(item.role.id));
  const missingBase = baseItems.filter((item) => !seen.has(boardItemId(item)));
  return [...missingHiring, ...placed, ...missingBase];
}

function boardItemId(item: BoardItem) {
  if (item.kind === "staff") {
    return item.person.id;
  }

  if (item.kind === "label") {
    return item.label.id;
  }

  return item.role.id;
}

function locationIdForRole(role: HiringRole, locations: LocationReference[]) {
  const match = locations.find(
    (location) =>
      sameLocationName(role.venue, location.venueName) || sameLocationName(role.venue, location.nickname),
  );
  return match?.id ?? null;
}

function insertStaff(rows: VisualRow[], staffId: string, beforeItemId: string | null) {
  const next = rows.filter((row) => !(row.kind === "staff" && row.id === staffId));
  const index = beforeItemId == null ? next.length : next.findIndex((row) => row.id === beforeItemId);
  next.splice(index < 0 ? next.length : index, 0, { kind: "staff", id: staffId });
  return next;
}

function staffIdsOf(rows: VisualRow[]) {
  return rows.flatMap((row) => (row.kind === "staff" ? [row.id] : []));
}

function persistedOrder(rows: VisualRow[]) {
  if (!rows.some((row) => row.kind === "hiring")) {
    return staffIdsOf(rows);
  }

  return rows.map((row) => row.id);
}

function insertItem(rows: VisualRow[], item: VisualRow, beforeItemId: string | null) {
  const next = rows.filter((row) => !(row.kind === item.kind && row.id === item.id));
  const index = beforeItemId == null ? next.length : next.findIndex((row) => row.id === beforeItemId);
  next.splice(index < 0 ? next.length : index, 0, item);
  return next;
}

function sameVisual(left: VisualRow[], right: VisualRow[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((row, index) => row.kind === right[index]?.kind && row.id === right[index]?.id);
}

function staffDropUnchanged(
  staffId: string,
  slot: LabelSlot,
  placements: StaffPlacement[],
  locations: LocationReference[],
  orders: ColumnOrders,
  labels: BoardLabel[],
  hiring: HiringRole[],
) {
  const known = new Set(locations.map((location) => location.id));
  const person = placements.find((item) => item.id === staffId);
  const role = hiring.find((item) => item.id === staffId);
  if (!person && !role) {
    return true;
  }

  const from = person ? resolvedLocationId(person, known) : locationIdForRole(role as HiringRole, locations);
  if (from !== slot.locationId) {
    return false;
  }

  const rows = visualRows(from, undefined, placements, known, orders, labels, hiring, locations);
  const index = rows.findIndex((row) => row.id === staffId && row.kind !== "label");
  if (index < 0) {
    return false;
  }

  return (rows[index + 1]?.id ?? null) === (slot.beforeItemId ?? null);
}

function positionRanks(lookups: DirectoryLookups) {
  const rank = new Map<string, number>();
  let index = 0;
  for (const department of lookups.departments) {
    for (const position of lookups.positions) {
      if (position.departmentId !== department.id) {
        continue;
      }

      const key = normalizeName(position.name).toLowerCase();
      if (rank.has(key)) {
        continue;
      }

      rank.set(key, index);
      index += 1;
    }
  }

  return rank;
}

function slotBeforeItem(
  locationId: string | null,
  rows: ColumnRow<StaffPlacement>[],
  itemId: string,
): LabelSlot {
  const insertAt = rows.findIndex(
    (row) => (row.kind === "staff" ? row.person.id : row.label.id) === itemId,
  );
  return describeInsert(locationId, rows, insertAt < 0 ? rows.length : insertAt);
}

function describeInsert(
  locationId: string | null,
  rows: ColumnRow<StaffPlacement>[],
  insertAt: number,
): LabelSlot {
  let nextStaff = -1;
  for (let index = insertAt; index < rows.length; index += 1) {
    if (rows[index]?.kind === "staff") {
      nextStaff = index;
      break;
    }
  }

  const nextRow = nextStaff === -1 ? null : rows[nextStaff];
  const beforeId = nextRow?.kind === "staff" ? nextRow.person.id : null;
  let rangeStart = nextStaff === -1 ? rows.length : nextStaff;
  while (rangeStart > 0 && rows[rangeStart - 1]?.kind === "label") {
    rangeStart -= 1;
  }

  let index = 0;
  for (let cursor = rangeStart; cursor < insertAt; cursor += 1) {
    if (rows[cursor]?.kind === "label") {
      index += 1;
    }
  }

  const beforeItem = rows[insertAt];
  return {
    locationId,
    beforeId,
    index,
    beforeItemId: beforeItem
      ? beforeItem.kind === "staff"
        ? beforeItem.person.id
        : beforeItem.label.id
      : null,
  };
}

function labelDropUnchanged(
  labelId: string,
  slot: LabelSlot,
  placements: StaffPlacement[],
  locations: LocationReference[],
  orders: ColumnOrders,
  labels: BoardLabel[],
  hiring: HiringRole[],
) {
  const known = new Set(locations.map((location) => location.id));
  const label = labels.find((item) => item.id === labelId);
  if (!label) {
    return true;
  }

  const from = label.locationId && known.has(label.locationId) ? label.locationId : null;
  if (from !== slot.locationId) {
    return false;
  }

  const rows = visualRows(from, undefined, placements, known, orders, labels, hiring, locations);
  const index = rows.findIndex((row) => row.kind === "label" && row.id === labelId);
  if (index < 0) {
    return false;
  }

  return (rows[index + 1]?.id ?? null) === (slot.beforeItemId ?? null);
}

function slotAt(x: number, y: number, draggingId: string): LabelSlot | null {
  const dropId = dropIdAt(x, y);
  if (!dropId) {
    return null;
  }

  const column = document.querySelector(`[data-drop-id="${CSS.escape(dropId)}"]`);
  if (!(column instanceof HTMLElement)) {
    return null;
  }

  const rows = [...column.querySelectorAll<HTMLElement>("li[data-item-id]")].filter(
    (row) => row.dataset.itemId !== draggingId,
  );
  let insertAt = rows.length;
  for (let index = 0; index < rows.length; index += 1) {
    const rect = rows[index].getBoundingClientRect();
    if (y < rect.top + rect.height / 2) {
      insertAt = index;
      break;
    }
  }

  let nextStaff = -1;
  for (let index = insertAt; index < rows.length; index += 1) {
    if (rows[index].dataset.itemKind === "staff") {
      nextStaff = index;
      break;
    }
  }

  const beforeId = nextStaff === -1 ? null : (rows[nextStaff].dataset.itemId ?? null);
  let rangeStart = nextStaff === -1 ? rows.length : nextStaff;
  while (rangeStart > 0 && rows[rangeStart - 1]?.dataset.itemKind === "label") {
    rangeStart -= 1;
  }

  let index = 0;
  for (let cursor = rangeStart; cursor < insertAt; cursor += 1) {
    if (rows[cursor].dataset.itemKind === "label") {
      index += 1;
    }
  }

  return {
    locationId: dropId === unassignedDropId ? null : dropId,
    beforeId,
    index,
    beforeItemId: rows[insertAt]?.dataset.itemId ?? null,
  };
}

function dropIdAt(x: number, y: number) {
  for (const element of document.elementsFromPoint(x, y)) {
    if (!(element instanceof Element)) {
      continue;
    }

    const zone = element.closest("[data-drop-id]");
    if (zone instanceof HTMLElement && zone.dataset.dropId) {
      return zone.dataset.dropId;
    }
  }

  return null;
}

function PromotionTag({
  promotion,
  hideSalary = false,
}: {
  promotion?: StaffPromotion | null;
  hideSalary?: boolean;
}) {
  if (!promotion) {
    return null;
  }

  return (
    <span className="mt-1 inline-flex max-w-full items-baseline gap-1.5 rounded-md bg-emerald-100 px-1.5 py-0.5 text-xs font-medium leading-4 text-emerald-800">
      <span aria-hidden="true">↑</span>
      <span className="min-w-0 truncate" title={promotion.newPosition}>
        {promotion.newPosition}
      </span>
      {hideSalary ? null : (
        <>
          <span aria-hidden="true">-</span>
          <span className="shrink-0 tabular-nums">{formatBoardSalary(promotion.newSalary)}</span>
        </>
      )}
    </span>
  );
}

function PromotionFields({
  positionId,
  position,
  salary,
  effectiveDate,
  lookups,
  onPosition,
  onPositionText,
  onSalary,
  onDate,
}: {
  positionId: string;
  position: string;
  salary: string;
  effectiveDate: string;
  lookups: DirectoryLookups;
  onPosition: (positionId: string) => void;
  onPositionText: (position: string) => void;
  onSalary: (salary: string) => void;
  onDate: (date: string) => void;
}) {
  const groups = lookups.departments
    .map((department) => ({
      department,
      positions: lookups.positions.filter((item) => item.departmentId === department.id),
    }))
    .filter((group) => group.positions.length > 0);

  return (
    <div className="space-y-4 px-5 py-4">
      <label className="block text-sm font-medium text-stone-800">
        New position
        {groups.length > 0 ? (
          <select
            value={positionId}
            onChange={(event) => onPosition(event.target.value)}
            required
            className={fieldClass}
          >
            <option value="">Select a position</option>
            {positionId === "__kept__" && position ? (
              <option value="__kept__">{position}</option>
            ) : null}
            {groups.map((group) => (
              <optgroup key={group.department.id} label={group.department.name}>
                {group.positions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        ) : (
          <input
            value={position}
            onChange={(event) => onPositionText(event.target.value)}
            required
            className={fieldClass}
          />
        )}
      </label>
      <label className="block text-sm font-medium text-stone-800">
        New salary package
        <input
          type="text"
          inputMode="decimal"
          value={salary}
          onChange={(event) => onSalary(event.target.value)}
          required
          placeholder="0.00"
          className={fieldClass}
        />
      </label>
      <label className="block text-sm font-medium text-stone-800">
        Effective date
        <DateField value={effectiveDate} onChange={onDate} />
      </label>
    </div>
  );
}

function UnassignedIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none">
      <circle cx="8" cy="4.75" r="2" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M3.75 13.25c.55-2.35 2.2-3.5 4.25-3.5s3.7 1.15 4.25 3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function AddVenueIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none">
      <path
        d="M2.75 13.25V6.1L8 3.25l5.25 2.85v7.15"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M6.4 13.25V9.4h3.2v3.85" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M2.5 13.25h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function ColumnGripIcon() {
  return (
    <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor">
      <circle cx="3.5" cy="3.5" r="1.15" />
      <circle cx="8.5" cy="3.5" r="1.15" />
      <circle cx="3.5" cy="8" r="1.15" />
      <circle cx="8.5" cy="8" r="1.15" />
      <circle cx="3.5" cy="12.5" r="1.15" />
      <circle cx="8.5" cy="12.5" r="1.15" />
    </svg>
  );
}

function AddEventIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none">
      <rect x="2.5" y="3.5" width="11" height="10" rx="1.4" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M2.5 6.75h11M5.5 2.25v2.5M10.5 2.25v2.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function AddStaffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none">
      <circle cx="6" cy="5" r="2" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M2.25 13.1c.5-2.15 1.95-3.25 3.75-3.25s3.25 1.1 3.75 3.25"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path d="M12.15 6.15v4.2M10.05 8.25h4.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none">
      <rect x="3.25" y="7" width="9.5" height="6.5" rx="1.4" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5.25 7V5.1a2.75 2.75 0 0 1 5.5 0V7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function UnlockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none">
      <rect x="3.25" y="7" width="9.5" height="6.5" rx="1.4" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5.25 7V5.1a2.75 2.75 0 0 1 5.2-1.25" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function UpArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none">
      <path
        d="M8 13V3M8 3 4.5 6.5M8 3l3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function defaultSalaryText(position: { defaultSalary: number | null } | undefined) {
  return position?.defaultSalary == null ? "" : String(position.defaultSalary);
}

function formatBoardSalary(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function employeeCardName(employee: StaffEmployee | undefined, fallback: string) {
  const name = `${employee?.firstName ?? ""} ${employee?.lastName ?? ""}`.replace(/\s+/g, " ").trim();
  return name || fallback;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
  }

  return (parts[0]?.charAt(0) ?? "?").toUpperCase();
}

function RefreshIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="shrink-0">
      <path
        d="M11.6 4.2A4.6 4.6 0 0 0 3.2 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path
        d="M2.4 9.8A4.6 4.6 0 0 0 10.8 9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path
        d="M11.7 1.8v2.6H9.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2.3 12.2V9.6h2.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MenuGlyph({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`flex w-4 shrink-0 items-center justify-center ${className}`} aria-hidden="true">
      {children}
    </span>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M3 3l8 8M11 3 3 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
