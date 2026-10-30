import { formatDateTime, formatEuroCents } from "@astax/shared/format";
import { can, type Actor } from "@astax/shared/permissions";
import { Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { api } from "@/lib/auth";
import { Info } from "@/components/info";

interface Overview {
  deserted: { id: string; code: string; channel: string; since: string }[];
  reconfirmations: { id: string; code: string; channel: string; round: number; closesAt: string }[];
}

interface Withdrawal {
  id: string;
  code: string;
  policyNumber: string;
  premiumCents: number;
  requestedAt: string;
  refundableCents: number | null;
  status: string;
}

/**
 * Spec 06 «Eccezioni», beside the missed issuances: deserted requests (the
 * automatic reopening of ASTA-08 is over), reconfirmations in progress with
 * their closing (GAR-07), withdrawals and their refunds (PAG-04).
 */
export async function OtherExceptions({ actor }: { actor: Actor }) {
  const t = await getTranslations("otherExceptions");
  const [overview, withdrawals] = await Promise.all([
    api<Overview>("/back-office/exceptions"),
    can(actor, "withdrawal.manage")
      ? api<Withdrawal[]>("/back-office/withdrawals")
      : Promise.resolve(null),
  ]);
  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-2">
      {overview.status === 200 ? (
        <>
          <Card>
            <CardTitle>
              {t("deserted")}
              <Info>{t("desertedHint")}</Info>
            </CardTitle>
            {overview.body.deserted.length === 0 ? (
              <p className="mt-2 text-sm">{t("none")}</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {overview.body.deserted.map((d) => (
                  <li key={d.id}>
                    {d.code} · {t(`channels.${d.channel}`)} ·{" "}
                    {t("since", { at: formatDateTime(d.since) })}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardTitle>{t("reconfirmations")}</CardTitle>
            {overview.body.reconfirmations.length === 0 ? (
              <p className="mt-2 text-sm">{t("none")}</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {overview.body.reconfirmations.map((r) => (
                  <li key={`${r.id}-${r.round}`}>
                    {r.code} · {t(`channels.${r.channel}`)} ·{" "}
                    {t("closesAt", { at: formatDateTime(r.closesAt) })}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      ) : null}
      {withdrawals?.status === 200 ? (
        <Card className="lg:col-span-2">
          <CardTitle>{t("withdrawals")}</CardTitle>
          {withdrawals.body.length === 0 ? (
            <p className="mt-2 text-sm">{t("none")}</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {withdrawals.body.map((w) => (
                <li key={w.id}>
                  {w.code} · {w.policyNumber} · {formatDateTime(w.requestedAt)} ·{" "}
                  {t(`withdrawalStatus.${w.status}`)}
                  {w.refundableCents === null
                    ? ""
                    : ` · ${t("refundable", { amount: formatEuroCents(w.refundableCents) })}`}
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}
    </div>
  );
}
