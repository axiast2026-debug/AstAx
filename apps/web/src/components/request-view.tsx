import { formatDate, formatDateTime, formatEuroCents } from "@astax/shared/format";
import { Badge, Button, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { realtimeTicket } from "@/app/actions";
import { askReconfirmation, cancelRequest } from "@/app/request-actions";
import { Countdown } from "@/components/countdown";
import { LiveRefresh } from "@/components/live-refresh";
import { BrokerOffersPanel } from "@/components/broker-offers-panel";
import { NextOfferCard } from "@/components/next-offer-card";
import { OffersPanel } from "@/components/offers-panel";
import { api } from "@/lib/auth";
import { ErrorSummary } from "@/components/form";
import { holderName } from "@/lib/requests";
import { STEP_SECTIONS, type RequestDetail, type WizardStep } from "@/lib/requests";

const STATUS_TONE: Record<string, "neutral" | "success" | "warning" | "danger" | "dark"> = {
  DRAFT: "neutral",
  IN_VERIFICATION: "warning",
  INTEGRATION_REQUESTED: "danger",
  EXCLUDED: "danger",
  CANCELLED: "neutral",
};

export async function StatusBadge({ status }: { status: string }) {
  const t = await getTranslations("requestStatus");
  return <Badge tone={STATUS_TONE[status] ?? "dark"}>{t(status)}</Badge>;
}

interface AuctionStatus {
  status: string;
  /** GAR-06: reconfirmations used and allowed. */
  reconfirmation?: { used: number; max: number; available: boolean; pending: boolean };
  auction: {
    round: number;
    kind: string;
    status: string;
    scheduledCloseAt: string;
    closedAt: string | null;
    offers: number | null;
    invitedAgencies?: number;
  } | null;
}

interface PresentedOffer {
  id: string;
  company: string;
  product: string;
  annualGrossPremiumCents: number;
  guaranteeUntil: string;
  guaranteed: boolean;
}

const AUCTION_STATUSES = [
  "AUCTION_OPEN",
  "OFFERS_AVAILABLE",
  "DESERTED",
  "EXPIRED",
  "IN_RECONFIRMATION",
  "ACCEPTED",
  "IN_ISSUANCE",
];

/**
 * The auction for its requester (VIS-03, VIS-04, PRES-02): during it the
 * countdown and the number of offers (the broker also the invited agencies),
 * no price; after it, the best offer per company, no agency name.
 */
async function AuctionPanel({
  requestId,
  base,
  presented,
}: {
  requestId: string;
  base: string;
  /** Phase 5: the offers are in the offers panel, where the requester chooses (PRES-02…08). */
  presented: boolean;
}) {
  const t = await getTranslations("auctionView");
  const { body: status } = await api<AuctionStatus>(`/requests/${requestId}/auction`);
  const a = status.auction;
  if (!a) return null;
  const open = a.status === "OPEN";
  const offers =
    open || presented
      ? []
      : (await api<{ offers: PresentedOffer[] }>(`/requests/${requestId}/offers`)).body.offers;
  return (
    <Card>
      <CardTitle>
        {open && a.kind === "RECONFIRMATION" ? t("reconfirmationTitle") : t("title")}
      </CardTitle>
      {open && a.kind === "RECONFIRMATION" ? (
        <p className="mt-1 text-sm text-warm-600">{t("reconfirmationIntro")}</p>
      ) : null}
      {open ? (
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[12rem_1fr]">
          <dt className="text-warm-600">{t("closesIn")}</dt>
          <dd className="text-lg font-semibold">
            <Countdown until={a.scheduledCloseAt} closedLabel={t("closing")} />
          </dd>
          <dt className="text-warm-600">{t("closesAt")}</dt>
          <dd>{formatDateTime(a.scheduledCloseAt)}</dd>
          <dt className="text-warm-600">{t("offers")}</dt>
          <dd className="tabular">{a.offers ?? 0}</dd>
          {a.invitedAgencies !== undefined ? (
            <>
              <dt className="text-warm-600">{t("invited")}</dt>
              <dd className="tabular">{a.invitedAgencies}</dd>
            </>
          ) : null}
        </dl>
      ) : presented ? null : offers.length === 0 ? (
        <p className="mt-2 text-sm">{t("noOffers")}</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-warm-600">{t("bestPerCompany")}</p>
          <ul className="mt-3 divide-y divide-warm-200 text-sm">
            {offers.map((o, i) => (
              <li key={o.id} className={o.guaranteed ? "py-3" : "py-3 text-warm-600"}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">
                    {o.company} · {o.product}
                    {i === 0 && o.guaranteed ? (
                      <Badge tone="success" className="ml-2">
                        {t("cheapest")}
                      </Badge>
                    ) : null}
                  </span>
                  <span className="text-lg font-semibold tabular">
                    {formatEuroCents(o.annualGrossPremiumCents)}
                  </span>
                </div>
                <div>
                  {o.guaranteed
                    ? t("guaranteedUntil", { date: formatDate(o.guaranteeUntil) })
                    : t("expired", { date: formatDate(o.guaranteeUntil) })}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {status.reconfirmation?.pending ? (
        <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm">
          {t("reconfirmationPending")}
        </p>
      ) : null}
      {status.reconfirmation?.available ? (
        <form action={askReconfirmation} className="mt-4 border-t border-warm-200 pt-4">
          <input type="hidden" name="requestId" value={requestId} />
          <input type="hidden" name="base" value={base} />
          <p className="text-sm">
            {t("reconfirmationOffer", {
              left: status.reconfirmation.max - status.reconfirmation.used,
            })}
          </p>
          <Button type="submit" className="mt-3">
            {t("askReconfirmation")}
          </Button>
        </form>
      ) : null}
    </Card>
  );
}

/**
 * Detail of a request for its requester (spec 03 «Dettaglio di un preventivo»,
 * spec 02 «Dettaglio richiesta»): status, what to do next, data sent in read
 * only, documents and the timeline.
 */
export async function RequestView({
  detail,
  base,
  steps,
  errors,
  justSubmitted,
}: {
  detail: RequestDetail;
  base: "/preventivi" | "/richieste";
  steps: readonly WizardStep[];
  errors?: string;
  justSubmitted: boolean;
}) {
  const t = await getTranslations("requestView");
  const te = await getTranslations("timeline");
  const tk = await getTranslations("wizard.documentKinds");
  const data = detail.quoteData;
  const firstStep =
    detail.status === "INTEGRATION_REQUESTED"
      ? (steps.find((s) =>
          STEP_SECTIONS[s].some((sec) => detail.integration?.sections.includes(sec)),
        ) ?? "dati")
      : (steps[0] ?? "tipo");
  const approved = detail.lastDecision?.decision === "APPROVED";
  const presented = ["OFFERS_AVAILABLE", "ACCEPTED", "IN_ISSUANCE"].includes(detail.status);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{t("title", { code: detail.code })}</h1>
        <StatusBadge status={detail.status} />
      </div>
      <ErrorSummary codes={errors} />
      {justSubmitted ? (
        <p role="status" className="rounded-xl bg-green-50 p-4 text-sm">
          {t("submitted")}
        </p>
      ) : null}

      {detail.status === "DRAFT" ? (
        <Card>
          <CardTitle>{t("draftTitle")}</CardTitle>
          <p className="mt-2 text-sm text-warm-600">{t("draftText")}</p>
          <Link
            href={`${base}/${detail.id}/${firstStep}`}
            className="mt-4 inline-block font-medium text-night-900 underline"
          >
            {t("continue")}
          </Link>
        </Card>
      ) : null}
      {detail.status === "INTEGRATION_REQUESTED" ? (
        <Card className="border-orange-500">
          <CardTitle>{t("integrationTitle")}</CardTitle>
          <p className="mt-2 text-sm">{detail.lastDecision?.message}</p>
          <Link
            href={`${base}/${detail.id}/${firstStep}`}
            className="mt-4 inline-block font-medium underline"
          >
            {t("complete")}
          </Link>
        </Card>
      ) : null}
      {detail.status === "IN_VERIFICATION" ? (
        <Card>
          <CardTitle>{approved ? t("approvedTitle") : t("verificationTitle")}</CardTitle>
          <p className="mt-2 text-sm text-warm-600">
            {approved ? t("approvedText") : t("verificationText")}
          </p>
        </Card>
      ) : null}
      {detail.status === "EXCLUDED" ? (
        <Card className="border-red-600">
          <CardTitle>{t("excludedTitle")}</CardTitle>
          <p className="mt-2 text-sm">{detail.lastDecision?.message}</p>
        </Card>
      ) : null}

      {AUCTION_STATUSES.includes(detail.status) ? (
        <AuctionPanel requestId={detail.id} base={base} presented={presented} />
      ) : null}
      {base === "/preventivi" && detail.status === "ACCEPTED" ? (
        <NextOfferCard requestId={detail.id} />
      ) : null}
      {presented && base === "/preventivi" ? <OffersPanel requestId={detail.id} /> : null}
      {presented && base === "/richieste" ? <BrokerOffersPanel requestId={detail.id} /> : null}
      {AUCTION_STATUSES.includes(detail.status) ||
      (detail.status === "IN_VERIFICATION" && approved) ? (
        <LiveRefresh ticket={realtimeTicket} follow={{ requestId: detail.id }} />
      ) : null}

      {data ? (
        <Card>
          <CardTitle>{t("dataTitle")}</CardTitle>
          <p className="mt-1 text-sm text-warm-600">{t("dataReadOnly")}</p>
          <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[12rem_1fr]">
            <dt className="text-warm-600">{t("vehicle")}</dt>
            <dd>{`${data.vehicle.make} ${data.vehicle.model} · ${data.vehicle.plate}`}</dd>
            <dt className="text-warm-600">{t("holder")}</dt>
            <dd>{holderName(data.policyHolder)}</dd>
            <dt className="text-warm-600">{t("drivers")}</dt>
            <dd>{data.drivers.map((d) => holderName(d.person)).join(", ")}</dd>
            <dt className="text-warm-600">{t("package")}</dt>
            <dd>{data.request.packageCode}</dd>
            <dt className="text-warm-600">{t("version")}</dt>
            <dd className="tabular">{detail.quoteDataVersion}</dd>
          </dl>
        </Card>
      ) : null}

      <Card>
        <CardTitle>{t("documents")}</CardTitle>
        {detail.documents.length === 0 ? (
          <p className="mt-2 text-sm">{t("noDocuments")}</p>
        ) : (
          <ul className="mt-3 space-y-1 text-sm">
            {detail.documents.map((d) => (
              <li key={d.id}>
                <a
                  href={`${base}/${detail.id}/documenti/${d.id}`}
                  className="underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  {tk(d.kind)}
                </a>{" "}
                <span className="text-warm-600">{formatDateTime(d.uploadedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle>{t("timeline")}</CardTitle>
        <ol className="mt-3 space-y-2 text-sm">
          {detail.timeline.map((e, i) => (
            <li key={`${e.type}-${i}`} className="flex gap-3">
              <time dateTime={e.at} className="w-36 shrink-0 text-warm-600 tabular">
                {formatDateTime(e.at)}
              </time>
              <span>{te(e.type)}</span>
            </li>
          ))}
        </ol>
      </Card>

      {["DRAFT", "IN_VERIFICATION", "INTEGRATION_REQUESTED"].includes(detail.status) ? (
        <form action={cancelRequest}>
          <input type="hidden" name="requestId" value={detail.id} />
          <input type="hidden" name="base" value={base} />
          <Button type="submit" variant="outline">
            {t("cancel")}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
