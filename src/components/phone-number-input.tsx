"use client";

import { useState } from "react";
import { countryDialList, type CountryDial } from "@/lib/countries";

const PINNED = ["AE", "IN", "NP", "LK", "PH", "PK", "UG", "EG", "GB"];

const DIAL_LIST: CountryDial[] = (() => {
  const all = countryDialList().filter((c) => c.dial);
  const pinned = PINNED.map((iso) => all.find((c) => c.iso === iso)).filter((c): c is CountryDial => Boolean(c));
  return [...pinned, ...all.filter((c) => !PINNED.includes(c.iso))];
})();

function splitPhone(value: string): { iso: string; local: string } {
  const trimmed = value.trim();
  const match = DIAL_LIST.filter((c) => trimmed.startsWith(c.dial)).sort((a, b) => b.dial.length - a.dial.length)[0];
  return match ? { iso: match.iso, local: trimmed.slice(match.dial.length).trim() } : { iso: "AE", local: trimmed };
}

/** Country-code picker plus number. Emits the full value, e.g. "+971 50 123 4567"; defaults to UAE. */
export function PhoneNumberInput({
  value,
  onChange,
  label,
  className = "",
}: {
  value: string;
  onChange: (full: string) => void;
  label: string;
  className?: string;
}) {
  const [iso, setIso] = useState(() => splitPhone(value).iso);
  const local = value ? splitPhone(value).local : "";
  const dialFor = (code: string) => DIAL_LIST.find((c) => c.iso === code)?.dial ?? "+971";
  const emit = (code: string, number: string) => onChange(number.trim() ? `${dialFor(code)} ${number.trim()}` : "");

  return (
    <div className={`flex gap-2 ${className}`}>
      <select
        aria-label={`${label} country code`}
        value={iso}
        onChange={(event) => {
          setIso(event.target.value);
          emit(event.target.value, local);
        }}
        className="w-28 shrink-0 rounded-lg border border-stone-300 bg-white px-2 py-2 text-sm text-stone-950 outline-none focus:border-stone-950"
      >
        {DIAL_LIST.map((c) => (
          <option key={c.iso} value={c.iso}>
            {c.flag} {c.dial}
          </option>
        ))}
      </select>
      <input
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        aria-label={label}
        value={local}
        placeholder="50 123 4567"
        onChange={(event) => emit(iso, event.target.value)}
        className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-950 outline-none focus:border-stone-950"
      />
    </div>
  );
}
