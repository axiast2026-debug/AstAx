import { formatDate, formatDateTime } from "@astax/shared/format";
import { Badge, Button, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  assignClaim,
  claimRequest,
  declineRequest,
  releaseRequest,
  withdrawOffer,
} from "@/app/agency-actions";
import { AppShell } from "@/components/app-shell";
import { Countdown } from "@/components/countdown";
import { ErrorSummary } from "@/components/form";
import { holderName } from "@/components/wizard/drivers-step";
import { api } from "@/lib/auth";
import type { AgencyRequestDetail, OwnOffer } from "@/lib/agency";
import { requireViewer } from "@/lib/me";
import { OfferForm } from "./offer-form";

const DECLINE_REASONS = [
  "OUT_OF_TARIFF",
  "COMPANY_UNAVAILABLE",
  "NOT_INSURABLE",
  "NOT_ENOUGH_TIME",
  "OTHER",
] as const;

function Row({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <>
      <dt className="text-warm-600">{label}</dt>
      <dd>{value === null || value === undefined || value === "" ? "—" : value}</dd>
    </>
  );
}

/**
 * The request as an invited agency sees it (spec 04 «Dettaglio della
 * richiesta»): every datum useful to quote, never the customer's contacts
 * (VIS-01); the page says that the opening is logged (VIS-09).
 */
