"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  normalizeName,
  parseDefaultSalary,
  sameName,
  type DirectoryLookups,
  type LookupDepartment,
  type LookupPosition,
} from "@/lib/directory-lookups";
import { formatSalary, type StaffEmployee } from "@/lib/staff";
import {
  defaultLocationColor,
  normalizeLocationColor,
  normalizeLocationName,
  sameLocationName,
  type LocationReference,
} from "@/lib/locations";
import { PrivacySettings } from "@/components/dashboard-visibility";
import { usePrivacy } from "@/components/privacy-provider";
import { TeamAccess } from "@/components/team-access";
import { useDirectoryLookups } from "@/components/use-directory-lookups";
import { useStaffDirectory } from "@/components/use-staff-directory";
import { useEvents } from "@/components/use-events";
import { useLocations } from "@/components/use-locations";
import { normalizeEventName, sameEventName, type EventDefinition } from "@/lib/events";

const settingsTabs = [
  { id: "directory", label: "Directory Lookups" },
  { id: "locations", label: "Locations" },
  { id: "events", label: "Events" },
  { id: "team", label: "Team Access" },
  { id: "privacy", label: "Privacy" },
] as const;
const directoryTabs = [
  { id: "country", label: "Country" },
  { id: "departments", label: "Departments" },
  { id: "positions", label: "Positions" },
] as const;

type SettingsTab = (typeof settingsTabs)[number]["id"];
type DirectoryTab = (typeof directoryTabs)[number]["id"];

const fieldClass =
  "h-9 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none focus:border-stone-950";
const secondaryButtonClass =
  "inline-flex h-9 items-center justify-center rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium text-stone-800 hover:bg-stone-50";
const primaryButtonClass =
  "inline-flex h-9 items-center justify-center rounded-lg bg-stone-950 px-3 text-sm font-medium text-white hover:bg-stone-800";
const colorInputClass =
  "block h-9 w-14 cursor-pointer rounded-lg border border-stone-300 bg-white p-1";

