import type { QuoteData } from "@astax/shared/domain";
import { formatTime } from "@astax/shared/format";
import { Button, cn } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { applyAnia, readAnia } from "@/app/verifiche/actions";
import type { AniaView } from "@/lib/verification";
import { italianDate } from "./verification-checks";

interface Row {
  key: string;
  ania: string | null;
  request: string | null;
  /** «dal codice fiscale» instead of «da ANIA». */
  fromCode?: boolean;
  /** What is compared, when it is not the whole text (ANIA, request). */
  compare?: [string | null, string | null];
}

/**
 * Dan, 2026-10-28: the data the agencies quote on, read from ANIA by plate,
 * next to what the request says; a difference is marked. Never the
 * customer's contacts (rule 2): ANIA has none, the sheet shows none.
 */
export async function AgencySheet({
  requestId,
  ania,
  quoteData,
  canDecide,
}: {
  requestId: string;
  ania: AniaView | null;
  quoteData: QuoteData | null;
  canDecide: boolean;
}) {
  const t = await getTranslations("verification.ania");
  const s = ania?.sheet;
  const owner = quoteData
    ? quoteData.vehicleOwner === "SAME_AS_POLICY_HOLDER"
      ? quoteData.policyHolder
      : quoteData.vehicleOwner
    : null;
  const person = owner?.kind === "PERSON" ? owner : null;
  const join = (...parts: (string | number | null | undefined)[]) =>
    parts.filter((p) => p !== null && p !== undefined && p !== "").join(" · ") || null;
  const groups: { legend: string; rows: Row[] }[] = [
    {
      legend: t("groups.vehicle"),
      rows: [
        {
          key: "make",
          ania: s ? join(s.make, s.model, s.version) : null,
          request: quoteData ? join(quoteData.vehicle.make, quoteData.vehicle.model) : null,
        },
        { key: "categoryUse", ania: s ? join(s.category, s.use) : null, request: null },
        {
          key: "engine",
          ania: s
            ? join(
                s.fuel,
                s.displacementCc ? `${s.displacementCc} cc` : null,
                s.maxPowerKw ? `${s.maxPowerKw} kW` : null,
              )
            : null,
          request: quoteData
            ? join(
                quoteData.vehicle.displacementCc ? `${quoteData.vehicle.displacementCc} cc` : null,
                `${quoteData.vehicle.powerKw} kW`,
              )
            : null,
        },
        ...(s?.fullLoadWeightKg
          ? [{ key: "weight", ania: `${s.fullLoadWeightKg} kg`, request: null }]
          : []),
        {
          key: "firstRegistration",
          ania: s?.firstRegistrationDate ? italianDate(s.firstRegistrationDate) : null,
          request: quoteData ? italianDate(quoteData.vehicle.firstRegistrationDate) : null,
        },
        {
          key: "purchase",
          ania: s?.purchaseDate ? italianDate(s.purchaseDate) : null,
          request: quoteData ? italianDate(quoteData.vehicle.purchaseDate) : null,
        },
      ],
    },
    {
      legend: t("groups.owner"),
      rows: [
        {
          key: "name",
          ania: s ? [s.surname, s.givenName].filter(Boolean).join(" ") || s.fullName : null,
          request: person ? `${person.surname} ${person.givenName}`.toUpperCase() : null,
        },
        {
          key: "fiscalCode",
          ania: s?.ownerFiscalCode ?? null,
          request: person?.fiscalCode ?? null,
        },
        {
          key: "birth",
          fromCode: true,
          ania: s?.birthDate
            ? join(
                italianDate(s.birthDate),
                ania?.birthPlace
                  ? `${ania.birthPlace.name} (${ania.birthPlace.province})`
                  : s.bornAbroad
                    ? t("abroad")
                    : null,
                s.sex,
              )
            : null,
          request: person ? join(italianDate(person.birthDate), person.sex) : null,
          compare: [
            s?.birthDate ? `${s.birthDate}${s.sex ?? ""}` : null,
            person ? `${person.birthDate}${person.sex}` : null,
          ],
        },
        {
          key: "residence",
          ania: s ? join(s.residenceMunicipality, s.residenceProvince) : null,
          request: person ? person.residence.province : null,
        },
      ],
    },
    {
      legend: t("groups.history"),
      rows: [
        {
          key: "cuClass",
          ania: s?.cuClass ?? null,
          request: quoteData?.history.cuClass?.toString() ?? null,
        },
        {
          key: "insurer",
          ania: s?.currentInsurer?.name ?? null,
          request: quoteData?.history.currentInsurer?.toUpperCase() ?? null,
        },
        {
          key: "expiry",
          ania: s ? join(italianDate(s.coverExpiry), italianDate(s.contractExpiry)) : null,
          request: quoteData?.history.currentExpiryDate
            ? italianDate(quoteData.history.currentExpiryDate)
            : null,
        },
        {
          key: "claims",
          ania: s
            ? t("claimsValue", {
                main: s.mainClaims ?? "N.D.",
                shared: s.sharedClaims ?? "N.D.",
              })
            : null,
          request: null,
        },
      ],
    },
  ];
  // Only what both sides say can differ, letters and digits only; the
  // residence is compared by province.
  const plain = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const differs = (r: Row) => {
    const [a, b] = r.compare ?? [r.ania, r.request];
    return a !== null && b !== null && !plain(a).includes(plain(b)) && !plain(b).includes(plain(a));
  };

  return (
    <section
      id="scheda"
      aria-labelledby="sheet-title"
      className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-warm-200"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="sheet-title" className="font-display text-xl font-extrabold">
            {t("heading")}
          </h2>
          <p className="text-sm text-warm-600">{t("intro")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {ania ? (
            <span className="text-sm text-warm-700">
              {t("readAt", { time: formatTime(ania.readAt), plate: ania.plate })}
            </span>
          ) : null}
          {canDecide ? (
            <form action={readAnia}>
              <input type="hidden" name="requestId" value={requestId} />
              <Button type="submit" variant={ania ? "outline" : "primary"} size="sm">
                {ania ? t("readAgain") : t("read")}
              </Button>
            </form>
          ) : null}
        </div>
      </div>
      {ania && ania.warnings.length > 0 ? (
        <ul role="note" className="mt-3 space-y-1 rounded-lg bg-warning-50 p-3 text-sm">
          {ania.warnings.map((w) => (
            <li key={w}>
              <strong>{t("toCheck")}</strong> {t(`warnings.${w}`)}
            </li>
          ))}
        </ul>
      ) : null}
      {!ania ? <p className="mt-3 text-sm text-warm-700">{t("notRead")}</p> : null}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {groups.map((g) => (
          <fieldset key={g.legend} className="rounded-xl border border-warm-200 p-3">
            <legend className="px-1 text-sm font-semibold">{g.legend}</legend>
            <dl className="space-y-3 text-sm">
              {g.rows.map((r) => (
                <div key={r.key} className={cn(differs(r) ? "rounded-lg bg-red-50 p-2" : "")}>
                  <dt className="text-warm-600">
                    {t(`fields.${r.key}`)}{" "}
                    {r.ania !== null ? (
                      <span className="text-xs text-night-700">
                        {r.fromCode ? t("fromFiscalCode") : t("fromAnia")}
                      </span>
                    ) : null}
                  </dt>
                  <dd className="font-semibold tabular">{r.ania ?? r.request ?? "—"}</dd>
                  {differs(r) ? (
                    <dd className="text-xs font-semibold text-red-700">
                      {t("inRequest", { value: r.request ?? "" })}
                    </dd>
                  ) : null}
                </div>
              ))}
            </dl>
          </fieldset>
        ))}
      </div>
      {ania && quoteData && canDecide ? (
        <form action={applyAnia} className="mt-4">
          <input type="hidden" name="requestId" value={requestId} />
          <Button type="submit" variant="outline" size="sm">
            {t("apply")}
          </Button>
          <p className="mt-1 text-xs text-warm-600">{t("applyHelp")}</p>
        </form>
      ) : null}
    </section>
  );
}
