"use client";

import { useTranslations } from "next-intl";
import { useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { fieldId } from "./form-ids";

/**
 * A form whose server action answers with the error codes («path:ISSUE»,
 * comma separated) or redirects on success. On an error nothing typed is lost:
 * the form is not reset, only the wrong fields turn red with the list on top,
 * and the cursor goes to the first one (Dan, 2026-10-28). The values never
 * travel in the address of the page (rule 8).
 */
const last = (path: string) => path.split(".").pop() ?? path;

export function ActionForm({
  action,
  children,
  className,
  initialErrors,
}: {
  action: (formData: FormData) => Promise<string | undefined>;
  children: ReactNode;
  className?: string;
  /** Codes already in the page (the older `?errore=`), shown the same way. */
  initialErrors?: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [codes, setCodes] = useState(initialErrors ?? "");
  const [pending, startTransition] = useTransition();

  const mark = (next: string) => {
    const root = form.current;
    if (!root) return;
    const wrong = new Set(
      next
        .split(",")
        .filter(Boolean)
        .map((c) => last(c.split(":")[0] ?? "")),
    );
    for (const el of root.querySelectorAll<HTMLElement>("input, select, textarea")) {
      // The API says «residence.postalCode», the form field is «intake.postalCode»:
      // the last part of the name is what they share.
      const name = last(el.getAttribute("name") ?? "");
      if (name && wrong.has(name)) el.setAttribute("aria-invalid", "true");
      else if (el.getAttribute("aria-invalid") === "true") el.removeAttribute("aria-invalid");
    }
    const first = root.querySelector<HTMLElement>("[aria-invalid=true]");
    (first ?? root.querySelector<HTMLElement>("[role=alert]"))?.focus();
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
    startTransition(async () => {
      const result = await action(data);
      const next = typeof result === "string" ? result : "";
      setCodes(next);
      // After React has drawn the summary.
      requestAnimationFrame(() => mark(next));
    });
  };

  return (
    <form
      ref={form}
      onSubmit={submit}
      className={className}
      aria-busy={pending || undefined}
      data-pending={pending || undefined}
    >
      <ClientErrorSummary codes={codes} />
      {children}
    </form>
  );
}

function ClientErrorSummary({ codes }: { codes: string }) {
  const t = useTranslations("errors");
  const items = codes.split(",").filter(Boolean);
  if (items.length === 0) return null;
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
