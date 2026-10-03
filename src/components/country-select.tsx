"use client";

import { useMemo, useRef, useState } from "react";
import { countryNames } from "@/lib/countries";

/**
 * Searchable country dropdown. Type to filter (e.g. "i" shows every country
 * containing "i"); click to select. Falls back to free text if needed.
 */
export function CountrySelect({
  value,
  onChange,
  required,
  options = countryNames as readonly string[],
  placeholder = "Start typing a country…",
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  options?: readonly string[];
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 60);
    return options.filter((c) => c.toLowerCase().includes(q)).slice(0, 60);
  }, [query, options]);

  const inputClass =
    className ||
    "mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-950 outline-none focus:border-stone-950";

  return (
    <div className="relative">
      <input
        type="text"
        value={open ? query : value}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        className={inputClass}
        onFocus={() => {
          setQuery(value);
          setOpen(true);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          onChange(e.target.value); // keep free-text in sync
        }}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 150);
        }}
      />
      {open && matches.length > 0 ? (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-stone-200 bg-white py-1 shadow-lg">
          {matches.map((c) => (
            <li key={c}>
              <button
                type="button"
                className="flex w-full items-center px-3 py-1.5 text-left text-sm text-stone-800 hover:bg-stone-100"
                onMouseDown={(e) => {
                  // onMouseDown fires before input blur, so selection sticks.
                  e.preventDefault();
                  onChange(c);
                  setQuery(c);
                  setOpen(false);
                  if (blurTimer.current) clearTimeout(blurTimer.current);
                }}
              >
                {c}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
