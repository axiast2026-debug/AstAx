"use client";

import { parseItalianDate } from "@astax/shared/domain";
import { useTranslations } from "next-intl";
import { useState, type ChangeEvent } from "react";
import { fieldId } from "../form-ids";
import { INPUT_CLASS } from "./field-style";

/** «1985-03-12» → «12/03/1985». */
function shown(value: string | undefined): string {
  if (!value) return "";
  const [y, m, d] = value.split("-");
  return y && m && d ? `${d}/${m}/${y}` : value;
}

/**
 * Dan, 2026-10-28: a date in the format «gg/mm/aaaa» that can also be pasted
 * («12/03/1985», «12-03-1985», «12031985»…). The browser's calendar did not
 * take a paste. The slashes come by themselves while typing; on leaving the
 * field a pasted date takes the same shape. The server reads it again.
 */
export function DateField({
  label,
  name,
  defaultValue,
  hint,
  invalid,
  required,
  autoComplete,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  hint?: string;
  invalid?: boolean;
  required?: boolean;
  autoComplete?: string;
}) {
  const t = useTranslations("wizard.intake");
  const id = fieldId(name);
  const [value, setValue] = useState(shown(defaultValue));

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value;
    const typing = (event.nativeEvent as InputEvent).inputType?.startsWith("insert") ?? false;
    const digits = next.replace(/\D/g, "");
    // Only while typing digits one by one: a paste is left as it is until blur.
    if (typing && /^[\d/]*$/.test(next) && next.length > value.length && digits.length <= 8) {
      const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean);
      setValue(parts.join("/") + (digits.length === 2 || digits.length === 4 ? "/" : ""));
      return;
    }
    setValue(next);
  };

  return (
    <div>
      <label htmlFor={id} className="block text-label font-semibold text-night-900">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        placeholder={t("dateFormat")}
        maxLength={10}
        autoComplete={autoComplete ?? "off"}
        className={INPUT_CLASS}
        value={value}
        onChange={onChange}
        onBlur={() => {
          const parsed = parseItalianDate(value);
          if (parsed) setValue(shown(parsed));
        }}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={`${id}-hint`}
        required={required}
      />
      <p id={`${id}-hint`} className="mt-1 text-note text-warm-600">
        {hint ?? t("dateFormatHint")}
      </p>
    </div>
  );
}
