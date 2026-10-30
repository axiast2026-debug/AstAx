"use client";

import { CompanyLogo } from "@astax/ui";
import { useState } from "react";

/**
 * The company of the offer among the agency's mandates (OFF-04), with the
 * logo of the chosen one next to it (ADR 0028).
 */
export function CompanySelect({
  companies,
  defaultValue,
  chooseLabel,
  className,
  invalid,
}: {
  companies: { id: string; name: string }[];
  defaultValue: string;
  chooseLabel: string;
  className: string;
  invalid: boolean;
}) {
  const [value, setValue] = useState(defaultValue);
  const chosen = companies.find((c) => c.id === value);
  return (
    <div className="flex items-center gap-3">
      <select
        id="f-companyId"
        name="companyId"
        required
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className={className}
        aria-invalid={invalid || undefined}
      >
        <option value="">{chooseLabel}</option>
        {companies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {chosen ? <CompanyLogo companyId={chosen.id} name={chosen.name} size="detail" /> : null}
    </div>
  );
}
