import { missingChecks, type QuoteType } from "@astax/shared/domain";
import { formatDateTime, formatTime } from "@astax/shared/format";
import { Badge, Button, Card, CardTitle, cn, Icon } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/app-shell";
import { AgencySheet } from "@/components/agency-sheet";
import { CompletionForm } from "@/components/completion-form";
import { DocumentViewer } from "@/components/document-viewer";
import { VerificationChecks } from "@/components/verification-checks";
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
  release,
  requestIntegration,
  saveChecklistItem,
} from "../actions";

/** The type of quote each provenance suggests, before the operator confirms it. */
const QUOTE_TYPE_OF_PROVENANCE: Record<string, QuoteType> = {
  FROM_OTHER_COMPANY: "RENEWAL",
  FIRST_REGISTRATION: "NEW_VEHICLE",
  USED_WITHOUT_OWN_CERTIFICATE: "NEW_VEHICLE",
  FAMILY_RC: "FAMILY_CLASS",
};
/** The documents the operator checks first (Dan, 2026-10-28), then the others. */
const VIEWER_ORDER = ["REGISTRATION_CERTIFICATE", "IDENTITY_DOCUMENT"];

interface AgencyPreview {
  scheduledCloseAt: string;
  invited: { organizationId: string; name: string; companies: string[] }[];
  companies: string[];
  compatibleNotChosen: number;
  excluded: { organizationId: string; name: string; reason: string }[];
}

const TONE = { GREEN: "success", YELLOW: "warning", RED: "danger" } as const;
/** The checklist icons (back office of the design). */
const OUTCOME_ICON = {
  GREEN: { name: "checkCircle", className: "text-green-700" },
  YELLOW: { name: "warning", className: "text-warning-700" },
  RED: { name: "close", className: "text-red-700" },
} as const;
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
  "IDENTITY_DOCUMENT",
  "FISCAL_CODE_CARD",
  "CONSENT_FORM",
  "OTHER",
] as const;
const INPUT =
  "mt-1 block min-h-11 w-full rounded-lg border border-warm-600 bg-white px-3 py-2 text-sm focus-visible:border-night-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-night-100";