export function SettingsScreen({ initialTab = "directory" }: { initialTab?: SettingsTab }) {
  const { lookups, update } = useDirectoryLookups();
  const { locations, update: updateLocations } = useLocations();
  const { events, update: updateEvents } = useEvents();
  const privacy = usePrivacy();
  const [settingsTab, setSettingsTab] = useState<SettingsTab>(initialTab);
  const [directoryTab, setDirectoryTab] = useState<DirectoryTab>("country");
  const visibleTabs = settingsTabs.filter((tab) => tab.id !== "privacy" || privacy.snapshot.isOwner);

  useEffect(() => {
    setSettingsTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    function openTeam() {
      setSettingsTab("team");
    }

    window.addEventListener("people-open-team-settings", openTeam);
    return () => window.removeEventListener("people-open-team-settings", openTeam);
  }, []);

  useEffect(() => {
    if (privacy.ready && settingsTab === "privacy" && !privacy.snapshot.isOwner) {
      setSettingsTab("directory");
    }
  }, [privacy.ready, privacy.snapshot.isOwner, settingsTab]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-5 md:px-6">
      <div className="flex shrink-0 gap-6 border-b border-stone-200" role="tablist" aria-label="Settings">
        {visibleTabs.map((tab) => (
          <TabButton
            key={tab.id}
            id={`settings-tab-${tab.id}`}
            controls={`settings-panel-${tab.id}`}
            selected={settingsTab === tab.id}
            onClick={() => setSettingsTab(tab.id)}
          >
            {tab.label}
          </TabButton>
        ))}
      </div>

      {settingsTab === "privacy" && privacy.snapshot.isOwner ? (
        <div
          id="settings-panel-privacy"
          role="tabpanel"
          aria-labelledby="settings-tab-privacy"
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <PrivacySettings />
        </div>
      ) : settingsTab === "team" ? (
        <div
          id="settings-panel-team"
          role="tabpanel"
          aria-labelledby="settings-tab-team"
          className="flex min-h-0 flex-1 flex-col overflow-hidden pt-5"
        >
          <TeamAccess />
        </div>
      ) : settingsTab === "events" ? (
        <div
          id="settings-panel-events"
          role="tabpanel"
          aria-labelledby="settings-tab-events"
          className="flex min-h-0 flex-1 flex-col pt-4"
        >
          <p className="max-w-2xl shrink-0 text-sm text-stone-500">
            Define events here, then add them on Events Manning. Saved in this browser.
          </p>
          <div className="mt-4 min-h-0 flex-1 overflow-auto">
            <EventsPanel events={events} update={updateEvents} />
          </div>
        </div>
      ) : settingsTab === "locations" ? (
        <div
          id="settings-panel-locations"
          role="tabpanel"
          aria-labelledby="settings-tab-locations"
          className="flex min-h-0 flex-1 flex-col pt-4"
        >
          <p className="max-w-2xl shrink-0 text-sm text-stone-500">
            Nicknames stand in for venue names. Saved in this browser.
          </p>
          <div className="mt-4 min-h-0 flex-1 overflow-auto">
            <LocationsPanel locations={locations} update={updateLocations} />
          </div>
        </div>
      ) : (
        <div
          id="settings-panel-directory"
          role="tabpanel"
          aria-labelledby="settings-tab-directory"
          className="flex min-h-0 flex-1 flex-col pt-4"
        >
            <div className="flex shrink-0 flex-wrap gap-2" role="tablist" aria-label="Directory Lookups">
              {directoryTabs.map((tab) => {
                const selected = directoryTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    id={`directory-tab-${tab.id}`}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    aria-controls={`directory-panel-${tab.id}`}
                    className={`h-8 rounded-full px-3 text-sm ${
                      selected
                        ? "bg-stone-950 font-medium text-white"
                        : "bg-stone-100 text-stone-700 hover:bg-stone-200"
                    }`}
                    onClick={() => setDirectoryTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <p className="mt-4 max-w-2xl shrink-0 text-sm text-stone-500">
              {directoryTab === "country"
                ? "Countries fill the country field when you add an employee. Saved in this browser."
                : directoryTab === "departments"
                  ? "Departments group positions. Saved in this browser."
                  : "A position's default salary fills in on a new employee, unless you enter a different salary there. Saved in this browser."}
            </p>

            <div className="mt-4 min-h-0 flex-1 overflow-auto">
              {directoryTab === "country" ? <CountryPanel lookups={lookups} update={update} /> : null}
              {directoryTab === "departments" ? (
                <DepartmentsPanel lookups={lookups} update={update} />
              ) : null}
              {directoryTab === "positions" ? (
                <PositionsPanel
                  lookups={lookups}
                  update={update}
                  onAddDepartment={() => setDirectoryTab("departments")}
                />
              ) : null}
            </div>
        </div>
      )}
    </div>
  );
}

function LocationsPanel({
  locations,
  update,
}: {
  locations: LocationReference[];
  update: (next: LocationReference[]) => void;
}) {
  const [nickname, setNickname] = useState("");
  const [venueName, setVenueName] = useState("");
  const [color, setColor] = useState(defaultLocationColor);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftNickname, setDraftNickname] = useState("");
  const [draftVenueName, setDraftVenueName] = useState("");
  const [draftColor, setDraftColor] = useState(defaultLocationColor);
  const [error, setError] = useState("");

  function addLocation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanedNickname = normalizeLocationName(nickname);
    const cleanedVenue = normalizeLocationName(venueName);
    const message = locationError(locations, cleanedNickname, cleanedVenue);
    if (message) {
      setError(message);
      return;
    }

    update([
      ...locations,
      {
        id: crypto.randomUUID(),
        nickname: cleanedNickname,
        venueName: cleanedVenue,
        color: normalizeLocationColor(color, cleanedNickname),
      },
    ]);
    setNickname("");
    setVenueName("");
    setColor(defaultLocationColor);
    setError("");
  }

  function saveLocation(event: React.FormEvent<HTMLFormElement>, location: LocationReference) {
    event.preventDefault();
    const cleanedNickname = normalizeLocationName(draftNickname);
    const cleanedVenue = normalizeLocationName(draftVenueName);
    const message = locationError(locations, cleanedNickname, cleanedVenue, location.id);
    if (message) {
      setError(message);
      return;
    }

    update(
      locations.map((item) =>
        item.id === location.id
          ? {
              ...item,
              nickname: cleanedNickname,
              venueName: cleanedVenue,
              color: normalizeLocationColor(draftColor, cleanedNickname),
            }
          : item,
      ),
    );
    setEditingId(null);
    setError("");
  }

  function removeLocation(id: string) {
    update(locations.filter((location) => location.id !== id));
    if (editingId === id) {
      setEditingId(null);
    }
    setError("");
  }

  return (
    <div>
      <form onSubmit={addLocation} className="grid max-w-3xl gap-3 sm:grid-cols-[9rem_1fr_auto_auto] sm:items-end">
        <label className="block text-sm font-medium text-stone-800">
          Nick name
          <input
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            placeholder="JBR"
            className={`${fieldClass} mt-1.5`}
          />
        </label>
        <label className="block text-sm font-medium text-stone-800">
          Venue name
          <input
            value={venueName}
            onChange={(event) => setVenueName(event.target.value)}
            placeholder="The Maine Oyster Bar & Grill"
            className={`${fieldClass} mt-1.5`}
          />
        </label>
        <label className="block text-sm font-medium text-stone-800">
          Color
          <input
            type="color"
            value={color}
            onChange={(event) => setColor(event.target.value)}
            aria-label="Header color"
            className={`${colorInputClass} mt-1.5`}
          />
        </label>
        <button type="submit" className={primaryButtonClass}>
          Add
        </button>
      </form>
      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      <div className="mt-4 overflow-hidden rounded-xl border border-stone-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-xs font-medium text-stone-500">
            <tr>
              <th className="w-36 px-3 py-2 font-medium">Nick Name</th>
              <th className="px-3 py-2 font-medium">Venue Name</th>
              <th className="w-20 px-3 py-2 font-medium">Color</th>
              <th className="w-20 px-3 py-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {locations.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-sm text-stone-500">
                  No locations yet.
                </td>
              </tr>
            ) : (
              locations.map((location) =>
                editingId === location.id ? (
                  <tr key={location.id}>
                    <td colSpan={4} className="px-3 py-3">
                      <form
                        onSubmit={(event) => saveLocation(event, location)}
                        className="grid gap-3 sm:grid-cols-[9rem_1fr_auto_auto] sm:items-end"
                      >
                        <label className="block text-sm font-medium text-stone-800">
                          Nick name
                          <input
                            value={draftNickname}
                            onChange={(event) => setDraftNickname(event.target.value)}
                            aria-label={`Nick name for ${location.venueName}`}
                            className={`${fieldClass} mt-1.5`}
                            autoFocus
                          />
                        </label>
                        <label className="block text-sm font-medium text-stone-800">
                          Venue name
                          <input
                            value={draftVenueName}
                            onChange={(event) => setDraftVenueName(event.target.value)}
                            aria-label={`Venue name for ${location.nickname}`}
                            className={`${fieldClass} mt-1.5`}
                          />
                        </label>
                        <label className="block text-sm font-medium text-stone-800">
                          Color
                          <input
                            type="color"
                            value={draftColor}
                            onChange={(event) => setDraftColor(event.target.value)}
                            aria-label={`Header color for ${location.nickname}`}
                            className={`${colorInputClass} mt-1.5`}
                          />
                        </label>
                        <div className="flex gap-2">
                          <button type="submit" className={primaryButtonClass}>
                            Save
                          </button>
                          <button
                            type="button"
                            className={secondaryButtonClass}
                            onClick={() => {
                              setEditingId(null);
                              setError("");
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    </td>
                  </tr>
                ) : (
                  <tr key={location.id}>
                    <td className="px-3 py-2 font-medium text-stone-950">{location.nickname}</td>
                    <td className="px-3 py-2 text-stone-950">{location.venueName}</td>
                    <td className="px-3 py-2">
                      <input
                        type="color"
                        value={location.color || "#ffffff"}
                        aria-label={`Header color for ${location.nickname}`}
                        className={colorInputClass}
                        onChange={(event) => {
                          const next = normalizeLocationColor(event.target.value, location.nickname);
                          update(
                            locations.map((item) =>
                              item.id === location.id ? { ...item, color: next } : item,
                            ),
                          );
                        }}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex items-center justify-end gap-1">
                        <button
                          type="button"
                          className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-stone-500 hover:bg-stone-100 hover:text-stone-950"
                          aria-label={`Edit ${location.nickname}`}
                          onClick={() => {
                            setEditingId(location.id);
                            setDraftNickname(location.nickname);
                            setDraftVenueName(location.venueName);
                            setDraftColor(location.color || "#ffffff");
                            setError("");
                          }}
                        >
                          <PencilIcon />
                        </button>
                        <button
                          type="button"
                          className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-stone-500 hover:bg-stone-100 hover:text-stone-950"
                          aria-label={`Remove ${location.nickname}`}
                          onClick={() => removeLocation(location.id)}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </td>
                  </tr>
                ),
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EventsPanel({
  events,
  update,
}: {
  events: EventDefinition[];
  update: (next: EventDefinition[]) => void;
}) {
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [error, setError] = useState("");

  function addEvent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleaned = normalizeEventName(name);
    const message = eventError(events, cleaned);
    if (message) {
      setError(message);
      return;
    }

    update([...events, { id: crypto.randomUUID(), name: cleaned }]);
    setName("");
    setError("");
  }

  function saveEvent(event: React.FormEvent<HTMLFormElement>, item: EventDefinition) {
    event.preventDefault();
    const cleaned = normalizeEventName(draftName);
    const message = eventError(events, cleaned, item.id);
    if (message) {
      setError(message);
      return;
    }

    update(events.map((current) => (current.id === item.id ? { ...current, name: cleaned } : current)));
    setEditingId(null);
    setError("");
  }

  function removeEvent(id: string) {
    update(events.filter((item) => item.id !== id));
    if (editingId === id) {
      setEditingId(null);
    }
    setError("");
  }

  return (
    <div>
      <form onSubmit={addEvent} className="grid max-w-xl gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <label className="block text-sm font-medium text-stone-800">
          Event name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Sunday brunch"
            className={`${fieldClass} mt-1.5`}
          />
        </label>
        <button type="submit" className={primaryButtonClass}>
          Add
        </button>
      </form>
      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      <div className="mt-4 overflow-hidden rounded-xl border border-stone-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-xs font-medium text-stone-500">
            <tr>
              <th className="px-3 py-2 font-medium">Event</th>
              <th className="w-28 px-3 py-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {events.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-3 py-8 text-center text-sm text-stone-500">
                  No events yet.
                </td>
              </tr>
            ) : (
              events.map((item) =>
                editingId === item.id ? (
                  <tr key={item.id}>
                    <td colSpan={2} className="px-3 py-3">
                      <form
                        onSubmit={(event) => saveEvent(event, item)}
                        className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
                      >
                        <label className="block text-sm font-medium text-stone-800">
                          Event name
                          <input
                            value={draftName}
                            onChange={(event) => setDraftName(event.target.value)}
                            aria-label={`Event name for ${item.name}`}
                            className={`${fieldClass} mt-1.5`}
                            autoFocus
                          />
                        </label>
                        <div className="flex gap-2">
                          <button type="submit" className={primaryButtonClass}>
                            Save
                          </button>
                          <button
                            type="button"
                            className={secondaryButtonClass}
                            onClick={() => {
                              setEditingId(null);
                              setError("");
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    </td>
                  </tr>
                ) : (
                  <tr key={item.id}>
                    <td className="px-3 py-2 font-medium text-stone-950">{item.name}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        className="text-xs font-medium text-stone-500 underline-offset-4 hover:text-stone-950 hover:underline"
                        onClick={() => {
                          setEditingId(item.id);
                          setDraftName(item.name);
                          setError("");
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="ml-3 text-xs font-medium text-stone-500 underline-offset-4 hover:text-stone-950 hover:underline"
                        onClick={() => removeEvent(item.id)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ),
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function eventError(events: EventDefinition[], name: string, ignoreId?: string) {
  if (!name) {
    return "Enter an event name.";
  }

  const others = events.filter((item) => item.id !== ignoreId);
  if (others.some((item) => sameEventName(item.name, name))) {
    return `${name} is already in the list.`;
  }

  return "";
}

function locationError(
  locations: LocationReference[],
  nickname: string,
  venueName: string,
  ignoreId?: string,
) {
  if (!nickname) {
    return "Enter a nick name.";
  }

  if (!venueName) {
    return "Enter a venue name.";
  }

  const others = locations.filter((location) => location.id !== ignoreId);
  if (others.some((location) => sameLocationName(location.nickname, nickname))) {
    return `${nickname} is already in the list.`;
  }

  if (others.some((location) => sameLocationName(location.venueName, venueName))) {
    return `${venueName} is already in the list.`;
  }

  return "";
}

function CountryPanel({
  lookups,
  update,
}: {
  lookups: DirectoryLookups;
  update: (next: DirectoryLookups) => void;
}) {
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const drag = useRef<RowDrag | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const countries = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return lookups.countries;
    }

    return lookups.countries.filter((country) => country.name.toLowerCase().includes(needle));
  }, [lookups.countries, query]);

  function addCountry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleaned = normalizeName(name);
    if (!cleaned) {
      setError("Enter a country.");
      return;
    }

    if (lookups.countries.some((country) => sameName(country.name, cleaned))) {
      setError(`${cleaned} is already in the list.`);
      return;
    }

    update({
      ...lookups,
      countries: [...lookups.countries, { id: crypto.randomUUID(), name: cleaned }],
    });
    setName("");
    setError("");
  }

  function removeCountry(id: string) {
    update({
      ...lookups,
      countries: lookups.countries.filter((country) => country.id !== id),
    });
    setError("");
  }

  return (
    <div id="directory-panel-country" role="tabpanel" aria-labelledby="directory-tab-country">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <label className="block min-w-0 flex-1 text-sm font-medium text-stone-800">
          Search
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a country"
            className={`${fieldClass} mt-1.5`}
          />
        </label>
        <form onSubmit={addCountry} className="flex min-w-0 flex-1 items-end gap-2">
          <label className="block min-w-0 flex-1 text-sm font-medium text-stone-800">
            Add a country
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={`${fieldClass} mt-1.5`}
            />
          </label>
          <button type="submit" className={primaryButtonClass}>
            Add
          </button>
        </form>
      </div>
      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      <p className="mt-4 text-sm text-stone-500">
        {countries.length === lookups.countries.length
          ? `${lookups.countries.length} ${lookups.countries.length === 1 ? "country" : "countries"}`
          : `${countries.length} of ${lookups.countries.length} countries`}
      </p>
      <ul className="mt-2 divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white">
        {countries.length === 0 ? (
          <li className="px-3 py-8 text-center text-sm text-stone-500">
            {lookups.countries.length === 0 ? "No countries yet." : "No countries match this search."}
          </li>
        ) : (
          countries.map((country) => (
            <li
              key={country.id}
              className={`flex items-center justify-between gap-3 px-3 py-2 ${rowDragClass(dragId, overId, country.id)}`}
              {...rowDragProps({
                kind: "country",
                id: country.id,
                drag,
                setDragId,
                setOverId,
                accepts: (state) => state.kind === "country" && !query.trim(),
                onMove: (fromId) => {
                  if (query.trim()) {
                    return;
                  }
                  update({
                    ...lookups,
                    countries: moveItem(lookups.countries, fromId, country.id),
                  });
                },
              })}
            >
              <GripIcon />
              <span className="min-w-0 flex-1 text-sm text-stone-950">{country.name}</span>
              <button
                type="button"
                className="text-xs font-medium text-stone-500 underline-offset-4 hover:text-stone-950 hover:underline"
                onClick={() => removeCountry(country.id)}
              >
                Remove
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function DepartmentsPanel({
  lookups,
  update,
}: {
  lookups: DirectoryLookups;
  update: (next: DirectoryLookups) => void;
}) {
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const drag = useRef<RowDrag | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const departments = lookups.departments;

  function addDepartment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleaned = normalizeName(name);
    if (!cleaned) {
      setError("Enter a department name.");
      return;
    }

    if (lookups.departments.some((department) => sameName(department.name, cleaned))) {
      setError(`${cleaned} already exists.`);
      return;
    }

    update({
      ...lookups,
      departments: [...lookups.departments, { id: crypto.randomUUID(), name: cleaned }],
    });
    setName("");
    setError("");
  }

  function saveDepartment(event: React.FormEvent<HTMLFormElement>, department: LookupDepartment) {
    event.preventDefault();
    const cleaned = normalizeName(draft);
    if (!cleaned) {
      setError("Enter a department name.");
      return;
    }

    const duplicate = lookups.departments.some(
      (item) => item.id !== department.id && sameName(item.name, cleaned),
    );
    if (duplicate) {
      setError(`${cleaned} already exists.`);
      return;
    }

    update({
      ...lookups,
      departments: lookups.departments.map((item) =>
        item.id === department.id ? { ...item, name: cleaned } : item,
      ),
    });
    setEditingId(null);
    setError("");
  }

  function removeDepartment(department: LookupDepartment) {
    const count = lookups.positions.filter(
      (position) => position.departmentId === department.id,
    ).length;
    if (count > 0) {
      setError(
        `Remove the ${count} ${count === 1 ? "position" : "positions"} in ${department.name} first.`,
      );
      return;
    }

    update({
      ...lookups,
      departments: lookups.departments.filter((item) => item.id !== department.id),
    });
    setError("");
  }

  return (
    <div id="directory-panel-departments" role="tabpanel" aria-labelledby="directory-tab-departments">
      <form onSubmit={addDepartment} className="flex max-w-xl items-end gap-2">
        <label className="block min-w-0 flex-1 text-sm font-medium text-stone-800">
          Department
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Kitchen"
            className={`${fieldClass} mt-1.5`}
          />
        </label>
        <button type="submit" className={primaryButtonClass}>
          Add
        </button>
      </form>
      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      <ul className="mt-4 divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white">
        {departments.length === 0 ? (
          <li className="px-3 py-8 text-center text-sm text-stone-500">No departments yet.</li>
        ) : (
          departments.map((department) => {
            const count = lookups.positions.filter(
              (position) => position.departmentId === department.id,
            ).length;
            return (
              <li
                key={department.id}
                className={`flex items-center gap-3 px-3 py-2 ${
                  editingId === department.id ? "" : rowDragClass(dragId, overId, department.id)
                }`}
                {...(editingId === department.id
                  ? {}
                  : rowDragProps({
                      kind: "department",
                      id: department.id,
                      drag,
                      setDragId,
                      setOverId,
                      accepts: (state) => state.kind === "department",
                      onMove: (fromId) => {
                        update({
                          ...lookups,
                          departments: moveItem(lookups.departments, fromId, department.id),
                        });
                      },
                    }))}
              >
                {editingId === department.id ? (
                  <form
                    onSubmit={(event) => saveDepartment(event, department)}
                    className="flex min-w-0 flex-1 items-center gap-2"
                  >
                    <input
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      aria-label={`Rename ${department.name}`}
                      className={fieldClass}
                      autoFocus
                    />
                    <button type="submit" className={primaryButtonClass}>
                      Save
                    </button>
                    <button
                      type="button"
                      className={secondaryButtonClass}
                      onClick={() => {
                        setEditingId(null);
                        setError("");
                      }}
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <>
                    <GripIcon />
                    <span className="min-w-0 flex-1 text-sm text-stone-950">{department.name}</span>
                    <span className="text-xs text-stone-500">
                      {count} {count === 1 ? "position" : "positions"}
                    </span>
                    <button
                      type="button"
                      className="text-xs font-medium text-stone-500 underline-offset-4 hover:text-stone-950 hover:underline"
                      onClick={() => {
                        setEditingId(department.id);
                        setDraft(department.name);
                        setError("");
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="text-xs font-medium text-stone-500 underline-offset-4 hover:text-stone-950 hover:underline"
                      onClick={() => removeDepartment(department)}
                    >
                      Remove
                    </button>
                  </>
                )}
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}

function PositionsPanel({
  lookups,
  update,
  onAddDepartment,
}: {
  lookups: DirectoryLookups;
  update: (next: DirectoryLookups) => void;
  onAddDepartment: () => void;
}) {
  const [error, setError] = useState("");
  const [addingDepartmentId, setAddingDepartmentId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftSalary, setDraftSalary] = useState("");
  const [editing, setEditing] = useState<LookupPosition | null>(null);
  const [editName, setEditName] = useState("");
  const [editSalary, setEditSalary] = useState("");
  const [editDepartmentId, setEditDepartmentId] = useState("");
  const drag = useRef<RowDrag | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const { employees } = useStaffDirectory();
  const { locations } = useLocations();
  const [staffPosition, setStaffPosition] = useState<LookupPosition | null>(null);
  const [staffRequest, setStaffRequest] = useState(0);
  const staffDialogRef = useRef<HTMLDialogElement>(null);
  const departments = lookups.departments;
  const staffByVenue = useMemo(
    () =>
      staffPosition
        ? groupStaffByVenue(
            employees.filter((employee) => sameName(employee.position, staffPosition.name)),
            locations,
          )
        : [],
    [employees, locations, staffPosition],
  );
  const staffTotal = staffByVenue.reduce((sum, group) => sum + group.people.length, 0);

  useEffect(() => {
    if (staffRequest === 0) {
      return;
    }
    staffDialogRef.current?.showModal();
  }, [staffRequest]);

  function openPositionStaff(position: LookupPosition) {
    setStaffPosition(position);
    setStaffRequest((current) => current + 1);
  }

  function startAdd(departmentId: string) {
    setAddingDepartmentId(departmentId);
    setDraftName("");
    setDraftSalary("");
    setEditing(null);
    setError("");
  }

  function addPosition(event: React.FormEvent<HTMLFormElement>, departmentId: string) {
    event.preventDefault();
    const cleaned = normalizeName(draftName);
    if (!cleaned) {
      setError("Enter a position name.");
      return;
    }

    const duplicate = lookups.positions.some(
      (position) => position.departmentId === departmentId && sameName(position.name, cleaned),
    );
    if (duplicate) {
      setError(`${cleaned} already exists in this department.`);
      return;
    }

    const salary = parseDefaultSalary(draftSalary);
    if (salary.error) {
      setError(salary.error);
      return;
    }

    update({
      ...lookups,
      positions: [
        ...lookups.positions,
        {
          id: crypto.randomUUID(),
          departmentId,
          name: cleaned,
          defaultSalary: salary.salary,
        },
      ],
    });
    setDraftName("");
    setDraftSalary("");
    setAddingDepartmentId(null);
    setError("");
  }

  function startEdit(position: LookupPosition) {
    setEditing(position);
    setEditName(position.name);
    setEditDepartmentId(position.departmentId);
    setEditSalary(position.defaultSalary == null ? "" : String(position.defaultSalary));
    setAddingDepartmentId(null);
    setError("");
  }

  function savePosition(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) {
      return;
    }

    const cleaned = normalizeName(editName);
    if (!cleaned) {
      setError("Enter a position name.");
      return;
    }

    const duplicate = lookups.positions.some(
      (position) =>
        position.id !== editing.id &&
        position.departmentId === editDepartmentId &&
        sameName(position.name, cleaned),
    );
    if (duplicate) {
      setError(`${cleaned} already exists in this department.`);
      return;
    }

    const salary = parseDefaultSalary(editSalary);
    if (salary.error) {
      setError(salary.error);
      return;
    }

    update({
      ...lookups,
      positions: lookups.positions.map((position) =>
        position.id === editing.id
          ? {
              ...position,
              departmentId: editDepartmentId,
              name: cleaned,
              defaultSalary: salary.salary,
            }
          : position,
      ),
    });
    setEditing(null);
    setError("");
  }

  function removePosition(id: string) {
    update({
      ...lookups,
      positions: lookups.positions.filter((position) => position.id !== id),
    });
    if (editing?.id === id) {
      setEditing(null);
    }
    setError("");
  }

  if (departments.length === 0) {
    return (
      <div id="directory-panel-positions" role="tabpanel" aria-labelledby="directory-tab-positions">
        <div className="rounded-xl border border-stone-200 bg-white px-4 py-8 text-center">
          <p className="text-sm text-stone-500">Add a department before you create positions.</p>
          <button type="button" className={`${primaryButtonClass} mt-4`} onClick={onAddDepartment}>
            Add a department
          </button>
        </div>
      </div>
    );
  }

  return (
    <div id="directory-panel-positions" role="tabpanel" aria-labelledby="directory-tab-positions" className="space-y-4">
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {departments.map((department) => {
        const positions = lookups.positions.filter(
          (position) => position.departmentId === department.id,
        );
        return (
          <section
            key={department.id}
            className={`overflow-hidden rounded-xl border border-stone-200 bg-white ${rowDragClass(dragId, overId, department.id)}`}
            {...rowDragProps({
              kind: "department",
              id: department.id,
              drag,
              setDragId,
              setOverId,
              accepts: (state) => state.kind === "department",
              onMove: (fromId) => {
                update({
                  ...lookups,
                  departments: moveItem(lookups.departments, fromId, department.id),
                });
              },
            })}
          >
            <div className="flex items-center justify-between gap-3 border-b border-stone-200 bg-stone-50 px-3 py-2">
              <GripIcon />
              <h2 className="min-w-0 flex-1 text-sm font-medium text-stone-950">{department.name}</h2>
              <button
                type="button"
                className="text-xs font-medium text-stone-700 underline-offset-4 hover:text-stone-950 hover:underline"
                onClick={() => startAdd(department.id)}
              >
                Add position
              </button>
            </div>
            {positions.length === 0 && addingDepartmentId !== department.id ? (
              <p className="px-3 py-4 text-sm text-stone-500">No positions in this department yet.</p>
            ) : positions.length > 0 ? (
              <ul className="divide-y divide-stone-100">
                {positions.map((position) =>
                  editing?.id === position.id ? (
                    <li key={position.id} className="px-3 py-3">
                      <PositionForm
                        name={editName}
                        salary={editSalary}
                        departmentId={editDepartmentId}
                        departments={departments}
                        submitLabel="Save"
                        onName={setEditName}
                        onSalary={setEditSalary}
                        onDepartment={setEditDepartmentId}
                        onSubmit={savePosition}
                        onCancel={() => {
                          setEditing(null);
                          setError("");
                        }}
                      />
                    </li>
                  ) : (
                    <li
                      key={position.id}
                      className={`flex items-center gap-3 px-3 py-2 ${rowDragClass(dragId, overId, position.id)}`}
                      {...rowDragProps({
                        kind: "position",
                        id: position.id,
                        drag,
                        setDragId,
                        setOverId,
                        accepts: (state) =>
                          state.kind === "position" &&
                          positions.some((item) => item.id === state.id),
                        onMove: (fromId) => {
                          update({
                            ...lookups,
                            positions: moveWithin(
                              lookups.positions,
                              positions.map((item) => item.id),
                              fromId,
                              position.id,
                            ),
                          });
                        },
                      })}
                    >
                      <GripIcon />
                      <span className="min-w-0 flex-1 text-sm text-stone-950">{position.name}</span>
                      <span className="text-sm text-stone-700 tabular-nums">
                        {position.defaultSalary == null ? "No default" : formatSalary(position.defaultSalary)}
                      </span>
                      <button
                        type="button"
                        className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md px-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-950"
                        aria-label={`View staff assigned to ${position.name}`}
                        onClick={() => openPositionStaff(position)}
                      >
                        <PersonIcon />
                        <span className="text-xs tabular-nums">
                          {employees.filter((employee) => sameName(employee.position, position.name)).length}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-stone-500 hover:bg-stone-100 hover:text-stone-950"
                        aria-label={`Edit ${position.name}`}
                        onClick={() => startEdit(position)}
                      >
                        <PencilIcon />
                      </button>
                      <button
                        type="button"
                        className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-stone-500 hover:bg-stone-100 hover:text-stone-950"
                        aria-label={`Remove ${position.name}`}
                        onClick={() => removePosition(position.id)}
                      >
                        <TrashIcon />
                      </button>
                    </li>
                  ),
                )}
              </ul>
            ) : null}
            {addingDepartmentId === department.id ? (
              <div className="border-t border-stone-100 px-3 py-3">
                <PositionForm
                  name={draftName}
                  salary={draftSalary}
                  departmentId={department.id}
                  departments={departments}
                  submitLabel="Add"
                  lockDepartment
                  onName={setDraftName}
                  onSalary={setDraftSalary}
                  onDepartment={() => undefined}
                  onSubmit={(event) => addPosition(event, department.id)}
                  onCancel={() => {
                    setAddingDepartmentId(null);
                    setError("");
                  }}
                />
              </div>
            ) : null}
          </section>
        );
      })}
      <dialog
        ref={staffDialogRef}
        aria-labelledby="position-staff-title"
        className="m-auto h-fit max-h-[calc(100dvh-2rem)] w-[min(100%-2rem,32rem)] overflow-hidden rounded-2xl border border-stone-200 bg-white p-0 text-stone-950 shadow-xl backdrop:bg-stone-950/40"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            event.currentTarget.close();
          }
        }}
        onClose={() => setStaffPosition(null)}
      >
        <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-stone-200 px-5 py-4">
            <div>
              <h2 id="position-staff-title" className="text-base font-semibold tracking-tight">
                {staffPosition?.name ?? "Position"}
              </h2>
              <p className="mt-1 text-sm text-stone-500">
                {staffTotal === 0
                  ? "Staff assigned to this position, by venue."
                  : `${staffTotal} ${staffTotal === 1 ? "person" : "people"}, by venue.`}
              </p>
            </div>
            <button
              type="button"
              className="flex size-8 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-950"
              aria-label="Close"
              onClick={() => staffDialogRef.current?.close()}
            >
              <CloseIcon />
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {staffByVenue.length === 0 ? (
              <p className="text-sm text-stone-500">No staff are assigned to this position.</p>
            ) : (
              staffByVenue.map((group) => (
                <section key={group.key}>
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-sm font-medium text-stone-950">{group.title}</h3>
                    <span className="text-xs text-stone-500 tabular-nums">{group.people.length}</span>
                  </div>
                  {group.subtitle ? <p className="text-xs text-stone-500">{group.subtitle}</p> : null}
                  <ul className="mt-1.5 divide-y divide-stone-100 rounded-lg border border-stone-200">
                    {group.people.map((person) => (
                      <li key={person.id} className="px-3 py-2 text-sm text-stone-950">
                        {person.fullName}
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
          </div>
        </div>
      </dialog>
    </div>
  );
}

function PositionForm({
  name,
  salary,
  departmentId,
  departments,
  submitLabel,
  lockDepartment = false,
  onName,
  onSalary,
  onDepartment,
  onSubmit,
  onCancel,
}: {
  name: string;
  salary: string;
  departmentId: string;
  departments: LookupDepartment[];
  submitLabel: string;
  lockDepartment?: boolean;
  onName: (value: string) => void;
  onSalary: (value: string) => void;
  onDepartment: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-[1fr_1fr_11rem_auto] sm:items-end">
      <label className="block text-sm font-medium text-stone-800">
        Position
        <input
          value={name}
          onChange={(event) => onName(event.target.value)}
          className={`${fieldClass} mt-1.5`}
          autoFocus
        />
      </label>
      <label className="block text-sm font-medium text-stone-800">
        Default salary
        <input
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={salary}
          onChange={(event) => onSalary(event.target.value)}
          placeholder="Optional"
          className={`${fieldClass} mt-1.5`}
        />
      </label>
      <label className="block text-sm font-medium text-stone-800">
        Department
        <select
          value={departmentId}
          disabled={lockDepartment}
          onChange={(event) => onDepartment(event.target.value)}
          className={`${fieldClass} mt-1.5 disabled:bg-stone-50 disabled:text-stone-500`}
        >
          {departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-2">
        <button type="submit" className={primaryButtonClass}>
          {submitLabel}
        </button>
        <button type="button" className={secondaryButtonClass} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

type RowDrag = {
  kind: string;
  id: string;
};

function moveItem<T extends { id: string }>(items: T[], fromId: string, toId: string) {
  const from = items.findIndex((item) => item.id === fromId);
  const to = items.findIndex((item) => item.id === toId);
  if (from < 0 || to < 0 || from === to) {
    return items;
  }

  const next = items.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

function moveWithin<T extends { id: string }>(
  items: T[],
  groupIds: string[],
  fromId: string,
  toId: string,
) {
  const group = new Set(groupIds);
  const ordered = items.filter((item) => group.has(item.id));
  const nextGroup = moveItem(ordered, fromId, toId);
  if (nextGroup === ordered) {
    return items;
  }

  let index = 0;
  return items.map((item) => {
    if (!group.has(item.id)) {
      return item;
    }

    const next = nextGroup[index];
    index += 1;
    return next;
  });
}

function rowDragClass(dragId: string | null, overId: string | null, id: string) {
  if (dragId === id) {
    return "cursor-grabbing opacity-40";
  }

  if (overId === id && dragId) {
    return "cursor-grab bg-stone-100";
  }

  return "cursor-grab";
}

function rowDragProps({
  kind,
  id,
  drag,
  setDragId,
  setOverId,
  accepts,
  onMove,
}: {
  kind: string;
  id: string;
  drag: { current: RowDrag | null };
  setDragId: (id: string | null) => void;
  setOverId: React.Dispatch<React.SetStateAction<string | null>>;
  accepts: (state: RowDrag) => boolean;
  onMove: (fromId: string) => void;
}) {
  return {
    draggable: true as const,
    onDragStart: (event: React.DragEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("button, input, select, textarea, a")) {
        event.preventDefault();
        return;
      }

      drag.current = { kind, id };
      setDragId(id);
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", id);
      event.stopPropagation();
    },
    onDragOver: (event: React.DragEvent) => {
      if (!drag.current || !accepts(drag.current)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      setOverId((current) => (current === id ? current : id));
    },
    onDrop: (event: React.DragEvent) => {
      const from = drag.current;
      if (!from || !accepts(from)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      drag.current = null;
      setDragId(null);
      setOverId(null);
      if (from.id !== id) {
        onMove(from.id);
      }
    },
    onDragEnd: (event: React.DragEvent) => {
      event.stopPropagation();
      drag.current = null;
      setDragId(null);
      setOverId(null);
    },
  };
}

function groupStaffByVenue(people: StaffEmployee[], locations: LocationReference[]) {
  const buckets = new Map<
    string,
    { key: string; title: string; subtitle: string; people: StaffEmployee[] }
  >();

  for (const person of people) {
    const venue = person.venue.trim();
    const location = venue
      ? locations.find(
          (item) =>
            sameLocationName(item.venueName, venue) || sameLocationName(item.nickname, venue),
        )
      : undefined;
    const key = location?.id ?? (venue ? `venue:${venue.toLowerCase()}` : "none");
    const group = buckets.get(key) ?? {
      key,
      title: location?.venueName || venue || "No venue",
      subtitle: location?.nickname ?? "",
      people: [],
    };
    group.people.push(person);
    buckets.set(key, group);
  }

  const ordered = [];
  for (const location of locations) {
    const group = buckets.get(location.id);
    if (group) {
      ordered.push(group);
      buckets.delete(location.id);
    }
  }

  const rest = [...buckets.values()].sort((left, right) => {
    if (left.key === "none") {
      return 1;
    }
    if (right.key === "none") {
      return -1;
    }
    return left.title.localeCompare(right.title);
  });

  for (const group of [...ordered, ...rest]) {
    group.people.sort((left, right) => left.fullName.localeCompare(right.fullName));
  }

  return [...ordered, ...rest];
}

function PersonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
      <circle cx="8" cy="5" r="2.25" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M3.2 13.2c.7-2.2 2.4-3.3 4.8-3.3s4.1 1.1 4.8 3.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
      <path
        d="M9.8 2.6 13.4 6.2 5.6 14H2v-3.6L9.8 2.6Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M8.4 4 12 7.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
      <path
        d="M3.2 4.4h9.6M6.2 4.3V2.8h3.6v1.5M4.4 4.4l.5 8.4h6.2l.5-8.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M3 3l8 8M11 3 3 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function GripIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      aria-hidden="true"
      className="shrink-0 text-stone-400"
    >
      <path
        fill="currentColor"
        d="M4 2.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm0 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm-1 5.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm6-10a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm-1 5.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm1 3.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"
      />
    </svg>
  );
}

function TabButton({
  id,
  controls,
  selected,
  onClick,
  children,
}: {
  id: string;
  controls: string;
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      id={id}
      type="button"
      role="tab"
      aria-selected={selected}
      aria-controls={controls}
      className={`-mb-px border-b-2 pb-2 text-sm ${
        selected
          ? "border-stone-950 font-medium text-stone-950"
          : "border-transparent text-stone-500 hover:text-stone-950"
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
