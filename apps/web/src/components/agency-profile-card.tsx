import { formatDate } from "@astax/shared/format";
import { Badge, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { api } from "@/lib/auth";

interface AgencyProfile {
  legalName: string;
  vatNumber: string | null;
  ruiNumber: string | null;
  ruiSection: string | null;
  pec: string | null;
  address: { street: string; postalCode: string; municipality: string; province: string } | null;
  iban: string | null;
  status: string;
  profInsuranceExpiresOn: string | null;
  mandates: { company: string; verified: boolean }[];
  activeMembers: number;
}

/**
 * «Profilo» of the agency (Dan, 2026-10-21, docs/piano-agenzie.md D): the
 * agency's data on top of the personal ones; the IBAN only masked.
 */
export async function AgencyProfileCard() {
  const t = await getTranslations("profile.agency");
  const { status, body: p } = await api<AgencyProfile>("/agency/profile");
  if (status !== 200) return null;
  const rows: [string, string][] = [
    [
      t("rui"),
      [p.ruiNumber, p.ruiSection ? t("section", { section: p.ruiSection }) : null]
        .filter(Boolean)
        .join(" · "),
    ],
    [t("vatNumber"), p.vatNumber ?? ""],
    [t("pec"), p.pec ?? ""],
    [
      t("address"),
      p.address
        ? `${p.address.street}, ${p.address.postalCode} ${p.address.municipality} (${p.address.province})`
        : "",
    ],
    [t("iban"), p.iban ?? ""],
    [
      t("profInsurance"),
      p.profInsuranceExpiresOn
        ? t("validUntil", { date: formatDate(p.profInsuranceExpiresOn) })
        : "",
    ],
    [t("team"), t("members", { count: p.activeMembers })],
  ];
  return (
    <Card>
      <CardTitle>{p.legalName}</CardTitle>
      <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[12rem_1fr]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-warm-600">{label}</dt>
            <dd>{value || "—"}</dd>
          </div>
        ))}
      </dl>
      <h3 className="mt-4 text-sm font-semibold">{t("mandates")}</h3>
      <ul className="mt-2 flex flex-wrap gap-2 text-sm">
        {p.mandates.map((m) => (
          <li key={m.company}>
            <Badge tone={m.verified ? "success" : "warning"}>
              {m.company}
              {m.verified ? "" : ` · ${t("toVerify")}`}
            </Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}
