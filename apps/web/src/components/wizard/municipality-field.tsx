"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { MunicipalitySuggestion } from "@/app/riferimenti/comuni/route";
import { fieldId } from "../form-ids";
import { INPUT_CLASS } from "./field-style";

export interface MunicipalityTexts {
  municipality: string;
  municipalityHint: string;
  postalCode: string;
  postalCodeChoose: string;
  postalCodePlaceholder: string;
  postalCodeFree: string;
  province: string;
  noResults: string;
}

/**
 * Dan, 2026-10-28: the «Comune» field suggests the ISTAT municipalities while
 * typing (from 2 letters) and one must be chosen from the list; then the
 * province fills by itself, the CAP too when the municipality has one, a list
 * of its CAPs when it has more, a free field when the data has none.
 * The form sends the ISTAT code (`intake.municipalityIstat`), not the name.
 */
export function MunicipalityField({
  initial,
  initialPostalCode,
  texts,
  invalid,
  postalCodeInvalid,
  prefix = "intake",
  source = "/riferimenti/comuni",
}: {
  initial: MunicipalitySuggestion | null;
  initialPostalCode?: string;
  texts: MunicipalityTexts;
  invalid?: boolean;
  postalCodeInvalid?: boolean;
  /** The first part of the field names («intake» in the request, «address» at the entry). */
  prefix?: string;
  /** Where the suggestions come from: the entry has no account (Dan, 2026-10-29). */
  source?: string;
}) {
  const listId = useId();
  const nameId = fieldId(`${prefix}.municipality`);
  const capId = fieldId(`${prefix}.postalCode`);
  const [query, setQuery] = useState(initial?.name ?? "");
  const [chosen, setChosen] = useState<MunicipalitySuggestion | null>(initial);
  const [options, setOptions] = useState<MunicipalitySuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [cap, setCap] = useState(initialPostalCode ?? "");
  const request = useRef(0);

  useEffect(() => {
    if (chosen && query === chosen.name) return;
    const q = query.trim();
    if (q.length < 2) {
      setOptions([]);
      return;
    }
    const mine = ++request.current;
    const timer = setTimeout(async () => {
      const response = await fetch(`${source}?q=${encodeURIComponent(q)}`);
      const list = response.ok ? ((await response.json()) as MunicipalitySuggestion[]) : [];
      if (mine !== request.current) return;
      setOptions(list);
      setActive(list.length > 0 ? 0 : -1);
      setOpen(true);
    }, 150);
    return () => clearTimeout(timer);
  }, [query, chosen, source]);

  const choose = (m: MunicipalitySuggestion) => {
    setChosen(m);
    setQuery(m.name);
    setOpen(false);
    setCap(m.postalCodes.length === 1 ? (m.postalCodes[0] ?? "") : "");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!open || options.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (i + 1) % options.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (i <= 0 ? options.length - 1 : i - 1));
    } else if (event.key === "Enter" && active >= 0) {
      event.preventDefault();
      const m = options[active];
      if (m) choose(m);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  const caps = chosen?.postalCodes ?? [];
  return (
    <>
      <div className="relative">
        <label htmlFor={nameId} className="block text-label font-semibold text-night-900">
          {texts.municipality}
        </label>
        <input
          id={nameId}
          name={`${prefix}.municipality`}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
          aria-describedby={`${nameId}-hint`}
          aria-invalid={invalid ? true : undefined}
          className={INPUT_CLASS}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (chosen && e.target.value !== chosen.name) setChosen(null);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onFocus={() => options.length > 0 && !chosen && setOpen(true)}
          required
        />
        <input type="hidden" name={`${prefix}.municipalityIstat`} value={chosen?.istatCode ?? ""} />
        <p id={`${nameId}-hint`} className="mt-1 text-note text-warm-600">
          {texts.municipalityHint}
        </p>
        {open ? (
          <ul
            id={listId}
            role="listbox"
            className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg bg-white py-1 shadow-lg ring-1 ring-warm-200"
          >
            {options.length === 0 ? (
              <li className="px-3 py-2 text-table text-warm-600">{texts.noResults}</li>
            ) : (
              options.map((m, i) => (
                <li
                  key={m.istatCode}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  className={`min-h-11 cursor-pointer px-3 py-2 text-base ${
                    i === active ? "bg-night-100" : ""
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(m);
                  }}
                >
                  {m.name} <span className="text-warm-600">({m.province})</span>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>

      <div>
        <label htmlFor={capId} className="block text-label font-semibold text-night-900">
          {texts.postalCode}
        </label>
        {caps.length > 1 ? (
          <select
            id={capId}
            name={`${prefix}.postalCode`}
            className={INPUT_CLASS}
            value={cap}
            onChange={(e) => setCap(e.target.value)}
            aria-invalid={postalCodeInvalid ? true : undefined}
            aria-describedby={`${capId}-hint`}
            required
          >
            <option value="">{texts.postalCodePlaceholder}</option>
            {caps.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={capId}
            name={`${prefix}.postalCode`}
            type="text"
            inputMode="numeric"
            autoComplete="postal-code"
            pattern="\d{5}"
            maxLength={5}
            className={INPUT_CLASS}
            value={cap}
            readOnly={caps.length === 1}
            onChange={(e) => setCap(e.target.value.replace(/\D/g, ""))}
            aria-invalid={postalCodeInvalid ? true : undefined}
            aria-describedby={`${capId}-hint`}
            required
          />
        )}
        <p id={`${capId}-hint`} className="mt-1 text-note text-warm-600">
          {caps.length > 1
            ? texts.postalCodeChoose
            : caps.length === 0 && chosen
              ? texts.postalCodeFree
              : ""}
        </p>
      </div>

      <div>
        <label
          htmlFor={fieldId(`${prefix}.province`)}
          className="block text-label font-semibold text-night-900"
        >
          {texts.province}
        </label>
        <input
          id={fieldId(`${prefix}.province`)}
          name={`${prefix}.province`}
          type="text"
          className={INPUT_CLASS}
          value={chosen?.province ?? ""}
          readOnly
          tabIndex={-1}
        />
      </div>
    </>
  );
}
