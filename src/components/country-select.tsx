"use client";

import { useMemo, useRef, useState } from "react";
import { countryNames } from "@/lib/countries";

/**
 * Searchable country dropdown. Typing only filters the list. The field keeps a
 * value when it is one of the suggestions.
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
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 60);
    return options.filter((c) => c.toLowerCase().includes(q)).slice(0, 60);
  }, [query, options]);

  function choose(name: string) {
    onChange(name);
    setQuery(name);
    setOpen(false);
    inputRef.current?.setCustomValidity("");
  }

  function commitQuery() {
    const typed = query.trim().toLowerCase();
    const exact = options.find((c) => c.toLowerCase() === typed);
    const only = typed && matches.length === 1 ? matches[0] : undefined;
    if (exact) choose(exact);
    else if (only) choose(only);
    else setQuery(value);
    inputRef.current?.setCustomValidity("");
    setOpen(false);
  }

  const inputClass =
    className ||
    "mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-950 outline-none focus:border-stone-950";

  return (
    <div className="relative">
      <input
        ref={inputRef}
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
          const next = e.target.value;
          setQuery(next);
          setOpen(true);
          const typed = next.trim().toLowerCase();
          const list = typed ? options.filter((c) => c.toLowerCase().includes(typed)) : [];
          const allowed = typed === "" || list.length === 1 || options.some((c) => c.toLowerCase() === typed);
          e.target.setCustomValidity(allowed ? "" : "Choose a country from the list");
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const typed = e.currentTarget.value.trim().toLowerCase();
            const list = typed ? options.filter((c) => c.toLowerCase().includes(typed)) : [];
            if (list.length === 1) {
              e.preventDefault();
              choose(list[0]);
            } else if (list.length > 1) e.preventDefault();
          }
          if (e.key === "Escape") {
            setQuery(value);
            setOpen(false);
          }
        }}
        onBlur={commitQuery}
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
                  choose(c);
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
