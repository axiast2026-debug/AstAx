import type { Clock } from "@astax/adapters/clock";
import type { FieldCipher } from "@astax/adapters/crypto";
import { asSystem, withContext, type DbClient, type DbTransaction } from "@astax/db";
import { isValidIban } from "@astax/shared/domain";
import { Inject, Injectable } from "@nestjs/common";
import { z } from "zod";
import { actorOf, AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../auth/auth-context.js";
import { ProblemError } from "../http/problem.js";
import { parseInput } from "../http/validation.js";
import { CLOCK, DB, FIELD_CIPHER } from "../infra/tokens.js";
import { ConsentService } from "../requests/consent.service.js";

const phone = z
  .string()
  .transform((v) => v.replace(/\s/g, ""))
  .pipe(z.string().regex(/^\+?\d{8,15}$/));

export const IbanCodeInputSchema = z.strictObject({ phone: phone.optional() });

export const IbanConfirmInputSchema = z.strictObject({
  iban: z
    .string()
    .transform((v) => v.replace(/\s+/g, "").toUpperCase())
    .refine(isValidIban, { message: "INVALID_IBAN" }),
  code: z.string().regex(/^\d{6}$/),
  phone: phone.optional(),
});

const masked = (value: string) => `•••• ${value.slice(-3)}`;

/**
 * Dan, 2026-10-29 (docs/piano-agenzia-filtri-richiesta.md): the IBAN of the
 * agency is asked the first time someone of the agency sends an offer, to
 * whoever sends it (a sub-agent too), with a code by SMS to their own phone
 * (SIC-05 codes). Until then the offer is refused with IBAN_REQUIRED.
 */
@Injectable()
export class AgencyIbanService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ConsentService) private readonly codes: ConsentService,
  ) {}

  private agency(auth: AuthContext) {
    const m = auth.membership;
    if (!m || m.organizationType !== "AGENCY") throw new ProblemError("NOT_FOUND");
    return m;
  }

  /**
   * Only the first time: an IBAN already given is never replaced here (a
   * change of the IBAN is the owner's, with `organization.editProfile`).
   * Without this any user of the agency could redirect its remittances.
   */
  private async notYetGiven(tx: DbTransaction, organizationId: string) {
    await tx.$queryRaw`SELECT 1 FROM "Organization" WHERE "id" = ${organizationId}::uuid FOR UPDATE`;
    const organization = await tx.organization.findUniqueOrThrow({ where: { id: organizationId } });
    if (organization.ibanEnc !== null) {
      throw new ProblemError("CONFLICT", "The IBAN of the agency is already set", [
        { path: "iban", issue: "IBAN_ALREADY_SET" },
      ]);
    }
  }

  /** Whether the agency still has to give its IBAN, and the phone the code goes to. */
  async status(auth: AuthContext) {
    const m = this.agency(auth);
    return withContext(this.db, auth.db, async (tx) => {
      const [organization, user] = await asSystem(tx, () =>
        Promise.all([
          tx.organization.findUniqueOrThrow({ where: { id: m.organizationId } }),
          tx.user.findUniqueOrThrow({ where: { id: auth.userId } }),
        ]),
      );
      return {
        required: organization.ibanEnc === null,
        phone: user.phoneEnc ? masked(this.cipher.decrypt(user.phoneEnc)) : null,
      };
    });
  }

  /** The user's mobile phone; one typed now is saved as theirs (it receives the code). */
  private async phoneOf(auth: AuthContext, typed: string | undefined): Promise<string> {
    return withContext(this.db, auth.db, (tx) =>
      asSystem(tx, async () => {
        const user = await tx.user.findUniqueOrThrow({ where: { id: auth.userId } });
        if (user.phoneEnc) return this.cipher.decrypt(user.phoneEnc);
        if (!typed) {
          throw new ProblemError("VALIDATION_FAILED", "A mobile phone is needed", [
            { path: "phone", issue: "PHONE_REQUIRED" },
          ]);
        }
        await tx.user.update({
          where: { id: auth.userId },
          data: {
            phoneEnc: this.cipher.encrypt(typed),
            phoneHash: this.cipher.blindIndex("phone", typed),
          },
        });
        return typed;
      }),
    );
  }

  async sendCode(auth: AuthContext, raw: unknown) {
    const m = this.agency(auth);
    const input = parseInput(IbanCodeInputSchema, raw);
    await withContext(this.db, auth.db, (tx) =>
      asSystem(tx, () => this.notYetGiven(tx, m.organizationId)),
    );
    const to = await this.phoneOf(auth, input.phone);
    const now = this.clock.now();
    const challenge = await withContext(this.db, auth.db, (tx) =>
      asSystem(tx, () =>
        this.codes.newChallenge(
          tx,
          "OFFER_IBAN",
          m.organizationId,
          { ownerUserId: auth.userId, ownerOrganizationId: m.organizationId },
          now,
        ),
      ),
    );
    await this.codes.sendCode(
      { email: null, phone: to },
      "OFFER_IBAN",
      challenge.code,
      challenge.minutes,
      {
        organizationId: m.organizationId,
      },
    );
  }

  async confirm(auth: AuthContext, raw: unknown) {
    const m = this.agency(auth);
    const input = parseInput(IbanConfirmInputSchema, raw);
    const now = this.clock.now();
    const outcome = await withContext(this.db, auth.db, (tx) =>
      asSystem(tx, async () => {
        await this.notYetGiven(tx, m.organizationId);
        const challenge = await this.codes.verifyChallenge(
          tx,
          "OFFER_IBAN",
          m.organizationId,
          input.code,
          now,
        );
        if (!challenge) return null;
        await tx.organization.update({
          where: { id: m.organizationId },
          data: { ibanEnc: this.cipher.encrypt(input.iban), updatedAt: now },
        });
        await this.audit.inTransaction(tx, actorOf(auth), {
          action: "ORGANIZATION_IBAN_SET",
          targetType: "Organization",
          targetId: m.organizationId,
          after: { otpChallengeId: challenge.id },
        });
        return challenge.id;
      }),
    );
    if (!outcome) {
      await this.audit.record(actorOf(auth), {
        action: "OTP_FAILED",
        targetType: "Organization",
        targetId: m.organizationId,
      });
      throw new ProblemError("VALIDATION_FAILED", "Wrong or expired code", [
        { path: "code", issue: "OTP_INVALID" },
      ]);
    }
    return { required: false };
  }
}
