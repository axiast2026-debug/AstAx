import type { Clock } from "@astax/adapters/clock";
import type { FieldCipher } from "@astax/adapters/crypto";
import { asSystem, withContext, type DbClient, type DbTransaction } from "@astax/db";
import { Inject, Injectable } from "@nestjs/common";
import { z } from "zod";
import { IbanCodeInputSchema, IbanConfirmInputSchema } from "../agency/agency-iban.service.js";
import { actorOf, AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../auth/auth-context.js";
import type { ApiConfig } from "../config/config.js";
import { ProblemError } from "../http/problem.js";
import { parseInput } from "../http/validation.js";
import { CLOCK, CONFIG, DB, FIELD_CIPHER } from "../infra/tokens.js";
import { NotificationService } from "../notifications/notification.service.js";
import { ConsentService } from "../requests/consent.service.js";

export const ProfileInputSchema = z.strictObject({
  pec: z.email().max(254).optional(),
  address: z
    .strictObject({
      street: z.string().trim().min(1).max(200),
      postalCode: z.string().regex(/^\d{5}$/),
      municipalityIstat: z.string().regex(/^\d{6}$/),
    })
    .optional(),
});

export const MandatesRequestSchema = z.strictObject({
  text: z.string().trim().min(5).max(2000),
});

interface StoredAddress {
  street: string;
  postalCode: string;
  municipalityIstat: string;
  province?: string;
}

const masked = (iban: string) => `${iban.slice(0, 4)} •••• ${iban.slice(-4)}`;

/**
 * Audit of 2026-10-30 (A3), spec 02 and 04 «Impostazioni», docs/permessi.md:
 * the owner of an agency or a broker (a section E owner too) sees the data of
 * the organization, changes PEC and registered office, changes the IBAN with a
 * code by SMS to their own phone, and asks the back office to change the
 * mandates (they are checked on the RUI). Name, VAT number and RUI come from
 * the verified registration and are not changed here.
 */
@Injectable()
export class OrganizationSettingsService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(CONFIG) private readonly config: ApiConfig,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(NotificationService) private readonly notifications: NotificationService,
    @Inject(ConsentService) private readonly codes: ConsentService,
  ) {}

  private membership(auth: AuthContext) {
    const m = auth.membership;
    if (!m || (m.organizationType !== "AGENCY" && m.organizationType !== "BROKER")) {
      throw new ProblemError("NOT_FOUND");
    }
    return m;
  }

  private async read(tx: DbTransaction, organizationId: string) {
    const o = await tx.organization.findUniqueOrThrow({ where: { id: organizationId } });
    const address = o.address as StoredAddress | null;
    const [municipality, mandates] = await Promise.all([
      address
        ? tx.municipality.findUnique({ where: { istatCode: address.municipalityIstat } })
        : Promise.resolve(null),
      o.type === "AGENCY"
        ? tx.agencyMandate.findMany({
            where: { organizationId },
            include: { company: { select: { name: true } } },
            orderBy: { createdAt: "asc" },
          })
        : Promise.resolve([]),
    ]);
    return {
      type: o.type,
      legalName: o.legalName,
      vatNumber: o.vatNumber,
      ruiNumber: o.ruiNumber,
      ruiSection: o.ruiSection,
      principalRuiNumber: o.principalRuiNumber,
      pec: o.pec,
      address: address
        ? {
            street: address.street,
            postalCode: address.postalCode,
            municipalityIstat: address.municipalityIstat,
            municipality: municipality?.name ?? "",
            province: municipality?.province ?? address.province ?? "",
          }
        : null,
      iban: o.ibanEnc ? masked(this.cipher.decrypt(o.ibanEnc)) : null,
      mandates: mandates.map((x) => ({
        company: x.company.name,
        verified: x.verifiedAt !== null,
      })),
    };
  }

  async view(auth: AuthContext) {
    const m = this.membership(auth);
    return withContext(this.db, auth.db, (tx) =>
      asSystem(tx, async () => {
        const user = await tx.user.findUniqueOrThrow({ where: { id: auth.userId } });
        const phone = user.phoneEnc ? this.cipher.decrypt(user.phoneEnc) : null;
        return {
          ...(await this.read(tx, m.organizationId)),
          // Where the code for the IBAN goes: the owner's own mobile, masked.
          phone: phone ? `•••• ${phone.slice(-3)}` : null,
        };
      }),
    );
  }

  async updateProfile(auth: AuthContext, raw: unknown) {
    const m = this.membership(auth);
    const input = parseInput(ProfileInputSchema, raw);
    const now = this.clock.now();
    return withContext(this.db, auth.db, (tx) =>
      asSystem(tx, async () => {
        let address: StoredAddress | undefined;
        if (input.address) {
          const municipality = await tx.municipality.findUnique({
            where: { istatCode: input.address.municipalityIstat },
          });
          if (!municipality) {
            throw new ProblemError("VALIDATION_FAILED", "Unknown municipality", [
              { path: "address.municipality", issue: "UNKNOWN_MUNICIPALITY" },
            ]);
          }
          address = { ...input.address, province: municipality.province };
        }
        await tx.organization.update({
          where: { id: m.organizationId },
          data: {
            ...(input.pec !== undefined ? { pec: input.pec } : {}),
            ...(address ? { address: { ...address } as Record<string, string> } : {}),
            updatedAt: now,
          },
        });
        await this.audit.inTransaction(tx, actorOf(auth), {
          action: "ORGANIZATION_PROFILE_UPDATED",
          targetType: "Organization",
          targetId: m.organizationId,
          after: { fields: [...(input.pec ? ["pec"] : []), ...(address ? ["address"] : [])] },
        });
        return this.read(tx, m.organizationId);
      }),
    );
  }

  /** The owner's mobile phone; one typed now is saved as theirs (it receives the code). */
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

  /** docs/permessi.md: a change of IBAN with a code (SIC-05) and the audit log. */
  async sendIbanCode(auth: AuthContext, raw: unknown) {
    const m = this.membership(auth);
    const input = parseInput(IbanCodeInputSchema, raw);
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
      { organizationId: m.organizationId },
    );
  }

  async changeIban(auth: AuthContext, raw: unknown) {
    const m = this.membership(auth);
    const input = parseInput(IbanConfirmInputSchema, raw);
    const now = this.clock.now();
    const outcome = await withContext(this.db, auth.db, (tx) =>
      asSystem(tx, async () => {
        const challenge = await this.codes.verifyChallenge(
          tx,
          "OFFER_IBAN",
          m.organizationId,
          input.code,
          now,
        );
        if (!challenge) return null;
        const before = await tx.organization.findUniqueOrThrow({
          where: { id: m.organizationId },
          select: { ibanEnc: true },
        });
        await tx.organization.update({
          where: { id: m.organizationId },
          data: { ibanEnc: this.cipher.encrypt(input.iban), updatedAt: now },
        });
        await this.audit.inTransaction(tx, actorOf(auth), {
          action: "ORGANIZATION_IBAN_SET",
          targetType: "Organization",
          targetId: m.organizationId,
          after: { otpChallengeId: challenge.id, changed: before.ibanEnc !== null },
        });
        return this.read(tx, m.organizationId);
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
    return outcome;
  }

  /**
   * Mandates are checked on the RUI: the owner asks, the back office decides.
   * The request is a note on the organization, and the supervisors are told.
   */
  async requestMandates(auth: AuthContext, raw: unknown) {
    const m = this.membership(auth);
    const input = parseInput(MandatesRequestSchema, raw);
    const now = this.clock.now();
    const sent = await withContext(this.db, auth.db, (tx) =>
      asSystem(tx, async () => {
        const o = await tx.organization.findUniqueOrThrow({ where: { id: m.organizationId } });
        const note = await tx.organizationNote.create({
          data: {
            organizationId: o.id,
            kind: "NOTE",
            text: input.text,
            authorUserId: auth.userId,
            createdAt: now,
          },
        });
        await this.audit.inTransaction(tx, actorOf(auth), {
          action: "ORGANIZATION_MANDATES_REQUESTED",
          targetType: "Organization",
          targetId: o.id,
          after: { noteId: note.id },
        });
        const supervisors = await tx.user.findMany({
          where: {
            status: "ACTIVE",
            memberships: {
              some: {
                status: "ACTIVE",
                role: "BO_SUPERVISOR",
                organization: { type: "ASTAX" },
              },
            },
          },
        });
        const outbound = await this.notifications.deliver(
          tx,
          supervisors.map((u) => ({
            userId: u.id,
            email: u.emailEnc ? this.cipher.decrypt(u.emailEnc) : null,
            phone: null,
          })),
          "organization.mandates_requested.bo",
          () => ({
            organizzazione: o.legalName,
            link: `${this.config.ADMIN_URL}/organizzazioni/${o.id}`,
          }),
          `/organizzazioni/${o.id}`,
          { organizationId: o.id },
        );
        return { outbound, id: note.id };
      }),
    );
    await this.notifications.send(sent.outbound);
    return { id: sent.id };
  }
}