export default async function IncomingRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ auctionId: string }>;
  searchParams: Promise<{ errore?: string; fatto?: string; coperture?: string }>;
}) {
  const viewer = await requireViewer();
  if (viewer.activeMembership?.organization.type !== "AGENCY") notFound();
  const { auctionId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(auctionId)) notFound();
  const query = await searchParams;
  const { status, body: detail } = await api<AgencyRequestDetail>(`/agency/requests/${auctionId}`);
  if (status !== 200) notFound();
  const t = await getTranslations("agency.detail");
  const ta = await getTranslations("agency");
  const tc = await getTranslations("agency.coverage");
  const tk = await getTranslations("wizard.documentKinds");
  const tr = await getTranslations("agency.declineReasons");

  const open = detail.auctionStatus === "OPEN";
  const offerOpen = detail.offer?.status === "SUBMITTED";
  const own = offerOpen ? (await api<OwnOffer>(`/offers/${detail.offer?.id}`)).body : null;
  const mayOffer =
    open &&
    detail.invitation !== "DECLINED" &&
    detail.elsewhere === null &&
    (detail.claim?.byMe === true || offerOpen);
  const q = detail.quoteData;
  const yesNo = (v: boolean | undefined) => (v === undefined ? null : v ? t("yes") : t("no"));
  const owner =
    q.vehicleOwner === "SAME_AS_POLICY_HOLDER" ? t("sameAsHolder") : holderName(q.vehicleOwner);
  const shortfalls = (query.coperture ?? "").split(",").filter(Boolean);

  return (
    <AppShell viewer={viewer}>
      <Link href="/richieste-in-arrivo" className="text-sm underline">
        {t("back")}
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{t("title", { code: detail.code })}</h1>
        {detail.kind === "RECONFIRMATION" ? (
          <Badge tone="warning">{t("reconfirmation")}</Badge>
        ) : null}
      </div>
      <p role="note" className="mt-2 rounded-lg bg-warm-100 p-3 text-sm">
        {t("accessLogged")}
      </p>
      <ErrorSummary codes={query.errore} />
      {query.fatto === "offerta" ? (
        <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm">
          {t("offerSent")}
        </p>
      ) : null}
      {query.fatto === "ritirata" ? (
        <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm">
          {t("offerWithdrawn")}
        </p>
      ) : null}
      {shortfalls.length > 0 ? (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-orange-500 bg-orange-50 p-3 text-sm"
        >
          <p className="font-semibold">{t("shortfallTitle")}</p>
          <p className="mt-1">
            {t("shortfallText", {
              items: shortfalls.map((s) => (tc.has(s) ? tc(s) : s)).join(", "),
            })}
          </p>
        </div>
      ) : null}

      <div className="mt-6 grid gap-6">
        <Card>
          <CardTitle>{t("auctionTitle")}</CardTitle>
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[14rem_1fr]">
            <dt className="text-warm-600">{t("closes")}</dt>
            <dd>
              {formatDateTime(detail.scheduledCloseAt)}
              {open ? (
                <>
                  {" · "}
                  <Countdown until={detail.scheduledCloseAt} closedLabel={ta("closed")} />
                </>
              ) : null}
            </dd>
            <Row label={t("minGuarantee")} value={formatDate(detail.minGuaranteeDate)} />
            <Row
              label={t("claim")}
              value={
                detail.claim
                  ? detail.claim.byMe
                    ? t("claimedByMe")
                    : t("claimedBy", { name: detail.claim.holder ?? "" })
                  : t("notClaimed")
              }
            />
          </dl>
          {detail.elsewhere ? (
            <p role="alert" className="mt-3 rounded-lg bg-orange-50 p-3 text-sm">
              {detail.elsewhere.offered
                ? t("elsewhereOffered", { agency: detail.elsewhere.agency })
                : t("elsewhereClaimed", { agency: detail.elsewhere.agency })}
            </p>
          ) : null}
          {open && detail.invitation !== "DECLINED" && detail.elsewhere === null ? (
            <div className="mt-4 flex flex-wrap gap-3">
              {!detail.claim && !offerOpen ? (
                <form action={claimRequest}>
                  <input type="hidden" name="auctionId" value={auctionId} />
                  <Button type="submit">{t("claimAction")}</Button>
                </form>
              ) : null}
              {detail.claim?.byMe && !offerOpen ? (
                <form action={releaseRequest}>
                  <input type="hidden" name="auctionId" value={auctionId} />
                  <Button type="submit" variant="outline">
                    {t("releaseAction")}
                  </Button>
                </form>
              ) : null}
            </div>
          ) : null}
          {open && detail.members.length > 0 && !offerOpen ? (
            <form action={assignClaim} className="mt-4 flex flex-wrap items-end gap-3">
              <input type="hidden" name="auctionId" value={auctionId} />
              <label className="text-sm font-medium">
                {t("assignTo")}
                <select
                  name="membershipId"
                  required
                  className="mt-1 block rounded-lg border border-warm-200 bg-white px-3 py-2"
                >
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

        <Card>
          <CardTitle>{t("vehicleTitle")}</CardTitle>
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[14rem_1fr]">
            <Row label={t("plate")} value={q.vehicle.plate} />
            <Row label={t("makeModel")} value={`${q.vehicle.make} ${q.vehicle.model}`} />
            <Row label={t("version")} value={q.vehicle.version} />
            <Row label={t("vehicleType")} value={q.vehicle.type} />
            <Row label={t("use")} value={q.vehicle.use} />
            <Row label={t("fuel")} value={q.vehicle.fuel} />
            <Row label={t("displacement")} value={q.vehicle.displacementCc} />
            <Row label={t("power")} value={q.vehicle.powerKw} />
            <Row
              label={t("firstRegistration")}
              value={formatDate(q.vehicle.firstRegistrationDate)}
            />
            <Row label={t("purchase")} value={formatDate(q.vehicle.purchaseDate)} />
            <Row label={t("isNew")} value={yesNo(q.vehicle.isNew)} />
            <Row label={t("marketValue")} value={q.vehicle.marketValueEur} />
            <Row label={t("alarm")} value={yesNo(q.vehicle.satelliteAlarm)} />
            <Row label={t("nightParking")} value={q.vehicle.nightParking} />
            <Row label={t("km")} value={q.vehicle.annualKmBand} />
          </dl>
        </Card>

        <Card>
          <CardTitle>{t("peopleTitle")}</CardTitle>
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[14rem_1fr]">
            <Row label={t("holder")} value={holderName(q.policyHolder)} />
            {q.policyHolder.kind === "PERSON" ? (
              <>
                <Row label={t("birthDate")} value={formatDate(q.policyHolder.birthDate)} />
                <Row label={t("sex")} value={q.policyHolder.sex} />
                <Row label={t("profession")} value={q.policyHolder.profession} />
              </>
            ) : null}
            <Row
              label={t("residence")}
              value={
                q.policyHolder.kind === "PERSON"
                  ? `${q.policyHolder.residence.postalCode} (${q.policyHolder.residence.province})`
                  : `${q.policyHolder.registeredOffice.postalCode} (${q.policyHolder.registeredOffice.province})`
              }
            />
            <Row label={t("owner")} value={owner} />
            <Row label={t("drivingFormula")} value={t(`formulas.${q.drivingFormula}`)} />
          </dl>
          <ul className="mt-3 space-y-1 text-sm">
            {q.drivers.map((d, i) => (
              <li key={`${d.person.fiscalCode}-${i}`}>
                {t("driver", {
                  name: holderName(d.person),
                  birth: formatDate(d.person.birthDate),
                  licence: formatDate(d.licence.issuedOn),
                  main: d.isMain ? "yes" : "no",
                })}
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardTitle>{t("historyTitle")}</CardTitle>
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[14rem_1fr]">
            <Row label={t("provenance")} value={q.history.provenance} />
            <Row label={t("cuClass")} value={q.history.cuClass} />
            <Row label={t("currentInsurer")} value={q.history.currentInsurer} />
            <Row
              label={t("currentExpiry")}
              value={q.history.currentExpiryDate ? formatDate(q.history.currentExpiryDate) : null}
            />
          </dl>
          {q.history.claims.length > 0 ? (
            <ul className="mt-3 space-y-1 text-sm">
              {q.history.claims.map((c) => (
                <li key={c.year}>
                  {t("claimYear", {
                    year: c.year,
                    main: c.mainResponsibility,
                    shared: c.sharedResponsibility,
                  })}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm">{t("noClaims")}</p>
          )}
        </Card>

        <Card>
          <CardTitle>{t("requestTitle")}</CardTitle>
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[14rem_1fr]">
            <Row label={t("package")} value={detail.package?.name ?? q.request.packageCode} />
            <Row label={t("startDate")} value={formatDate(q.request.startDate)} />
            <Row label={t("blackBox")} value={yesNo(q.request.blackBox)} />
            <Row label={t("minValidity")} value={ta("days", { days: q.request.minValidityDays })} />
          </dl>
        </Card>

        <Card>
          <CardTitle>{t("documentsTitle")}</CardTitle>
          <p className="mt-1 text-xs text-warm-600">{t("watermarkNote")}</p>
          {detail.documents.length === 0 ? (
            <p className="mt-2 text-sm">{t("noDocuments")}</p>
          ) : (
            <ul className="mt-3 space-y-1 text-sm">
              {detail.documents.map((d) => (
                <li key={d.id}>
                  <a
                    href={`/richieste-in-arrivo/${auctionId}/documenti/${d.id}`}
                    className="underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {tk(d.kind)}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {mayOffer ? (
          <section aria-labelledby="offer-title">
            <h2 id="offer-title" className="text-xl font-semibold">
              {offerOpen
                ? t("changeTitle")
                : detail.previousOffer
                  ? t("reconfirmTitle")
                  : t("offerTitle")}
            </h2>
            {detail.previousOffer && !offerOpen ? (
              <p className="mt-1 text-sm text-warm-600">{t("reconfirmIntro")}</p>
            ) : null}
            <div className="mt-4">
              <OfferForm detail={detail} own={own} errors={query.errore} />
            </div>
          </section>
        ) : null}

        {open && offerOpen && detail.offer ? (
          <form action={withdrawOffer}>
            <input type="hidden" name="auctionId" value={auctionId} />
            <input type="hidden" name="offerId" value={detail.offer.id} />
            <Button type="submit" variant="outline">
              {t("withdraw")}
            </Button>
          </form>
        ) : null}

        {open && !offerOpen && detail.invitation !== "DECLINED" ? (
          <form action={declineRequest} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="auctionId" value={auctionId} />
            <label className="text-sm font-medium">
              {t("declineReason")}
              <select
                name="reasonCode"
                className="mt-1 block rounded-lg border border-warm-200 bg-white px-3 py-2"
              >
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
          <p className="text-sm text-warm-600">{t("declined")}</p>
        ) : null}
      </div>
    </AppShell>
  );
}
