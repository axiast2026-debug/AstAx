import { formatDateTime } from "@astax/shared/format";
import { Badge, Button, Card, CardTitle, cn } from "@astax/ui";
import { getLocale, getTranslations } from "next-intl/server";
import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/auth";
import { requireViewer } from "@/lib/me";
import { comparisonRows, differs, verificationCard } from "@/lib/verification";
import {
  approve,
  assignToMe,
  correct,
  exclude,
  excludeAgency,
  includeAgency,
  requestIntegration,
  saveChecklistItem,
} from "../actions";

interface AgencyPreview {
  scheduledCloseAt: string;
  invited: { organizationId: string; name: string; companies: string[] }[];
  companies: string[];
  compatibleNotChosen: number;
  excluded: { organizationId: string; name: string; reason: string }[];
}

const TONE = { GREEN: "success", YELLOW: "warning", RED: "danger" } as const;
const SECTIONS = [
  "policyHolder",
  "vehicleOwner",
  "vehicle",
  "history",
  "driving",
  "request",
] as const;
const DOCUMENT_KINDS = [
  "REGISTRATION_CERTIFICATE",
  "DRIVING_LICENCE",
  "RISK_CERTIFICATE",
  "FISCAL_CODE_CARD",
  "CONSENT_FORM",
  "OTHER",
] as const;
const INPUT = "mt-1 block w-full rounded-lg border border-warm-200 bg-white px-3 py-2 text-sm";

/**
 * The verification card (spec 06 «Scheda di verifica»): documents on the left,
 * data on the right next to what the documents say, the checklist with the
 * automatic outcome, correction and note, and the decisions.
 */
