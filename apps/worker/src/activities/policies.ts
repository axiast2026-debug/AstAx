import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  createRenewalDraft,
  settingsAt,
  SYSTEM_CONTEXT,
  withContext,
  type DbTransaction,
} from "@astax/db";
import { addCalendarDays, renewalNoticeDate, romeInstant, surveyDate } from "@astax/shared/domain";
import { dbDateToCalendarDate, formatDate, romeCalendarDate } from "@astax/shared/format";
import type { PendingEmail } from "../notifier.js";
import { quoteDataOf, requesterOf, vehicleForRequester, type ActivityDeps } from "./support.js";
import type { AuctionActivities, PolicySteps } from "./types.js";

type PolicyStep = "SURVEY" | "RENEWAL_NOTICE" | "EXPIRY";

/** The hour of the day (Rome) the notices of a calendar day go out: a sending time, not a rule. */
const NOTICE_TIME = "09:00";

/**
 * PolicyWorkflow's steps (decision 39), each once, recorded by the data:
 * the questionnaire `survey.daysAfterIssuance` after the issuance (a
 * PostSaleSurvey row); the renewal notice `renewal.daysBefore` before the
 * end (the policy «In scadenza»), with the renewal draft for a broker's
 * customer with the automatic renewal (proposal E of phase 6); the end of
 * the policy (the day after its last day, 00:00 in Rome) «Scaduta».
 */