/** A checkbox with its label: 44 px to the finger (WCAG 2.5.8), 20 px to the eye. */
const CHECK_ROW = "flex min-h-11 items-center gap-3";
const CHECK = "size-5 shrink-0 accent-night-900";

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

  // Dan, 2026-10-28: only the holder decides; nobody holding it, the first action takes it.
  const holder = round?.assignedTo ?? null;
  const mine = holder?.id === viewer.me.id;
  const supervisor =
    viewer.activeMembership?.role === "BO_SUPERVISOR" || viewer.activeMembership?.role === "ADMIN";
  const canDecide = open && (holder === null || mine);
  const checks = round?.checks ?? {};
  const missing = missingChecks(checks);

  const latestField = (kind: string, name: string) => {
    const value = [...card.documents].reverse().find((d) => d.kind === kind && d.extraction)
      ?.extraction?.fields[name]?.value;
    return typeof value === "string" ? value : null;
  };
  const owner = card.quoteData
    ? card.quoteData.vehicleOwner === "SAME_AS_POLICY_HOLDER"
      ? card.quoteData.policyHolder
      : card.quoteData.vehicleOwner
    : null;
  const candidateHolder = card.completion?.candidate.policyHolder as
    { birthDate?: string } | undefined;
  const provenance =
    card.quoteData?.history.provenance ??
    (card.completion?.candidate.history as { provenance?: string } | undefined)?.provenance;
  const facts = {
    plate: {
      declared: card.quoteData?.vehicle.plate ?? card.completion?.intake.plate ?? null,
      document: latestField("REGISTRATION_CERTIFICATE", "plate"),
    },
    birthDate: {
      declared:
        (owner?.kind === "PERSON" ? owner.birthDate : null) ?? candidateHolder?.birthDate ?? null,
      document: latestField("IDENTITY_DOCUMENT", "birthDate"),
    },
    quoteType:
      checks.QUOTE_TYPE?.value ??
      (provenance ? QUOTE_TYPE_OF_PROVENANCE[provenance] : null) ??
      null,
  };

  const kinds = [...new Set(card.documents.map((d) => d.kind))].sort(
    (a, b) => (VIEWER_ORDER.indexOf(a) + 1 || 99) - (VIEWER_ORDER.indexOf(b) + 1 || 99),
  );
  const viewerDocuments = kinds.map((kind) => {
    const files = card.documents.filter((d) => d.kind === kind);
    return {
      kind,
      label: t("viewer.tab", {
        kind: t(`documentKinds.${kind}`),
        count: files.length,
      }),
      files: files.map((d, i) => ({
        id: d.id,
        url: `/verifiche/${card.id}/documenti/${d.id}`,
        mime: d.mime,
        label: t("viewer.file", {
          n: i + 1,
          type: t(d.mime === "application/pdf" ? "viewer.pdf" : "viewer.photo"),
        }),
      })),
    };
  });

  const errors = (query.errore ?? "").split(",").filter(Boolean);

  return (
    <AppShell viewer={viewer}>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-screen font-extrabold">
          {t("cardTitle", { code: card.code })}
        </h1>
        {round ? (
          <Badge tone={TONE[round.autoOutcome]}>{t(`outcomes.${round.autoOutcome}`)}</Badge>
        ) : null}
        <span className="text-sm text-warm-600">
          {t(`channels.${card.channel}`)}
          {card.customer ? ` · ${card.customer}` : ""}
        </span>
        {card.withoutDocuments ? <Badge tone="warning">{t("withoutDocuments")}</Badge> : null}
      </div>
      {errors.length > 0 ? (
        <ul
          role="alert"
          className="mt-4 space-y-1 rounded-lg border border-red-600 bg-red-50 p-3 text-sm"
        >
          {[...new Set(errors)].map((code) => (
            <li key={code}>
              {t.has(`problems.${code}`) ? t(`problems.${code}`) : t("error", { codes: code })}
            </li>
          ))}
        </ul>
      ) : null}
      {query.fatto && ["completata", "corretta", "ania"].includes(query.fatto) ? (
        <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm">
          {t(`done.${query.fatto as "completata" | "corretta" | "ania"}`)}
        </p>
      ) : null}

      {open ? (
        <section
          aria-label={t("hold.label")}
          className={cn(
            "mt-4 flex flex-wrap items-center gap-3 rounded-2xl p-4",
            holder === null ? "bg-warning-50" : "bg-night-50",
          )}
        >
          <span className="inline-flex text-night-700">
            <Icon name="user" size={22} />
          </span>
          <p className="min-w-0 flex-1 text-sm">
            {holder === null
              ? t("hold.nobody")
              : mine
                ? t.rich("hold.mine", {
                    name: holder.name,
                    time: holder.since ? formatTime(holder.since) : "—",
                    strong: (chunks) => <strong>{chunks}</strong>,
                  })
                : t.rich("hold.colleague", {
                    name: holder.name,
                    time: holder.since ? formatTime(holder.since) : "—",
                    strong: (chunks) => <strong>{chunks}</strong>,
                  })}
          </p>
          {holder === null || (!mine && supervisor) ? (
            <form action={assignToMe}>
              <input type="hidden" name="requestId" value={card.id} />
              <Button type="submit" size="sm">
                {holder === null ? t("assignToMe") : t("hold.takeOver")}
              </Button>
            </form>
          ) : null}
          {holder !== null && (mine || supervisor) ? (
            <form action={release}>
              <input type="hidden" name="requestId" value={card.id} />
              <Button type="submit" variant="outline" size="sm">
                {t("hold.release")}
              </Button>
            </form>
          ) : null}
        </section>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-start">
        <section
          aria-labelledby="doc-title"
          className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-warm-200"
        >
          <h2 id="doc-title" className="font-display text-xl font-extrabold">
            {t("viewer.heading")}
          </h2>
          <div className="mt-3">
            <DocumentViewer
              documents={viewerDocuments}
              texts={{
                zoomOut: t("viewer.zoomOut"),
                zoomIn: t("viewer.zoomIn"),
                fullScreen: t("viewer.fullScreen"),
                none: t("viewer.none"),
                preview: t("viewer.heading"),
              }}
            />
          </div>
          <p className="mt-3 text-xs text-warm-600">{t("viewer.logged")}</p>
        </section>
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-warm-200">
          {round ? (
            <VerificationChecks
              requestId={card.id}
              checks={checks}
              facts={facts}
              canDecide={canDecide}
            />
          ) : null}
        </div>
      </div>

      <div className="mt-6">
        <AgencySheet
          requestId={card.id}
          ania={round?.ania ?? null}
          quoteData={card.quoteData}
          canDecide={canDecide}
        />
      </div>

      {open && !card.quoteData && card.completion ? (
        <div className="mt-6">
          <CompletionForm
            requestId={card.id}
            completion={card.completion}
            ania={round?.ania?.sheet ?? null}
          />
        </div>
      ) : null}

      <section aria-label={t("more.label")} className="mt-6 space-y-3">
        <details className="rounded-2xl bg-white p-4 ring-1 ring-warm-200">
          <summary className="min-h-11 cursor-pointer content-center font-semibold">
            {t("more.comparison")}
          </summary>
          <div className="mt-3">
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
                          different || highlighted.has(r.path) ? "bg-red-50 text-red-700" : "",
                        )}
                      >
                        <th scope="row" className="py-1 font-normal">
                          {t(`fields.${r.key}`)}
                        </th>
                        <td>{r.declared}</td>
                        <td>
                          {r.document ?? t("notRead")}
                          {different ? (
                            <span className="ml-2 font-semibold text-red-700">
                              {t("different")}
                            </span>
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
                    at: formatDateTime(card.consent.acceptedAt),
                  })}
                </p>
              ) : null}
            </Card>
          </div>
        </details>
        <details className="rounded-2xl bg-white p-4 ring-1 ring-warm-200">
          <summary className="min-h-11 cursor-pointer content-center font-semibold">
            {t("more.checklist")}
          </summary>
          <div className="mt-3">
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
                      <span className={cn("inline-flex", OUTCOME_ICON[item.outcome].className)}>
                        <Icon name={OUTCOME_ICON[item.outcome].name} size={20} />
                      </span>
                      <span className="font-medium">{t(`checklistItems.${item.code}`)}</span>
                      <Badge tone={TONE[item.outcome]}>{t(`outcomes.${item.outcome}`)}</Badge>
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
                      <form action={saveChecklistItem} className="mt-3 grid gap-2">
                        <input type="hidden" name="requestId" value={card.id} />
                        <input type="hidden" name="code" value={item.code} />
                        <div>
                          <label
                            htmlFor={`correction-${item.code}`}
                            className="text-xs font-medium"
                          >
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
                        <Button
                          type="submit"
                          variant="outline"
                          size="sm"
                          className="justify-self-start"
                        >
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
          </div>
        </details>
        {open && card.quoteData && preview ? (
          <details className="rounded-2xl bg-white p-4 ring-1 ring-warm-200">
            <summary className="min-h-11 cursor-pointer content-center font-semibold">
              {t("more.agencies")}
            </summary>
            <div className="mt-3">
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
            </div>
          </details>
        ) : null}
        {canDecide && card.quoteData ? (
          <details className="rounded-2xl bg-white p-4 ring-1 ring-warm-200">
            <summary className="min-h-11 cursor-pointer content-center font-semibold">
              {t("more.correct")}
            </summary>
            <div className="mt-3">
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
            </div>
          </details>
        ) : null}
        <details className="rounded-2xl bg-white p-4 ring-1 ring-warm-200">
          <summary className="min-h-11 cursor-pointer content-center font-semibold">
            {t("more.versions")}
          </summary>
          <div className="mt-3">
            <Card>
              <CardTitle>{t("versions")}</CardTitle>
              <ul className="mt-3 space-y-1 text-sm">
                {card.versions.map((v) => (
                  <li key={v.version}>
                    {t("versionLine", {
                      version: v.version,
                      source: t(`sources.${v.source}`),
                      at: formatDateTime(v.createdAt),
                    })}
                    {v.changedFields.length > 0 ? (
                      <span className="ml-2 text-warm-600">{v.changedFields.join(", ")}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </details>
        <details className="rounded-2xl bg-white p-4 ring-1 ring-warm-200">
          <summary className="min-h-11 cursor-pointer content-center font-semibold">
            {t("more.timeline")}
          </summary>
          <div className="mt-3">
            <Card>
              <CardTitle>{t("timeline")}</CardTitle>
              <ol className="mt-3 space-y-1 text-sm">
                {card.timeline.map((e, i) => (
                  <li key={`${e.type}-${i}`} className="flex gap-3">
                    <time dateTime={e.at} className="w-40 shrink-0 text-warm-600 tabular">
                      {formatDateTime(e.at)}
                    </time>
                    <span>{t(`timelineEvents.${e.type}`)}</span>
                  </li>
                ))}
              </ol>
            </Card>
          </div>
        </details>
      </section>

      {canDecide ? (
        <section
          aria-label={t("decisions")}
          className="sticky bottom-0 z-10 mt-6 rounded-t-2xl border-t border-warm-200 bg-white/95 p-4 shadow-[0_-2px_8px_rgba(11,27,51,0.08)] backdrop-blur"
        >
          <div className="flex flex-wrap items-start justify-end gap-3">
            <p className="basis-full text-sm">
              {missing.length > 0
                ? t.rich("bar.missing", {
                    count: missing.length,
                    steps: missing.map((m) => t(`checks.short.${m}`)).join(", "),
                    strong: (chunks) => <strong>{chunks}</strong>,
                  })
                : card.quoteData
                  ? t("bar.ready")
                  : t("bar.toComplete")}
            </p>
            <details className="group">
              <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-night-900 px-4 text-sm font-semibold">
                {t("bar.askDocument")}
              </summary>
              <div className="mt-3 max-w-2xl">
                {card.quoteData ? (
                  <form action={requestIntegration} className="mt-3 space-y-3 text-sm">
                    <input type="hidden" name="requestId" value={card.id} />
                    <fieldset>
                      <legend className="font-medium">{t("reasons")}</legend>
                      <div className="mt-2 grid gap-1 sm:grid-cols-2">
                        {card.reasons.integration.map((r) => (
                          <label key={r.code} className={CHECK_ROW}>
                            <input
                              type="checkbox"
                              name="reasonCodes"
                              value={r.code}
                              className={CHECK}
                            />
                            {r.it}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <fieldset>
                      <legend className="font-medium">{t("sectionsToChange")}</legend>
                      <div className="mt-2 grid gap-1 sm:grid-cols-3">
                        {SECTIONS.map((s) => (
                          <label key={s} className={CHECK_ROW}>
                            <input type="checkbox" name="sections" value={s} className={CHECK} />
                            {t(`sections.${s}`)}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <fieldset>
                      <legend className="font-medium">{t("documentsToUpload")}</legend>
                      <div className="mt-2 grid gap-1 sm:grid-cols-2">
                        {DOCUMENT_KINDS.map((k) => (
                          <label key={k} className={CHECK_ROW}>
                            <input type="checkbox" name="documents" value={k} className={CHECK} />
                            {t(`documentKinds.${k}`)}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <div>
                      <label htmlFor="integration-message" className="font-medium">
                        {t("messageToRequester")}
                      </label>
                      <textarea
                        id="integration-message"
                        name="message"
                        rows={3}
                        className={INPUT}
                      />
                    </div>
                    <Button type="submit" variant="secondary">
                      {t("askIntegration")}
                    </Button>
                  </form>
                ) : (
                  <p className="text-sm">{t("bar.integrationAfterCompletion")}</p>
                )}
              </div>
            </details>
            <details>
              <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-red-600 px-4 text-sm font-semibold text-red-700">
                {t("bar.exclude")}
              </summary>
              <div className="mt-3 max-w-xl">
                <form action={exclude} className="mt-3 space-y-3 text-sm">
                  <input type="hidden" name="requestId" value={card.id} />
                  <div>
                    <label htmlFor="exclude-reason" className="font-medium">
                      {t("excludeReason")}
                    </label>
                    <select id="exclude-reason" name="reasonCode" required className={INPUT}>
                      {card.reasons.exclusion.map((r) => (
                        <option key={r.code} value={r.code}>
                          {r.it}
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
              </div>
            </details>
            <form action={approve} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="requestId" value={card.id} />
              <label className="sr-only" htmlFor="approve-note">
                {t("approveNote")}
              </label>
              <input
                id="approve-note"
                name="note"
                placeholder={t("approveNote")}
                className="min-h-11 rounded-lg border border-warm-600 px-3 text-sm"
              />
              <Button type="submit" size="lg" disabled={missing.length > 0 || !card.quoteData}>
                {t("bar.approve")}
              </Button>
            </form>
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}
