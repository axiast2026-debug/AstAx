import { cn } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { fieldId } from "./form-ids";

/**
 * Form building blocks of the wizards: every field has a visible label tied
 * to it (fase 2 criterion: keyboard use and labels), and errors are listed at
 * the top with a link to the field.
 */
// Design system, «Campi»: 48 px, a 3:1 border; focus night blue with a halo; errors in red.
export const INPUT =
  "mt-1 block min-h-12 w-full rounded-lg border border-warm-600 bg-white px-3 py-2 text-base focus-visible:border-night-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-night-100 aria-[invalid=true]:border-2 aria-[invalid=true]:border-red-600";

export { fieldId };

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
      <label htmlFor={id} className="block text-label font-semibold text-night-900">
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
        <p id={`${id}-hint`} className="mt-1 text-note text-warm-600">
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
      <label htmlFor={id} className="block text-label font-semibold text-night-900">
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
    <div className="flex min-h-11 items-start gap-3">
      <input
        id={id}
        name={name}
        type="checkbox"
        className="mt-0.5 size-5 shrink-0 accent-night-900"
        {...input}
      />
      <label htmlFor={id} className="text-body text-night-900">
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

/**
 * Progress of the wizard (design system, StepProgress): «Passaggio 2 di 5» and
 * one bar per step on the phone, the list of the steps on a wide screen; done
 * in night blue, the current one orange, the rest grey. Each step is a link.
 */
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
      <p className="text-label font-semibold text-warm-600 lg:hidden">
        {t("progress", { n: index + 1, total: steps.length })} · {t(current)}
      </p>
      <ol
        className="mt-1 grid gap-1 lg:mt-0 lg:flex lg:flex-wrap lg:gap-2"
        style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
      >
        {steps.map((step, i) => (
          <li key={step}>
            <Link
              href={`${base}/${id}/${step}`}
              aria-current={step === current ? "step" : undefined}
              className="group flex min-h-11 items-center gap-3 lg:rounded-lg lg:px-3 lg:hover:bg-warm-100"
            >
              <span
                aria-hidden
                className={cn(
                  "h-1 w-full rounded-full lg:hidden",
                  step === current ? "bg-orange-500" : i < index ? "bg-night-900" : "bg-warm-200",
                )}
              />
              <span
                aria-hidden
                className={cn(
                  "hidden size-7 shrink-0 items-center justify-center rounded-full text-note font-bold lg:inline-flex",
                  step === current
                    ? "bg-orange-500 text-night-900"
                    : i < index
                      ? "bg-night-900 text-white"
                      : "bg-warm-100 text-warm-600",
                )}
              >
                {i + 1}
              </span>
              <span
                className={cn(
                  "sr-only lg:not-sr-only lg:text-label",
                  step === current ? "lg:font-bold" : "lg:font-medium",
                )}
              >
                {t(step)}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