export function policyActivities(
  deps: ActivityDeps,
): Pick<AuctionActivities, "policySteps" | "runPolicyStep"> {
  const { db, clock, cipher, notifier, urls, storage } = deps;

  async function stepsOf(tx: DbTransaction, requestId: string) {
    const policy = await tx.policy.findUnique({ where: { quoteRequestId: requestId } });
    if (!policy || !["ACTIVE", "EXPIRING"].includes(policy.status)) return { policy, steps: [] };
    const s = await settingsAt(tx, ["survey.daysAfterIssuance", "renewal.daysBefore"], clock.now());
    const survey = await tx.postSaleSurvey.findUnique({ where: { policyId: policy.id } });
    const end = dbDateToCalendarDate(policy.endDate);
    const steps: { kind: PolicyStep; at: Date; done: boolean }[] = [
      {
        kind: "SURVEY",
        at: romeInstant(
          surveyDate(romeCalendarDate(policy.issuedAt), s["survey.daysAfterIssuance"]),
          NOTICE_TIME,
        ),
        done: survey !== null,
      },
      {
        kind: "RENEWAL_NOTICE",
        at: romeInstant(renewalNoticeDate(end, s["renewal.daysBefore"]), NOTICE_TIME),
        done: policy.status === "EXPIRING",
      },
      { kind: "EXPIRY", at: romeInstant(addCalendarDays(end, 1), "00:00"), done: false },
    ];
    return { policy, steps: steps.filter((x) => !x.done).sort((a, b) => +a.at - +b.at) };
  }

  async function policySteps(input: { requestId: string }): Promise<PolicySteps> {
    return withContext(db, SYSTEM_CONTEXT, async (tx) => {
      const { policy, steps } = await stepsOf(tx, input.requestId);
      return {
        active: policy !== null && steps.length > 0,
        nextStepAt: steps[0]?.at.toISOString() ?? null,
      };
    });
  }

  /** The broker's customer for the questionnaire, or the private requester (spec «survey.post_sale»). */
  async function surveyRecipient(
    tx: DbTransaction,
    request: Awaited<ReturnType<DbTransaction["quoteRequest"]["findUniqueOrThrow"]>>,
  ): Promise<{ emails: string[]; name: string }> {
    if (request.channel === "PRIVATE") {
      const r = await requesterOf(tx, cipher, request);
      return { emails: r.recipients.flatMap((x) => (x.email ? [x.email] : [])), name: r.firstName };
    }
    const customer = request.customerId
      ? await tx.customer.findUnique({
          where: { id: request.customerId },
          include: { person: true },
        })
      : null;
    if (!customer?.emailEnc) return { emails: [], name: "" };
    return {
      emails: [cipher.decrypt(customer.emailEnc)],
      name: customer.person.givenName ?? customer.person.companyName ?? "",
    };
  }

  async function runPolicyStep(input: { requestId: string; force: boolean }): Promise<void> {
    const pending: PendingEmail[] = [];
    await withContext(db, SYSTEM_CONTEXT, async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "Policy" WHERE "quoteRequestId" = ${input.requestId}::uuid FOR UPDATE`;
      const now = clock.now();
      const { policy, steps } = await stepsOf(tx, input.requestId);
      const step = steps[0];
      if (!policy || !step || (step.at > now && !input.force)) return;
      const request = await tx.quoteRequest.findUniqueOrThrow({ where: { id: input.requestId } });
      const quoteData = await quoteDataOf(tx, cipher, request);
      const vehicle = vehicleForRequester(quoteData);
      const end = formatDate(dbDateToCalendarDate(policy.endDate));

      if (step.kind === "SURVEY") {
        const token = randomBytes(32).toString("base64url");
        await tx.postSaleSurvey.create({
          data: {
            policyId: policy.id,
            tokenHash: createHash("sha256").update(token).digest("hex"),
            sentAt: now,
            createdAt: now,
            updatedAt: now,
          },
        });
        // Email only (survey.post_sale): the customer of a broker has no account.
        const { emails, name } = await surveyRecipient(tx, request);
        for (const to of emails) {
          await notifier.queueEmail(tx, pending, {
            to,
            eventKey: "survey.post_sale",
            variables: { nome: name, veicolo: vehicle, link: `${urls.web}/questionario/${token}` },
            locale: "it",
            ids: { policyId: policy.id },
          });
        }
        return;
      }

      if (step.kind === "RENEWAL_NOTICE") {
        await tx.policy.update({
          where: { id: policy.id },
          data: { status: "EXPIRING", updatedAt: now },
        });
        const requester = await requesterOf(tx, cipher, request);
        if (request.channel === "PRIVATE") {
          await notifier.notify(
            tx,
            pending,
            requester.recipients,
            "renewal.upcoming",
            () => ({
              nome: requester.firstName,
              veicolo: vehicle,
              scadenza: end,
              link: `${urls.web}/polizze`,
            }),
            "/polizze",
            { policyId: policy.id },
          );
          return;
        }
        // Proposal E: the automatic renewal of a broker's customer prepares the
        // draft; the auction starts once the new risk certificate is uploaded.
        let link = `${urls.web}/rinnovi`;
        if (policy.autoRenewal) {
          const draft = await createRenewalDraft(
            tx,
            cipher,
            async (key, mime) => {
              const copy = `renewals/${randomUUID()}`;
              await storage.put({ key: copy, body: await storage.get(key), contentType: mime });
              return copy;
            },
            { policyId: policy.id, actorKind: "SYSTEM", actorUserId: null },
            now,
          );
          link = `${urls.web}/richieste/${draft.requestId}`;
        }
        const customer = request.customerId
          ? await tx.customer.findUnique({
              where: { id: request.customerId },
              include: { person: true },
            })
          : null;
        const client = customer
          ? (customer.person.companyName ??
            `${customer.person.givenName ?? ""} ${customer.person.surname ?? ""}`.trim())
          : "";
        const auto = notifier.label(
          policy.autoRenewal ? "renewal.autoDraftReady" : "renewal.autoOff",
          "it",
        );
        await notifier.notify(
          tx,
          pending,
          requester.recipients,
          "renewal.upcoming.broker",
          () => ({
            cliente: client,
            veicolo: vehicle,
            scadenza: end,
            rinnovo_automatico: auto,
            link,
          }),
          new URL(link).pathname,
          { policyId: policy.id },
        );
        return;
      }

      // EXPIRY: the policy is over (a renewal, if any, is its own request and policy).
      await tx.policy.update({
        where: { id: policy.id },
        data: { status: "EXPIRED", updatedAt: now },
      });
    });
    await notifier.flush(pending);
  }

  return { policySteps, runPolicyStep };
}
