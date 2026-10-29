import { startTexts } from "@/lib/start";
import { AniaConfirmed } from "@/components/ania-confirmed";
import { formatDate } from "@astax/shared/format";
import { Badge, Button, Card, CardTitle, Icon } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { assignClaim, claimRequest, declineRequest, releaseRequest } from "@/app/agency-actions";
import { AppShell } from "@/components/app-shell";
import { CountdownRing } from "@/components/countdown-ring";
import { ErrorSummary, INPUT } from "@/components/form";
import { api } from "@/lib/auth";
import type { AgencyRequestDetail, OwnOffer } from "@/lib/agency";
import { requireViewer } from "@/lib/me";
import { whenWords } from "@/lib/when";
import { FirstOfferIban } from "./first-offer-iban";
import { OfferForm } from "./offer-form";
import { OfferReceipt } from "./offer-receipt";

const DECLINE_REASONS = [
  "OUT_OF_TARIFF",
  "COMPANY_UNAVAILABLE",
  "NOT_INSURABLE",
  "NOT_ENOUGH_TIME",
  "OTHER",
] as const;

function Row({
  label,
  value,
  missing = "—",
}: {
  label: string;
  value: string | number | null | undefined;
  missing?: string;
}) {
  return (
    <>
      <dt className="min-w-0 break-words text-warm-600">{label}</dt>
      <dd className="min-w-0 break-words">
        {value === null || value === undefined || value === "" ? missing : value}
      </dd>
    </>
  );
}

/**
 * The request as an agency sees it (spec 04 «Dettaglio della richiesta»; Dan,
 * 2026-10-29): the ANIA data, the request and the documents; never the
 * customer's name, email or phone before the purchase (VIS-01); the page says
 * that the opening is logged (VIS-09). Area agenzia
 * of the design: the data in cards on the left; on the right the ring, the
 * receipt of the sealed envelope (P3) and the offer.
 */
