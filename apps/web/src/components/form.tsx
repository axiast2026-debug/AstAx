import { cn } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

/**
 * Form building blocks of the wizards: every field has a visible label tied
 * to it (fase 2 criterion: keyboard use and labels), and errors are listed at
 * the top with a link to the field.
 */
const INPUT =
  "mt-1 block w-full rounded-lg border border-warm-200 bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-orange-500 aria-[invalid=true]:border-red-600";

export function fieldId(name: string): string {
  return `f-${name.replace(/[^a-zA-Z0-9]/g, "-")}`;
}

export function Field({
  label,
  name,
  hint,
  invalid,
  className,
  ...input
}: {
  label: string;
  name: string;
  hint?: string;
  invalid?: boolean;
} & InputHTMLAttributes<HTMLInputElement>) {
  const id = fieldId(name);
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium text-night-900">
        {label}
      </label>
      <input
        id={id}
        name={name}
        className={INPUT}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={hint ? `${id}-hint` : undefined}
        {...input}
      />
      {hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-warm-600">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function SelectField({
  label,
  name,
  options,
  placeholder,
  invalid,
  className,
  ...select
}: {
  label: string;
  name: string;
  options: { code: string; label: string }[];
  placeholder?: string;
  invalid?: boolean;
} & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = fieldId(name);
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium text-night-900">
        {label}
      </label>
      <select
        id={id}
        name={name}
        className={INPUT}
        aria-invalid={invalid ? true : undefined}
        {...select}
      >
        {placeholder === undefined ? null : <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.code} value={o.code}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function CheckField({
  label,
  name,
  ...input
}: { label: string; name: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = fieldId(`${name}-${String(input.value ?? "")}`);
  return (
    <div className="flex items-start gap-2">
      <input
        id={id}
        name={name}
        type="checkbox"
        className="mt-1 h-4 w-4 accent-orange-500"
        {...input}
      />
      <label htmlFor={id} className="text-sm text-night-900">
        {label}
      </label>
    </div>
  );
}

export function Fieldset({
  legend,
  children,
  className,
}: {
  legend: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={cn("rounded-xl border border-warm-200 bg-white p-4 sm:p-6", className)}>
      <legend className="px-1 text-base font-semibold text-night-900">{legend}</legend>
      <div className="mt-2 grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

/** The codes of the `errore` parameter, as readable messages with a link to the field. */
export async function ErrorSummary({ codes }: { codes: string | undefined }) {
  if (!codes) return null;
  const t = await getTranslations("errors");
  const items = codes.split(",").filter(Boolean);
  const message = (code: string) => {
    const [path = "", issue = code] =
      code.includes(":") && !code.startsWith("EXCLUDED_CASE") ? code.split(/:(.*)/) : ["", code];
    const key = issue.split(":")[0] ?? issue;
    const known = t.has(key) ? t(key, { detail: issue.split(":")[1] ?? "" }) : t("generic");
    return { path, text: known };
  };
  return (
    <div
      role="alert"
      className="mb-6 rounded-xl border border-red-600 bg-red-50 p-4 text-sm"
      tabIndex={-1}
    >
      <p className="font-semibold text-red-700">{t("title")}</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {items.map((code) => {
          const { path, text } = message(code);
          return (
            <li key={code}>
              {path ? (
                <a href={`#${fieldId(path)}`} className="underline">
                  {text}
                </a>
              ) : (
                text
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function hasError(codes: string | undefined, path: string): boolean {
  return (codes ?? "").split(",").some((c) => c.startsWith(`${path}:`));
}

/** Progress of the wizard: the steps, the current one marked for screen readers. */
export async function StepNav({
  steps,
  current,
  base,
  id,
}: {
  steps: readonly string[];
  current: string;
  base: string;
  id: string;
}) {
  const t = await getTranslations("wizard.steps");
  const index = steps.indexOf(current);
  return (
    <nav aria-label={t("label")} className="mb-6">
      <p className="text-sm text-warm-600">
        {t("progress", { n: index + 1, total: steps.length })}
      </p>
      <ol className="mt-2 flex flex-wrap gap-2">
        {steps.map((step, i) => (
          <li key={step}>
            <Link
              href={`${base}/${id}/${step}`}
              aria-current={step === current ? "step" : undefined}
              className={cn(
                "inline-block rounded-full px-3 py-1 text-xs font-medium",
                step === current
                  ? "bg-orange-500 text-night-950"
                  : i < index
                    ? "bg-night-900 text-white"
                    : "bg-warm-100 text-night-900",
              )}
            >
              {t(step)}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
