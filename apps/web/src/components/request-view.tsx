import { formatDateTime } from "@astax/shared/format";
import { Badge, Button, Card, CardTitle } from "@astax/ui";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { cancelRequest } from "@/app/request-actions";
import { ErrorSummary } from "@/components/form";
import { holderName } from "@/components/wizard/drivers-step";
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
        ) ?? (detail.integration?.documents.includes("DRIVING_LICENCE") ? "conducenti" : "veicolo"))
      : (steps[0] ?? "veicolo");
  const approved = detail.lastDecision?.decision === "APPROVED";

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
