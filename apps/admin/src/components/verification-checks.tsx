import {
  QUOTE_TYPES,
  VERIFICATION_STEPS,
  type QuoteType,
  type VerificationChecks as Checks,
  type VerificationStep,
} from "@astax/shared/domain";
import { formatTime } from "@astax/shared/format";
import { Button, cn, Icon } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { clearCheck, confirmCheck, correctCheck } from "@/app/verifiche/actions";

/** «1985-03-12» → «12/03/1985». */
export function italianDate(value: string | null | undefined): string {
  if (!value) return "—";
  const [y, m, d] = value.split("-");
  return y && m && d ? `${d}/${m}/${y}` : value;
}

const INPUT =
  "block min-h-11 w-full rounded-lg border border-warm-600 bg-white px-3 py-2 text-sm focus-visible:border-night-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-night-100";

export interface CheckFacts {
  plate: { declared: string | null; document: string | null };
  birthDate: { declared: string | null; document: string | null };
  quoteType: QuoteType | null;
}

/**
 * Dan, 2026-10-28: the five checks of the operator, in order. A check done
 * shows when, and can be taken back; plate and birth date can be corrected
 * from the documents; the type of quote is confirmed with its feasibility.
 */
export async function VerificationChecks({
  requestId,
  checks,
  facts,
  canDecide,
}: {
  requestId: string;
  checks: Checks;
  facts: CheckFacts;
  canDecide: boolean;
}) {
  const t = await getTranslations("verification.checks");
  const done = VERIFICATION_STEPS.filter((s) => checks[s]).length;
  const hidden = (step: VerificationStep) => (
    <>
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="step" value={step} />
    </>
  );

  const doneRow = (step: VerificationStep, index: number, detail: string) => {
    const check = checks[step];
    if (!check) return null;
    return (
      <li key={step} className="flex items-start gap-3 rounded-xl bg-green-50 p-3">
        <span className="mt-0.5 inline-flex text-green-700">
          <Icon name="checkCircle" size={24} />
        </span>
        <div className="min-w-0 flex-1">
          <strong className="block">
            {t("title", { n: index + 1, name: t(`steps.${step}`) })}
          </strong>
          <span className="text-sm text-warm-700">
            {detail} · {t("doneAt", { time: formatTime(check.at) })}
          </span>
        </div>
        {canDecide ? (
          <form action={clearCheck}>
            {hidden(step)}
            <Button type="submit" variant="outline" size="sm">
              {t("undo")}
            </Button>
          </form>
        ) : null}
      </li>
    );
  };

  const simple = (step: "REGISTRATION" | "IDENTITY", index: number) =>
    doneRow(step, index, t(`doneText.${step}`)) ?? (
      <li key={step} className="rounded-xl border border-warm-200 p-3">
        <strong className="block">{t("title", { n: index + 1, name: t(`steps.${step}`) })}</strong>
        <p className="mt-1 text-sm text-warm-700">{t(`ask.${step}`)}</p>
        {canDecide ? (
          <form action={confirmCheck} className="mt-2">
            {hidden(step)}
            <Button type="submit" size="sm">
              {t("confirm")}
            </Button>
          </form>
        ) : null}
      </li>
    );

  const correctable = (
    step: "PLATE" | "BIRTH_DATE",
    index: number,
    fact: { declared: string | null; document: string | null },
    show: (v: string | null) => string,
  ) => {
    const corrected = checks[step]?.value;
    const row = doneRow(
      step,
      index,
      corrected
        ? t("correctedTo", { value: show(corrected) })
        : t("sameAsDocument", { value: show(fact.declared) }),
    );
    if (row) return row;
    const different = fact.document !== null && fact.declared !== fact.document;
    return (
      <li key={step} className="rounded-xl border border-warm-200 p-3">
        <strong className="block">{t("title", { n: index + 1, name: t(`steps.${step}`) })}</strong>
        <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
          <div>
            <dt className="text-warm-600">{t("declared")}</dt>
            <dd className="font-semibold tabular">{show(fact.declared)}</dd>
          </div>
          <div>
            <dt className="text-warm-600">{t(`onDocument.${step}`)}</dt>
            <dd className={cn("font-semibold tabular", different ? "text-red-700" : "")}>
              {fact.document === null ? t("notRead") : show(fact.document)}
              {different ? ` · ${t("different")}` : ""}
            </dd>
          </div>
        </dl>
        {canDecide ? (
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <form action={confirmCheck}>
              {hidden(step)}
              <Button type="submit" size="sm">
                {t("isCorrect")}
              </Button>
            </form>
            <form action={correctCheck} className="flex flex-wrap items-end gap-2">
              {hidden(step)}
              <label className="text-sm">
                <span className="block text-warm-600">{t(`correctLabel.${step}`)}</span>
                <input
                  name="value"
                  required
                  defaultValue={
                    fact.document === null
                      ? ""
                      : step === "BIRTH_DATE"
                        ? italianDate(fact.document)
                        : fact.document
                  }
                  inputMode={step === "BIRTH_DATE" ? "numeric" : "text"}
                  placeholder={t(`placeholder.${step}`)}
                  className={cn(INPUT, "w-44")}
                />
              </label>
              <Button type="submit" variant="outline" size="sm">
                {t("correct")}
              </Button>
            </form>
          </div>
        ) : null}
      </li>
    );
  };

  const quoteType = () => {
    const confirmed = checks.QUOTE_TYPE?.value;
    const row = confirmed
      ? doneRow("QUOTE_TYPE", 4, `${t(`quoteTypes.${confirmed}`)} · ${t("feasible")}`)
      : null;
    if (row) return row;
    return (
      <li key="QUOTE_TYPE" className="rounded-xl border border-warm-200 p-3">
        <strong className="block">{t("title", { n: 5, name: t("steps.QUOTE_TYPE") })}</strong>
        {canDecide ? (
          <form action={confirmCheck} className="mt-2 space-y-2">
            {hidden("QUOTE_TYPE")}
            <label className="block text-sm">
              <span className="text-warm-600">{t("quoteTypeLabel")}</span>
              <select
                name="quoteType"
                required
                defaultValue={facts.quoteType ?? ""}
                className={cn(INPUT, "mt-1")}
              >
                <option value="" disabled>
                  {t("choose")}
                </option>
                {QUOTE_TYPES.map((q) => (
                  <option key={q} value={q}>
                    {t(`quoteTypes.${q}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                name="feasible"
                value="1"
                required
                className="size-5 accent-night-900"
              />
              {t("feasibleLabel")}
            </label>
            <Button type="submit" size="sm">
              {t("confirmQuoteType")}
            </Button>
          </form>
        ) : (
          <p className="mt-1 text-sm text-warm-700">
            {facts.quoteType ? t(`quoteTypes.${facts.quoteType}`) : "—"}
          </p>
        )}
      </li>
    );
  };

  return (
    <section id="verifiche" aria-labelledby="checks-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="checks-title" className="font-display text-xl font-extrabold">
          {t("heading")}
        </h2>
        <span
          className={cn("text-sm font-semibold", done === 5 ? "text-green-700" : "text-warm-700")}
        >
          {t("count", { done })}
        </span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-warm-200" aria-hidden="true">
        <div className="h-2 rounded-full bg-green-700" style={{ width: `${(done / 5) * 100}%` }} />
      </div>
      <ol className="mt-4 space-y-3">
        {simple("REGISTRATION", 0)}
        {simple("IDENTITY", 1)}
        {correctable("PLATE", 2, facts.plate, (v) => v ?? "—")}
        {correctable("BIRTH_DATE", 3, facts.birthDate, italianDate)}
        {quoteType()}
      </ol>
    </section>
  );
}
