import { Button, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { confirmOfferIban, sendOfferIbanCode } from "@/app/agency-actions";
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/form";

/**
 * Dan, 2026-10-29 (docs/piano-agenzia-filtri-richiesta.md): the agency's IBAN
 * is asked only at its first offer, to whoever sends it, with a code by SMS to
 * their own mobile. Then the offer form appears.
 */
export async function FirstOfferIban({
  auctionId,
  phone,
  codeSent,
}: {
  auctionId: string;
  /** The user's mobile, masked; null when the account has none yet. */
  phone: string | null;
  codeSent: boolean;
}) {
  const t = await getTranslations("agency.detail.iban");
  return (
    <Card id="iban" className="flex scroll-mt-4 flex-col gap-3 p-5 shadow-none">
      <CardTitle className="text-section font-bold">{t("title")}</CardTitle>
      <p className="text-table">{t("intro")}</p>
      <ActionForm action={sendOfferIbanCode} className="flex flex-col gap-3">
        <input type="hidden" name="auctionId" value={auctionId} />
        {phone ? (
          <p className="text-table text-warm-700">{t("codeTo", { phone })}</p>
        ) : (
          <Field label={t("phone")} name="phone" type="tel" required hint={t("phoneHint")} />
        )}
        <Button type="submit" variant={codeSent ? "outline" : "primary"}>
          {codeSent ? t("sendAgain") : t("sendCode")}
        </Button>
      </ActionForm>
      {codeSent ? (
        <ActionForm action={confirmOfferIban} className="flex flex-col gap-3">
          <input type="hidden" name="auctionId" value={auctionId} />
          <Field label={t("iban")} name="iban" required autoComplete="off" hint={t("ibanHint")} />
          <Field
            label={t("code")}
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            required
          />
          <Button type="submit">{t("confirm")}</Button>
        </ActionForm>
      ) : null}
    </Card>
  );
}
