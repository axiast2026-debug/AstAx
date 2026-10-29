import type { AniaSheet, AniaWarning } from "@astax/shared/domain";
import { formatDate } from "@astax/shared/format";
import { Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import type { AgencyRequest } from "@/lib/agency";

export interface ConfirmedAnia {
  plate: string;
  readAt: string;
  sheet: AniaSheet;
  birthPlace: { name: string; province: string } | null;
  warnings: AniaWarning[];
}

/**
 * Dan, 2026-10-29 (docs/piano-agenzia-filtri-richiesta.md): the Banca Dati
 * ANIA data the back office confirmed, to help the agencies and sub-agents
 * quote, with the fiscal code and the address the customer wrote and the type
 * of quote. Never the customer's name, email or phone before the purchase
 * (the API sends none); no cover expiry. What ANIA did not give is «non
 * disponibile».
 */
export async function AniaConfirmed({
  ania,
  request,
  quoteType,
}: {
  ania: ConfirmedAnia | null;
  request: AgencyRequest;
  quoteType: string | null;
}) {
  const t = await getTranslations("agency.detail.ania");
  const na = t("notAvailable");
  const date = (v: string | null) => (v ? formatDate(v) : na);
  const a = request.holder.address;
  const own: [string, string][] = [
    ["plate", request.plate],
    [request.holder.kind === "PERSON" ? "fiscalCode" : "vatNumber", request.holder.taxCode],
    ["address", `${a.street}, ${a.postalCode} ${a.municipality} (${a.province})`],
    ["quoteType", quoteType ? t(`quoteTypes.${quoteType}`) : na],
  ];
  const s = ania?.sheet;
  const rows: [string, string][] = s
    ? [
        ["vehicle", [s.make, s.model, s.version].filter(Boolean).join(" ") || na],
        ["categoryUse", [s.category, s.use].filter(Boolean).join(" · ") || na],
        ["fuel", s.fuel ?? na],
        ["displacement", s.displacementCc ? `${s.displacementCc} cc` : na],
        ["power", s.maxPowerKw ? `${s.maxPowerKw} kW` : na],
        ...(s.fullLoadWeightKg ? [["weight", `${s.fullLoadWeightKg} kg`] as [string, string]] : []),
        ["firstRegistration", date(s.firstRegistrationDate)],
        ["purchase", date(s.purchaseDate)],
        [
          "birth",
          s.birthDate
            ? [
                formatDate(s.birthDate),
                ania.birthPlace ? `${ania.birthPlace.name} (${ania.birthPlace.province})` : null,
                s.sex,
              ]
                .filter(Boolean)
                .join(" · ")
            : na,
        ],
        [
          "residence",
          [s.residenceMunicipality, s.residenceProvince].filter(Boolean).join(" ") || na,
        ],
        ["cuClass", s.cuClass ?? na],
        ["internalClass", s.internalClass ?? na],
        ["insurer", s.currentInsurer?.name ?? na],
        ["contractExpiry", date(s.contractExpiry)],
        ["claims", t("claimsValue", { main: s.mainClaims ?? na, shared: s.sharedClaims ?? na })],
      ]
    : [];
  return (
    <Card className="flex flex-col gap-3 p-4 md:p-5">
      <CardTitle className="text-body font-bold">{t("title")}</CardTitle>
      <p className="text-table text-warm-700">{t("purpose")}</p>
      {ania ? (
        <p className="text-note text-warm-600">
          {t("intro", { plate: ania.plate, date: formatDate(ania.readAt) })}
        </p>
      ) : (
        <p className="text-note text-warm-600">{t("notRead")}</p>
      )}
      {ania && ania.warnings.length > 0 ? (
        <ul role="note" className="space-y-1 rounded-lg bg-warning-50 p-3 text-table">
          {ania.warnings.map((w) => (
            <li key={w}>{t(`warnings.${w}`)}</li>
          ))}
        </ul>
      ) : null}
      <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-x-4 gap-y-2 text-table">
        {[...own, ...rows].map(([key, value]) => (
          <div key={key} className="contents">
            <dt className="min-w-0 break-words text-warm-600">{t(`fields.${key}`)}</dt>
            <dd className="min-w-0 break-words">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
