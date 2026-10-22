import { formatDate, formatEuroCents, formatTimeSeconds } from "@astax/shared/format";
import { Badge, buttonVariants, cn, Icon } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { withdrawOffer } from "@/app/agency-actions";
import type { AgencyRequestDetail, OwnOffer } from "@/lib/agency";
import { whenWords } from "@/lib/when";

/**
 * Receipt of the sealed envelope (proposal P3, Dan 2026-10-22: without the
 * number of the envelope, which would tell how many others offered): the
 * server time of the registration (PRES-01), until when it stays sealed, the
 * agency's own offer from its copy (BC-04) and who sent it.
 */
export async function OfferReceipt({
  detail,
  own,
  agency,
  serverNow,
  announce,
}: {
  detail: AgencyRequestDetail;
  own: OwnOffer;
  agency: string;
  serverNow: string;
  /** Right after the sending: screen readers hear it once. */
  announce: boolean;
}) {
  const t = await getTranslations("agency.receipt");
  const when = await whenWords(serverNow);
  const company = detail.companies.find((c) => c.id === own.offer.companyId)?.name ?? "—";
  const closes = when(detail.scheduledCloseAt);
  return (
    <section
      role={announce ? "status" : undefined}
      aria-labelledby="receipt-title"
      className="on-dark relative flex flex-col gap-4 overflow-hidden rounded-2xl bg-night-900 p-6 text-white"
    >
      <span aria-hidden className="absolute -top-15 -right-12 h-55 w-16 rotate-35 bg-night-800" />
      <div className="relative flex items-center justify-between gap-2">
        <span className="text-label font-semibold tracking-wide text-night-300 uppercase">
          {t("eyebrow")}
        </span>
        <Badge className="bg-night-800 text-white">
          <Icon name="lock" size={14} />
          {t("sealed")}
        </Badge>
      </div>
      <div className="relative flex items-center gap-4">
        <span className="flex size-16 flex-none items-center justify-center rounded-2xl bg-night-800">
          <Icon name="envelope" size={36} />
        </span>
        <span className="flex flex-col">
          <h2 id="receipt-title" className="font-display text-section font-extrabold">
            {t("title")}
          </h2>
          <span className="text-table text-night-300 tabular">
            {t("registeredAt", { time: formatTimeSeconds(own.lastChangedAt) })}
          </span>
        </span>
      </div>
      <dl className="relative grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-table tabular">
        <dt className="text-night-300">{t("sealedUntil")}</dt>
        <dd>{closes}</dd>
        <dt className="text-night-300">{t("yourOffer")}</dt>
        <dd>
          {t("offer", {
            company,
            premium: formatEuroCents(own.offer.annualGrossPremiumCents),
            date: formatDate(own.offer.guaranteeUntil),
          })}
        </dd>
        {own.sentBy ? (
          <>
            <dt className="text-night-300">{t("sentBy")}</dt>
            <dd>{t("sender", { name: own.sentBy, agency })}</dd>
          </>
        ) : null}
      </dl>
      <p className="relative text-table">{t("nobody", { when: closes })}</p>
      <div className="relative flex flex-col gap-3 sm:flex-row">
        <a
          href="#offer-title"
          className={cn(
            buttonVariants({ variant: "secondary" }),
            "bg-white text-night-900 hover:bg-night-100",
          )}
        >
          {t("edit")}
        </a>
        <form action={withdrawOffer}>
          <input type="hidden" name="auctionId" value={detail.auctionId} />
          <input type="hidden" name="offerId" value={own.id} />
          <button
            type="submit"
            className={cn(
              buttonVariants({ variant: "outline" }),
              "w-full bg-transparent text-white shadow-[inset_0_0_0_1px_var(--color-night-300)] hover:bg-night-800",
            )}
          >
            <Icon name="close" />
            {t("withdraw")}
          </button>
        </form>
      </div>
    </section>
  );
}
