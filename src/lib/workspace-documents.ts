import { boardLabelsEvent, boardLabelsKey, eventBoardLabelsEvent, eventBoardLabelsKey } from "@/lib/board-labels";
import { boardOrderEvent, boardOrderKey, eventBoardOrderEvent, eventBoardOrderKey } from "@/lib/board-order";
import { cardLabelsEvent, cardLabelsKey, eventCardLabelsEvent, eventCardLabelsKey } from "@/lib/card-labels";
import { cardTagsEvent, cardTagsKey, eventCardTagsEvent, eventCardTagsKey } from "@/lib/card-tags";
import { directoryLookupsEvent, directoryLookupsKey } from "@/lib/directory-lookups";
import { eventBoardEvent, eventBoardKey, eventsEvent, eventsKey } from "@/lib/events";
import { hiringEvent, hiringKey } from "@/lib/hiring";
import { locationBoardEvent, locationBoardKey, locationsEvent, locationsKey } from "@/lib/locations";
import { outsourcedEvent, outsourcedKey } from "@/lib/outsourced";
import { payrollViewEvent, payrollViewKey } from "@/lib/payroll-view";
import { promotionsEvent, promotionsKey } from "@/lib/promotions";
import { staffDirectoryEvent, staffDirectoryKey } from "@/lib/staff-directory-store";
import { eventPlacementsEvent, eventPlacementsKey, placementsEvent, placementsKey } from "@/lib/staff-placements";

export const workspaceDocuments = [
  { key: staffDirectoryKey, event: staffDirectoryEvent },
  { key: outsourcedKey, event: outsourcedEvent },
  { key: promotionsKey, event: promotionsEvent },
  { key: hiringKey, event: hiringEvent },
  { key: boardLabelsKey, event: boardLabelsEvent },
  { key: eventBoardLabelsKey, event: eventBoardLabelsEvent },
  { key: cardLabelsKey, event: cardLabelsEvent },
  { key: eventCardLabelsKey, event: eventCardLabelsEvent },
  { key: cardTagsKey, event: cardTagsEvent },
  { key: eventCardTagsKey, event: eventCardTagsEvent },
  { key: boardOrderKey, event: boardOrderEvent },
  { key: eventBoardOrderKey, event: eventBoardOrderEvent },
  { key: placementsKey, event: placementsEvent },
  { key: eventPlacementsKey, event: eventPlacementsEvent },
  { key: directoryLookupsKey, event: directoryLookupsEvent },
  { key: eventsKey, event: eventsEvent },
  { key: eventBoardKey, event: eventBoardEvent },
  { key: locationsKey, event: locationsEvent },
  { key: locationBoardKey, event: locationBoardEvent },
  { key: payrollViewKey, event: payrollViewEvent },
] as const;

export type WorkspaceDocumentKey = (typeof workspaceDocuments)[number]["key"];