export default async function VerificationCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ errore?: string; fatto?: string }>;
}) {
  const viewer = await requireViewer();
  const t = await getTranslations("verification");
  const locale = (await getLocale()) === "sq" ? "sq" : "it";
  const { id } = await params;
  const query = await searchParams;
  const card = await verificationCard(id);
  const round = card.verification;
  const open = card.status === "IN_VERIFICATION" && round !== null && round.decision === null;
  const preview = open
    ? (await api<AgencyPreview>(`/verification/requests/${id}/agencies`)).body
    : null;
  const highlighted = new Set((round?.checklist ?? []).flatMap((i) => i.fields));

  const istatCodes = new Set<string>();
  if (card.quoteData) {
    const d = card.quoteData;
    const holder = d.policyHolder;
    istatCodes.add(
      holder.kind === "PERSON"
        ? holder.residence.municipalityIstat
        : holder.registeredOffice.municipalityIstat,
    );
  }
  for (const doc of card.documents) {
    const v = doc.extraction?.fields.ownerMunicipalityIstat?.value;
    if (typeof v === "string") istatCodes.add(v);
  }
  const names = new Map<string, string>();
  for (const code of istatCodes) {
    const found = (
      await api<{ istatCode: string; name: string; province: string }[]>(
        `/reference/municipalities?q=${code}`,
      )
    ).body;
    const m = Array.isArray(found) ? found[0] : undefined;
    if (m) names.set(code, `${m.name} (${m.province})`);
  }
  const rows = card.quoteData
    ? comparisonRows(card.quoteData, card.documents, (c) => names.get(c) ?? c)
    : [];

  return (
    <AppShell viewer={viewer}>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{t("cardTitle", { code: card.code })}</h1>
        {round ? (
          <Badge tone={TONE[round.autoOutcome]}>{t(`outcomes.${round.autoOutcome}`)}</Badge>
        ) : null}
        <span className="text-sm text-warm-600">
          {t(`channels.${card.channel}`)}
          {card.customer ? ` · ${card.customer}` : ""}
        </span>
      </div>
      {query.errore ? (
        <p role="alert" className="mt-4 rounded-lg border border-red-600 bg-red-50 p-3 text-sm">
          {t("error", { codes: query.errore })}
        </p>
      ) : null}
      {query.fatto === "corretta" ? (
        <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm">
          {t("done.corretta")}
        </p>
      ) : null}
      {open && round?.assignedToUserId !== viewer.me.id ? (
        <form action={assignToMe} className="mt-4">
          <input type="hidden" name="requestId" value={card.id} />
          <Button type="submit" variant="outline" size="sm">
            {t("assignToMe")}
          </Button>
        </form>
      ) : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card>
          <CardTitle>{t("documents")}</CardTitle>
          <ul className="mt-3 space-y-4 text-sm">
            {card.documents.map((doc) => (
              <li key={doc.id}>
                <a
                  href={`/verifiche/${card.id}/documenti/${doc.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium underline"
                >
                  {t(`documentKinds.${doc.kind}`)}
                  {doc.driverIndex === null ? "" : ` ${doc.driverIndex + 1}`}
                </a>
                <span className="ml-2 text-warm-600">{formatDateTime(doc.uploadedAt, locale)}</span>
                {doc.extraction ? (
                  <dl className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-3 gap-y-1 text-xs">
                    {Object.entries(doc.extraction.fields).map(([name, f]) => {
                      const path = `documents.${doc.kind}${doc.driverIndex === null ? "" : `.${doc.driverIndex}`}.${name}`;
                      return (
                        <div
                          key={name}
                          className={cn(
                            "contents",
                            highlighted.has(path) ? "font-semibold text-red-700" : "",
                          )}
                        >
                          <dt>{name}</dt>
                          <dd>{String(f.value ?? "")}</dd>
                          <dd className="tabular">
                            {t("confidence", { value: Math.round(f.confidence * 100) })}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-6">
          <Card className="overflow-x-auto">
            <CardTitle>{t("comparison")}</CardTitle>
            <table className="mt-3 w-full text-left text-sm">
              <thead className="text-warm-600">
                <tr>
                  <th scope="col" className="py-1">
                    {t("field")}
                  </th>
                  <th scope="col">{t("declared")}</th>
                  <th scope="col">{t("fromDocument")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const different = differs(r);
                  return (
                    <tr
                      key={r.path}
                      className={cn(
                        "border-t border-warm-200",
                        different || highlighted.has(r.path) ? "bg-orange-50" : "",
                      )}
                    >
                      <th scope="row" className="py-1 font-normal">
                        {t(`fields.${r.key}`)}
                      </th>
                      <td>{r.declared}</td>
                      <td>
                        {r.document ?? t("notRead")}
                        {different ? (
                          <span className="ml-2 font-semibold text-red-700">{t("different")}</span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {card.consent ? (
              <p className="mt-3 text-sm">
                {t("consent", {
                  method: t(`consentMethods.${card.consent.method}`),
                  at: formatDateTime(card.consent.acceptedAt, locale),
                })}
              </p>
            ) : null}
          </Card>

          <Card>
            <CardTitle>{t("checklist")}</CardTitle>
            <ul className="mt-3 space-y-4">
              {(round?.checklist ?? []).map((item) => (
                <li
                  key={item.code}
                  id={`voce-${item.code}`}
                  className="rounded-lg border border-warm-200 p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={TONE[item.outcome]}>{t(`outcomes.${item.outcome}`)}</Badge>
                    <span className="font-medium">{t(`checklistItems.${item.code}`)}</span>
                  </div>
                  {item.reasons.length > 0 ? (
                    <ul className="mt-2 list-disc pl-5 text-sm">
                      {item.reasons.map((reason) => (
                        <li key={reason}>
                          {t.has(`checkReasons.${reason}`) ? t(`checkReasons.${reason}`) : reason}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {open ? (
                    <form
                      action={saveChecklistItem}
                      className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
                    >
                      <input type="hidden" name="requestId" value={card.id} />
                      <input type="hidden" name="code" value={item.code} />
                      <div>
                        <label htmlFor={`correction-${item.code}`} className="text-xs font-medium">
                          {t("correction")}
                        </label>
                        <input
                          id={`correction-${item.code}`}
                          name="correction"
                          defaultValue={item.correction ?? ""}
                          className={INPUT}
                        />
                      </div>
                      <div>
                        <label htmlFor={`note-${item.code}`} className="text-xs font-medium">
                          {t("note")}
                        </label>
                        <input
                          id={`note-${item.code}`}
                          name="note"
                          defaultValue={item.note ?? ""}
                          className={INPUT}
                        />
                      </div>
                      <Button type="submit" variant="outline" size="sm">
                        {t("save")}
                      </Button>
                    </form>
                  ) : (
                    <p className="mt-2 text-sm text-warm-600">
                      {[item.correction, item.note].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </Card>

          {open && card.quoteData ? (
            <>
              {preview ? (
                <Card id="agenzie">
                  <CardTitle>{t("agencies.title")}</CardTitle>
                  <p className="mt-1 text-sm text-warm-600">
                    {t("agencies.summary", {
                      count: preview.invited.length,
                      companies: preview.companies.join(", ") || "—",
                      close: formatDateTime(preview.scheduledCloseAt),
                    })}
                  </p>
                  {preview.invited.length === 0 ? (
                    <p className="mt-3 text-sm font-medium text-red-700">{t("agencies.none")}</p>
                  ) : (
                    <ul className="mt-3 divide-y divide-warm-200 text-sm">
                      {preview.invited.map((a) => (
                        <li key={a.organizationId} className="py-2">
                          <div className="font-medium">{a.name}</div>
                          <div className="text-warm-600">{a.companies.join(", ")}</div>
                          <form action={excludeAgency} className="mt-2 flex flex-wrap gap-2">
                            <input type="hidden" name="requestId" value={card.id} />
                            <input type="hidden" name="organizationId" value={a.organizationId} />
                            <label className="sr-only" htmlFor={`reason-${a.organizationId}`}>
                              {t("agencies.reason")}
                            </label>
                            <input
                              id={`reason-${a.organizationId}`}
                              name="reason"
                              required
                              minLength={3}
                              placeholder={t("agencies.reason")}
                              className="flex-1 rounded-lg border border-warm-200 px-3 py-1 text-sm"
                            />
                            <Button type="submit" variant="outline" size="sm">
                              {t("agencies.exclude")}
                            </Button>
                          </form>
                        </li>
                      ))}
                    </ul>
                  )}
                  {preview.compatibleNotChosen > 0 ? (
                    <p className="mt-2 text-xs text-warm-600">
                      {t("agencies.reserve", { count: preview.compatibleNotChosen })}
                    </p>
                  ) : null}
                  {preview.excluded.length > 0 ? (
                    <>
                      <h3 className="mt-4 text-sm font-semibold">{t("agencies.excluded")}</h3>
                      <ul className="mt-2 space-y-2 text-sm">
                        {preview.excluded.map((e) => (
                          <li
                            key={e.organizationId}
                            className="flex flex-wrap items-center justify-between gap-2"
                          >
                            <span>
                              {e.name} · <span className="text-warm-600">{e.reason}</span>
                            </span>
                            <form action={includeAgency}>
                              <input type="hidden" name="requestId" value={card.id} />
                              <input type="hidden" name="organizationId" value={e.organizationId} />
                              <Button type="submit" variant="outline" size="sm">
                                {t("agencies.include")}
                              </Button>
                            </form>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </Card>
              ) : null}

              <Card>
                <CardTitle>{t("decisions")}</CardTitle>
                <form
                  action={approve}
                  className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"
                >
                  <input type="hidden" name="requestId" value={card.id} />
                  <div className="flex-1">
                    <label htmlFor="approve-note" className="text-sm font-medium">
                      {t("approveNote")}
                    </label>
                    <input id="approve-note" name="note" className={INPUT} />
                  </div>
                  <Button type="submit">{t("approve")}</Button>
                </form>
              </Card>

              <Card>
                <CardTitle>{t("integrationTitle")}</CardTitle>
                <form action={requestIntegration} className="mt-3 space-y-3 text-sm">
                  <input type="hidden" name="requestId" value={card.id} />
                  <fieldset>
                    <legend className="font-medium">{t("reasons")}</legend>
                    <div className="mt-2 grid gap-1 sm:grid-cols-2">
                      {card.reasons.integration.map((r) => (
                        <label key={r.code} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            name="reasonCodes"
                            value={r.code}
                            className="h-4 w-4"
                          />
                          {r[locale]}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset>
                    <legend className="font-medium">{t("sectionsToChange")}</legend>
                    <div className="mt-2 grid gap-1 sm:grid-cols-3">
                      {SECTIONS.map((s) => (
                        <label key={s} className="flex items-center gap-2">
                          <input type="checkbox" name="sections" value={s} className="h-4 w-4" />
                          {t(`sections.${s}`)}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset>
                    <legend className="font-medium">{t("documentsToUpload")}</legend>
                    <div className="mt-2 grid gap-1 sm:grid-cols-2">
                      {DOCUMENT_KINDS.map((k) => (
                        <label key={k} className="flex items-center gap-2">
                          <input type="checkbox" name="documents" value={k} className="h-4 w-4" />
                          {t(`documentKinds.${k}`)}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div>
                    <label htmlFor="integration-message" className="font-medium">
                      {t("messageToRequester")}
                    </label>
                    <textarea id="integration-message" name="message" rows={3} className={INPUT} />
                  </div>
                  <Button type="submit" variant="secondary">
                    {t("askIntegration")}
                  </Button>
                </form>
              </Card>

              <Card>
                <CardTitle>{t("excludeTitle")}</CardTitle>
                <form action={exclude} className="mt-3 space-y-3 text-sm">
                  <input type="hidden" name="requestId" value={card.id} />
                  <div>
                    <label htmlFor="exclude-reason" className="font-medium">
                      {t("excludeReason")}
                    </label>
                    <select id="exclude-reason" name="reasonCode" required className={INPUT}>
                      {card.reasons.exclusion.map((r) => (
                        <option key={r.code} value={r.code}>
                          {r[locale]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="exclude-message" className="font-medium">
                      {t("messageToRequester")}
                    </label>
                    <textarea id="exclude-message" name="message" rows={2} className={INPUT} />
                  </div>
                  <Button type="submit" variant="danger">
                    {t("exclude")}
                  </Button>
                </form>
              </Card>

              <Card>
                <CardTitle>{t("correctTitle")}</CardTitle>
                <p className="mt-1 text-sm text-warm-600">{t("correctIntro")}</p>
                <form action={correct} className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                  <input type="hidden" name="requestId" value={card.id} />
                  {(
                    [
                      ["vehicle.make", card.quoteData.vehicle.make, "text"],
                      ["vehicle.model", card.quoteData.vehicle.model, "text"],
                      ["vehicle.version", card.quoteData.vehicle.version ?? "", "text"],
                      ["vehicle.powerKw", String(card.quoteData.vehicle.powerKw), "number"],
                      [
                        "vehicle.firstRegistrationDate",
                        card.quoteData.vehicle.firstRegistrationDate,
                        "date",
                      ],
                      [
                        "history.cuClass",
                        card.quoteData.history.cuClass?.toString() ?? "",
                        "number",
                      ],
                      [
                        "history.currentInsurer",
                        card.quoteData.history.currentInsurer ?? "",
                        "text",
                      ],
                      [
                        "history.currentExpiryDate",
                        card.quoteData.history.currentExpiryDate ?? "",
                        "date",
                      ],
                    ] as const
                  ).map(([name, current, type]) => (
                    <div key={name}>
                      <label htmlFor={`fix-${name}`} className="font-medium">
                        {t(`correctFields.${name.replace(".", "_")}`)}
                      </label>
                      <input
                        id={`fix-${name}`}
                        name={name}
                        type={type}
                        defaultValue={current}
                        className={INPUT}
                      />
                    </div>
                  ))}
                  <div className="sm:col-span-2">
                    <label htmlFor="fix-reason" className="font-medium">
                      {t("correctReason")}
                    </label>
                    <input id="fix-reason" name="reason" required minLength={3} className={INPUT} />
                  </div>
                  <div className="sm:col-span-2">
                    <Button type="submit" variant="outline">
                      {t("saveCorrection")}
                    </Button>
                  </div>
                </form>
              </Card>
            </>
          ) : null}

          <Card>
            <CardTitle>{t("versions")}</CardTitle>
            <ul className="mt-3 space-y-1 text-sm">
              {card.versions.map((v) => (
                <li key={v.version}>
                  {t("versionLine", {
                    version: v.version,
                    source: t(`sources.${v.source}`),
                    at: formatDateTime(v.createdAt, locale),
                  })}
                  {v.changedFields.length > 0 ? (
                    <span className="ml-2 text-warm-600">{v.changedFields.join(", ")}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardTitle>{t("timeline")}</CardTitle>
            <ol className="mt-3 space-y-1 text-sm">
              {card.timeline.map((e, i) => (
                <li key={`${e.type}-${i}`} className="flex gap-3">
                  <time dateTime={e.at} className="w-40 shrink-0 text-warm-600 tabular">
                    {formatDateTime(e.at, locale)}
                  </time>
                  <span>{t(`timelineEvents.${e.type}`)}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
