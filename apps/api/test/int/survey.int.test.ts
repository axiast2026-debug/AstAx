import { createHash, randomBytes, randomUUID } from "node:crypto";
import { SYSTEM_CONTEXT, withContext } from "@astax/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { acceptAllLegal, membershipId, orgId, startHarness, type Harness } from "./fixtures.js";
import { requestHelpers } from "./request-helpers.js";

// Phase 6, step 12: the questionnaire after the sale, from the emailed link
// (no account). A «sì» to «contacted outside AstAx» opens a circumvention
// flag for the back office (spec 06 «Segnalazioni»).
let h: Harness;
let r: ReturnType<typeof requestHelpers>;
const system = <T>(work: Parameters<typeof withContext<T>>[2]) =>
  withContext(h.db, SYSTEM_CONTEXT, work);

async function surveyFor(agency: string) {
  const token = randomBytes(32).toString("base64url");
  const owner = randomUUID();
  const policy = await system(async (tx) => {
    const request = await tx.quoteRequest.create({
      data: {
        code: `AX-T-${randomUUID().slice(0, 8)}`,
        channel: "PRIVATE",
        requesterUserId: owner,
        ownerUserId: owner,
      },
    });
    const policy = await tx.policy.create({
      data: {
        quoteRequestId: request.id,
        offerId: randomUUID(),
        acceptanceId: randomUUID(),
        organizationId: orgId(agency),
        companyId: randomUUID(),
        policyNumber: `Q-${randomUUID().slice(0, 8)}`,
        startDate: new Date("2026-11-20"),
        endDate: new Date("2027-11-19"),
        premiumCents: 50_000,
        issuedAt: h.clock.now(),
        issuedByUserId: randomUUID(),
      },
    });
    await tx.postSaleSurvey.create({
      data: {
        policyId: policy.id,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        sentAt: h.clock.now(),
      },
    });
    return policy;
  });
  return { token, policy };
}

beforeAll(async () => {
  h = await startHarness();
  r = requestHelpers(h);
  await acceptAllLegal(h, "bo-supervisor");
});

afterAll(async () => {
  await h.close();
});

describe("the questionnaire after the sale", () => {
  it("answered once from the link; «sì» opens a circumvention flag with the request and the agency", async () => {
    const { token, policy } = await surveyFor("agenzia-due");
    expect(await (await h.call(`/surveys/${token}`)).json()).toEqual({ answered: false });
    const answers = { overall: 5, clarity: 4, agency: 2, contactedByOthers: true };
    expect((await h.call(`/surveys/${token}`, { body: answers })).status).toBe(200);
    expect((await h.call(`/surveys/${token}`, { body: answers })).status).toBe(409);
    const [survey, flag] = await system((tx) =>
      Promise.all([
        tx.postSaleSurvey.findUniqueOrThrow({ where: { policyId: policy.id } }),
        tx.flag.findFirst({ where: { quoteRequestId: policy.quoteRequestId } }),
      ]),
    );
    expect(survey.answers).toEqual({ overall: 5, clarity: 4, agency: 2 });
    expect(flag).toMatchObject({
      type: "CIRCUMVENTION",
      source: "SURVEY",
      organizationId: orgId("agenzia-due"),
      status: "OPEN",
    });
    const supervisor = {
      token: await h.tokenFor("bo-supervisor"),
      context: membershipId("bo-supervisor", "astax"),
    };
    const listed = await r.json<{ id: string; agency: string | null }[]>(
      await r.call(supervisor, "/back-office/flags"),
      200,
    );
    expect(listed.find((f) => f.id === flag?.id)?.agency).toBe("Agenzia Due");
    await r.json(
      await r.call(supervisor, `/back-office/flags/${flag?.id ?? ""}/decide`, {
        body: { status: "PENALTY_PROPOSED", outcome: "Contatto diretto confermato dal cliente" },
      }),
      200,
    );
  });

  it("«no»: no flag; a wrong token is 404", async () => {
    const { token, policy } = await surveyFor("agenzia-due");
    await h.call(`/surveys/${token}`, {
      body: { overall: 4, clarity: 4, agency: 5, contactedByOthers: false },
    });
    expect(
      await system((tx) => tx.flag.count({ where: { quoteRequestId: policy.quoteRequestId } })),
    ).toBe(0);
    // A link older than survey.linkValidDays no longer opens.
    const old = await surveyFor("agenzia-due");
    await system((tx) =>
      tx.postSaleSurvey.update({
        where: { policyId: old.policy.id },
        data: { sentAt: new Date(h.clock.now().getTime() - 31 * 86_400_000) },
      }),
    );
    expect((await h.call(`/surveys/${old.token}`)).status).toBe(404);
    // Two answers sent at the same moment: one is kept, and one flag only.
    const twice = await surveyFor("agenzia-due");
    const yes = { overall: 3, clarity: 3, agency: 3, contactedByOthers: true };
    const statuses = await Promise.all([
      h.call(`/surveys/${twice.token}`, { body: yes }),
      h.call(`/surveys/${twice.token}`, { body: yes }),
    ]).then((rs) => rs.map((x) => x.status).sort());
    expect(statuses).toEqual([200, 409]);
    expect(
      await system((tx) =>
        tx.flag.count({ where: { quoteRequestId: twice.policy.quoteRequestId } }),
      ),
    ).toBe(1);
    const wrong = randomBytes(32).toString("base64url");
    expect((await h.call(`/surveys/${wrong}`)).status).toBe(404);
  });
});