export default async function IncomingRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ auctionId: string }>;
  searchParams: Promise<{ errore?: string; fatto?: string; coperture?: string; iban?: string }>;
}) {
  const viewer = await requireViewer();
  if (viewer.activeMembership?.organization.type !== "AGENCY") notFound();
  const { auctionId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(auctionId)) notFound();
  const query = await searchParams;
  const { status, body: detail } = await api<AgencyRequestDetail>(`/agency/requests/${auctionId}`);
  if (status !== 200) notFound();
  const t = await getTranslations("agency.detail");
  const startText = await startTexts();
  const ta = await getTranslations("agency");
  const tc = await getTranslations("agency.coverage");
  const tk = await getTranslations("wizard.documentKinds");
  const tr = await getTranslations("agency.declineReasons");

  const open = detail.auctionStatus === "OPEN";
  const offerOpen = detail.offer?.status === "SUBMITTED";
  // BC-04: the agency's copy is read only by its author, the owner, the supervisors and the
  // operators allowed; anyone else (a colleague's offer) sees no receipt, never an error.
  const ownCopy = offerOpen ? await api<OwnOffer>(`/offers/${detail.offer?.id}`) : null;
  const own = ownCopy?.status === 200 ? ownCopy.body : null;
  const mayOffer =
    open &&
    detail.invitation !== "DECLINED" &&
    detail.elsewhere === null &&
    (detail.claim?.byMe === true || offerOpen);
  const q = detail.request;
  // Dan, 2026-10-29: the agency's IBAN at its first offer.
  const iban =
    mayOffer && !offerOpen
      ? await api<{ required: boolean; phone: string | null }>("/agency/iban")
      : null;
  const ibanRequired = iban?.status === 200 && iban.body.required;
  // Dan, 2026-10-29: the RCA, then the other coverages of the package the customer chose.
  const coverages = Object.entries(detail.package?.requirements ?? { rca: { required: true } })
    .filter(([key, r]) => key === "rca" || r.required)
    .sort(([a], [b]) => (a === "rca" ? -1 : b === "rca" ? 1 : 0))
    .map(([key]) => (tc.has(key) ? tc(key) : key))
    .join(", ");
  const shortfalls = (query.coperture ?? "").split(",").filter(Boolean);

  const serverNow = detail.live?.serverNow ?? own?.lastChangedAt ?? detail.scheduledCloseAt;
  const when = await whenWords(serverNow);
  const DL =
    "mt-3 grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-3 gap-y-1.5 text-table tabular";
  const CARD = "p-5 shadow-none";

  return (
    <AppShell viewer={viewer}>
      <div className="flex flex-col gap-4">
        <Link
          href="/richieste-in-arrivo"
          className="inline-flex min-h-11 items-center gap-1 self-start text-table font-medium underline"
        >
          {t("back")}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-screen font-extrabold">
            {t("title", { code: detail.code })}
          </h1>
          {detail.kind === "RECONFIRMATION" ? (
            <Badge tone="warning">{t("reconfirmation")}</Badge>
          ) : null}
        </div>
        <p
          role="note"
          className="flex items-start gap-2 rounded-lg bg-warm-100 px-3 py-2 text-table"
        >
          <span className="inline-flex pt-0.5">
            <Icon name="info" size={18} />
          </span>
          {t("accessLogged")}
        </p>
        <ErrorSummary codes={query.errore} />
        {query.fatto === "offerta" && !own ? (
          <p role="status" className="rounded-lg bg-green-50 p-3 text-table text-green-700">
            {t("offerSent")}
          </p>
        ) : null}
        {query.fatto === "iban" ? (
          <p role="status" className="rounded-lg bg-green-50 p-3 text-table text-green-700">
            {t("ibanSaved")}
          </p>
        ) : null}
        {query.fatto === "ritirata" ? (
          <p role="status" className="rounded-lg bg-green-50 p-3 text-table text-green-700">
            {t("offerWithdrawn")}
          </p>
        ) : null}
        {shortfalls.length > 0 ? (
          <div role="alert" className="rounded-lg bg-warning-50 p-3 text-table">
            <p className="font-semibold text-warning-700">{t("shortfallTitle")}</p>
            <p className="mt-1">
              {t("shortfallText", {
                items: shortfalls.map((s) => (tc.has(s) ? tc(s) : s)).join(", "),
              })}
            </p>
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_30rem] lg:grid-rows-[auto_1fr] lg:items-start">
          {/* The auction: on a phone first, on a wide screen top right. */}
          <Card className={`${CARD} lg:col-start-2 lg:row-start-1`}>
            <CardTitle className="sr-only">{t("auctionTitle")}</CardTitle>
            <div className="flex items-center gap-4">
              {open && detail.live ? (
                <CountdownRing
                  time={detail.live}
                  size={96}
                  announce={false}
                  resumeLabel={detail.live.pausedUntil ? when(detail.live.pausedUntil) : null}
                />
              ) : null}
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-table tabular">
                <dt className="text-warm-600">{t("closes")}</dt>
                <dd className="font-semibold">{when(detail.scheduledCloseAt)}</dd>
                <dt className="text-warm-600">{t("minGuarantee")}</dt>
                <dd className="font-semibold">{formatDate(detail.minGuaranteeDate)}</dd>
                <dt className="text-warm-600">{t("claim")}</dt>
                <dd>
                  {detail.claim
                    ? detail.claim.byMe
                      ? t("claimedByMe")
                      : t("claimedBy", { name: detail.claim.holder ?? "" })
                    : t("notClaimed")}
                </dd>
              </dl>
            </div>
            {detail.elsewhere ? (
              <p role="alert" className="mt-3 rounded-lg bg-warning-50 p-3 text-table">
                {detail.elsewhere.offered
                  ? t("elsewhereOffered", { agency: detail.elsewhere.agency })
                  : t("elsewhereClaimed", { agency: detail.elsewhere.agency })}
              </p>
            ) : null}
            {open && detail.invitation !== "DECLINED" && detail.elsewhere === null ? (
              <div className="mt-4 flex flex-wrap gap-3 empty:hidden">
                {!detail.claim && !offerOpen ? (
                  <form action={claimRequest}>
                    <input type="hidden" name="auctionId" value={auctionId} />
                    <Button type="submit" size="lg">
                      {t("claimAction")}
                    </Button>
                  </form>
                ) : null}
                {detail.claim?.byMe && !offerOpen ? (
                  <form action={releaseRequest}>
                    <input type="hidden" name="auctionId" value={auctionId} />
                    <Button type="submit" variant="ghost" size="sm">
                      {t("releaseAction")}
                    </Button>
                  </form>
                ) : null}
              </div>
            ) : null}
            {open && detail.members.length > 0 && !offerOpen ? (
              <form action={assignClaim} className="mt-4 flex flex-wrap items-end gap-3">
                <input type="hidden" name="auctionId" value={auctionId} />
                <label className="flex-1 text-label font-semibold">
                  {t("assignTo")}
                  <select name="membershipId" required className={INPUT}>
                    {detail.members.map((m) => (
                      <option key={m.membershipId} value={m.membershipId}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
                <Button type="submit" variant="outline">
                  {t("assignAction")}
                </Button>
              </form>
            ) : null}
          </Card>

          {/* The data useful to quote, in cards. */}
          <div className="grid gap-4 sm:grid-cols-2 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:grid-cols-1 2xl:grid-cols-2">
            <div className="sm:col-span-2 lg:col-span-1 2xl:col-span-2">
              <AniaConfirmed ania={detail.ania} request={q} quoteType={detail.quoteType} />
            </div>

            <Card className={`${CARD} sm:col-span-2 lg:col-span-1 2xl:col-span-2`}>
              <CardTitle className="text-body font-bold">{t("requestTitle")}</CardTitle>
              <dl className={DL}>
                <Row label={t("drivingFormula")} value={t(`formulas.${q.drivingFormula}`)} />
                <Row label={t("coverages")} value={coverages} />
                <Row label={t("blackBox")} value={q.blackBox ? t("accepts") : t("doesNotAccept")} />
                <Row label={t("package")} value={detail.package?.name} />
                <Row label={t("startDate")} value={startText(q)} />
                <Row label={t("minValidity")} value={ta("days", { days: q.minValidityDays })} />
                <Row
                  label={t("auctionDuration")}
                  value={t("hours", { hours: q.auctionDurationHours })}
                />
              </dl>
            </Card>

            <Card className={`${CARD} sm:col-span-2 lg:col-span-1 2xl:col-span-2`}>
              <CardTitle className="text-body font-bold">{t("documentsTitle")}</CardTitle>
              <p className="mt-1 text-note text-warm-600">{t("watermarkNote")}</p>
              {detail.documents.length === 0 ? (
                <p className="mt-2 text-table">{t("noDocuments")}</p>
              ) : (
                <ul className="mt-2 flex flex-wrap gap-x-4">
                  {detail.documents.map((d) => (
                    <li key={d.id}>
                      <a
                        href={`/richieste-in-arrivo/${auctionId}/documenti/${d.id}`}
                        className="inline-flex min-h-11 items-center gap-1.5 text-table font-semibold underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Icon name="document" size={18} />
                        {tk(d.kind)}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* The receipt of the sealed envelope (P3) and the offer. */}
          <div className="flex flex-col gap-4 lg:col-start-2 lg:row-start-2">
            {open && own ? (
              <OfferReceipt
                detail={detail}
                own={own}
                agency={viewer.activeMembership.organization.name}
                serverNow={serverNow}
                announce={query.fatto === "offerta"}
              />
            ) : null}

            {mayOffer && ibanRequired ? (
              <FirstOfferIban
                auctionId={auctionId}
                phone={iban?.body.phone ?? null}
                codeSent={query.iban === "codice"}
              />
            ) : null}

            {mayOffer && !ibanRequired ? (
              <section aria-labelledby="offer-title" className="flex flex-col gap-3">
                <h2 id="offer-title" className="scroll-mt-4 text-section font-bold">
                  {offerOpen
                    ? t("changeTitle")
                    : detail.previousOffer
                      ? t("reconfirmTitle")
                      : t("offerTitle")}
                </h2>
                {detail.previousOffer && !offerOpen ? (
                  <p className="text-table text-warm-600">{t("reconfirmIntro")}</p>
                ) : null}
                <OfferForm
                  detail={detail}
                  own={own}
                  errors={query.errore}
                  shortfalls={query.fatto === "offerta" ? shortfalls : null}
                />
              </section>
            ) : null}

            {open && !offerOpen && detail.invitation !== "DECLINED" ? (
              <form
                action={declineRequest}
                className="flex flex-col gap-3 rounded-xl bg-white p-5 shadow-[inset_0_0_0_1px_var(--color-warm-200)]"
              >
                <input type="hidden" name="auctionId" value={auctionId} />
                <label className="text-label font-semibold">
                  {t("declineReason")}
                  <select name="reasonCode" className={INPUT}>
                    <option value="">{t("noReason")}</option>
                    {DECLINE_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {tr(r)}
                      </option>
                    ))}
                  </select>
                </label>
                <Button type="submit" variant="outline">
                  {t("decline")}
                </Button>
              </form>
            ) : null}
            {detail.invitation === "DECLINED" ? (
              <p className="text-table text-warm-600">{t("declined")}</p>
            ) : null}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
