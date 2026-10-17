import { formatEuroCents } from "@astax/shared/format";
import { Button, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { fakePay } from "@/app/acceptance-actions";
import { ErrorSummary, Field } from "@/components/form";
import { publicApi } from "@/lib/public-api";

interface Checkout {
  amounts: { premiumCents: number; feeCents: number };
  methods: ("CARD" | "INSTANT_TRANSFER")[];
}

/**
 * The fake payments provider's page (rule 9, proposal B of phase 5): card or
 * instant transfer, premium and fee apart (PAG-01). Never in production.
 */
export default async function FakePaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ ref: string }>;
  searchParams: Promise<{ errore?: string }>;
}) {
  const { ref } = await params;
  if (!/^[a-z]+-[0-9a-f-]{36,80}$/.test(ref)) notFound();
  const query = await searchParams;
  const t = await getTranslations("fakePayment");
  const { status, body } = await publicApi<Checkout>(`/fake-providers/payments/${ref}`);
  if (status !== 200) notFound();
  const { premiumCents, feeCents } = body.amounts;
  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="mt-2 text-sm text-warm-600">{t("intro")}</p>
      <div className="mt-6">
        <ErrorSummary codes={query.errore} />
      </div>
      <Card className="mt-6">
        <dl className="grid grid-cols-[10rem_1fr] gap-y-1 text-sm">
          <dt className="text-warm-600">{t("premium")}</dt>
          <dd className="tabular">{formatEuroCents(premiumCents)}</dd>
          <dt className="text-warm-600">{t("fee")}</dt>
          <dd className="tabular">{formatEuroCents(feeCents)}</dd>
          <dt className="font-semibold">{t("total")}</dt>
          <dd className="font-semibold tabular">{formatEuroCents(premiumCents + feeCents)}</dd>
        </dl>
      </Card>
      {body.methods.includes("CARD") ? (
        <Card className="mt-6">
          <CardTitle>{t("card")}</CardTitle>
          <form action={fakePay} className="mt-3 space-y-3">
            <input type="hidden" name="ref" value={ref} />
            <input type="hidden" name="method" value="CARD" />
            <Field
              label={t("cardNumber")}
              name="cardNumber"
              inputMode="numeric"
              autoComplete="off"
              pattern="[\d ]{12,23}"
              required
            />
            <Button type="submit">{t("payCard")}</Button>
          </form>
        </Card>
      ) : null}
      {body.methods.includes("INSTANT_TRANSFER") ? (
        <Card className="mt-6">
          <CardTitle>{t("transfer")}</CardTitle>
          <form action={fakePay} className="mt-3 space-y-3">
            <input type="hidden" name="ref" value={ref} />
            <input type="hidden" name="method" value="INSTANT_TRANSFER" />
            <p className="text-sm">{t("transferText")}</p>
            <Button type="submit" variant="outline">
              {t("payTransfer")}
            </Button>
          </form>
        </Card>
      ) : null}
    </main>
  );
}
