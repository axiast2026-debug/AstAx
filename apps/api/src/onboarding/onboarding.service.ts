import { createHash, randomBytes } from "node:crypto";
import type { Clock } from "@astax/adapters/clock";
import type { FieldCipher } from "@astax/adapters/crypto";
import { KEYCLOAK_CLIENTS } from "@astax/adapters/identity";
import type { ObjectStoragePort } from "@astax/adapters/storage";
import {
  asSystem,
  carryOnboardingAcceptances,
  checkOnRui,
  settingsAt,
  SYSTEM_CONTEXT,
  withContext,
  type DbClient,
  type DbTransaction,
  type OnboardingApplication,
  type RuiCheck,
} from "@astax/db";
import { Inject, Injectable } from "@nestjs/common";
import type { ApiConfig } from "../config/config.js";
import { actorOf, AuditService, type AuditActor } from "../audit/audit.service.js";
import type { AuthContext } from "../auth/auth-context.js";
import { ProblemError } from "../http/problem.js";
import type { IdentityAdmin } from "../identity/identity-admin.js";
import {
  CLOCK,
  CONFIG,
  DB,
  FIELD_CIPHER,
  IDENTITY_ADMIN,
  OBJECT_STORAGE,
} from "../infra/tokens.js";
import { NotificationService } from "../notifications/notification.service.js";
import { ConsentService } from "../requests/consent.service.js";

const DAY_MS = 86_400_000;

/** The legal texts each type signs at the entry (spec 09 §7). */
export const ONBOARDING_DOCUMENTS = {
  AGENCY: ["terms-professional", "agency-agreement", "data-processing-agreement"],
  BROKER: ["terms-professional", "broker-agreement", "data-processing-agreement"],
} as const;

export type OnboardingType = keyof typeof ONBOARDING_DOCUMENTS;

export interface OnboardingInput {
  type: OnboardingType;
  legalName: string;
  vatNumber: string;
  fiscalCode: string | null;
  ruiNumber: string;
  pec: string;
  address: { street: string; postalCode: string; municipalityIstat: string; province: string };
  iban: string;
  owner: { firstName: string; lastName: string; email: string; phone: string };
  companyIds: string[];
}

export interface ClientInfo {
  ip: string | null;
  userAgent: string | null;
}

const sha256 = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const maskIban = (iban: string) => `${iban.slice(0, 4)} •••• ${iban.slice(-4)}`;

/**
 * The entry of agencies and brokers (phase 7; spec 06 «Coda di ingresso»):
 * the applicant has no account yet and works through a private link; the
 * IBAN is confirmed with a code by SMS, the professional liability policy is
 * uploaded as a PDF, the contracts accepted; at the submission the data are
 * checked on the local RUI. A back office supervisor approves (the
 * organization, its mandates and the owner's invitation are created) or
 * rejects with a reason, and the applicant can correct and send again.
 */
@Injectable()
export class OnboardingService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(CONFIG) private readonly config: ApiConfig,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    @Inject(IDENTITY_ADMIN) private readonly identity: IdentityAdmin,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(NotificationService) private readonly notifications: NotificationService,
    @Inject(ConsentService) private readonly codes: ConsentService,
  ) {}

  private actor(client: ClientInfo): AuditActor {
    return {
      userId: null,
      membershipId: null,
      organizationId: null,
      ip: client.ip,
      userAgent: client.userAgent,
    };
  }

  private linkOf(token: string) {
    return `${this.config.WEB_URL}/ingresso/${token}`;
  }

  /** What the form needs: the companies and the texts to accept, in force now. */
  async options(type: OnboardingType) {
    const now = this.clock.now();
    return withContext(this.db, SYSTEM_CONTEXT, async (tx) => ({
      companies: await tx.insuranceCompany.findMany({
        where: { active: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      documents: await this.documentsFor(tx, type, now),
    }));
  }

  private async documentsFor(tx: DbTransaction, type: OnboardingType, now: Date) {
    const documents = await tx.legalDocument.findMany({
      where: { key: { in: [...ONBOARDING_DOCUMENTS[type]] } },
      include: {
        versions: {
          where: { publishedAt: { lte: now } },
          orderBy: { number: "desc" },
          take: 1,
        },
      },
      orderBy: { key: "asc" },
    });
    return documents.flatMap((d) => {
      const v = d.versions[0];
      return v
        ? [
            {
              key: d.key,
              title: d.title,
              versionId: v.id,
              number: v.number,
              contentMd: v.contentMd,
            },
          ]
        : [];
    });
  }

  private encrypted(input: OnboardingInput) {
    return {
      type: input.type,
      legalName: input.legalName,
      vatNumber: input.vatNumber,
      fiscalCodeEnc: input.fiscalCode ? this.cipher.encrypt(input.fiscalCode) : null,
      ruiNumber: input.ruiNumber,
      pec: input.pec,
      address: input.address,
      ibanEnc: this.cipher.encrypt(input.iban),
      ownerFirstName: input.owner.firstName,
      ownerLastName: input.owner.lastName,
      ownerEmailEnc: this.cipher.encrypt(input.owner.email),
      ownerEmailHash: this.cipher.blindIndex("email", input.owner.email.toLowerCase()),
      ownerPhoneEnc: this.cipher.encrypt(input.owner.phone),
      companyIds: input.type === "AGENCY" ? [...new Set(input.companyIds)] : [],
    };
  }

  private async checkCompanies(tx: DbTransaction, input: OnboardingInput) {
    if (input.type !== "AGENCY") return;
    const ids = [...new Set(input.companyIds)];
    const found = await tx.insuranceCompany.count({ where: { id: { in: ids }, active: true } });
    if (ids.length === 0 || found !== ids.length) {
      throw new ProblemError("VALIDATION_FAILED", "Unknown companies", [
        { path: "companyIds", issue: "UNKNOWN_COMPANY" },
      ]);
    }
  }

  async start(input: OnboardingInput, client: ClientInfo) {
    const token = randomBytes(32).toString("base64url");
    const now = this.clock.now();
    const id = await withContext(this.db, SYSTEM_CONTEXT, async (tx) => {
      await this.checkCompanies(tx, input);
      const created = await tx.onboardingApplication.create({
        data: {
          ...this.encrypted(input),
          tokenHash: sha256(token),
          tokenEnc: this.cipher.encrypt(token),
          createdAt: now,
          updatedAt: now,
        },
      });
      await this.audit.inTransaction(tx, this.actor(client), {
        action: "ONBOARDING_STARTED",
        targetType: "OnboardingApplication",
        targetId: created.id,
        after: { type: input.type, ruiNumber: input.ruiNumber },
      });
      return created.id;
    });
    return { id, token };
  }

  private async byToken(tx: DbTransaction, token: string) {
    const application = await tx.onboardingApplication.findUnique({
      where: { tokenHash: sha256(token) },
    });
    if (!application) throw new ProblemError("NOT_FOUND");
    return application;
  }

  private editable(application: OnboardingApplication) {
    if (application.status !== "DRAFT" && application.status !== "REJECTED") {
      throw new ProblemError("CONFLICT", "Already sent", [
        { path: "application", issue: "NOT_EDITABLE" },
      ]);
    }
  }

  /** The applicant's own view: the IBAN masked, the RUI check not shown. */
  async view(token: string) {
    const now = this.clock.now();
    return withContext(this.db, SYSTEM_CONTEXT, async (tx) => {
      const a = await this.byToken(tx, token);
      return {
        id: a.id,
        type: a.type,
        status: a.status,
        legalName: a.legalName,
        vatNumber: a.vatNumber,
        fiscalCode: a.fiscalCodeEnc ? this.cipher.decrypt(a.fiscalCodeEnc) : null,
        ruiNumber: a.ruiNumber,
        pec: a.pec,
        address: a.address,
        iban: maskIban(this.cipher.decrypt(a.ibanEnc)),
        ibanConfirmed: a.ibanConfirmedAt !== null,
        owner: {
          firstName: a.ownerFirstName,
          lastName: a.ownerLastName,
          email: this.cipher.decrypt(a.ownerEmailEnc),
          phone: this.cipher.decrypt(a.ownerPhoneEnc),
        },
        companyIds: a.companyIds,
        profInsurance: a.profInsuranceKey
          ? { expiresOn: a.profInsuranceExpiresOn?.toISOString().slice(0, 10) ?? null }
          : null,
        rejectionReason: a.status === "REJECTED" ? a.decisionReason : null,
        documents: await this.documentsFor(tx, a.type as OnboardingType, now),
      };
    });
  }

  /** A correction: a changed IBAN must be confirmed again; a rejected entry goes back to draft. */
  async update(token: string, input: OnboardingInput, client: ClientInfo) {
    const now = this.clock.now();
    return withContext(this.db, SYSTEM_CONTEXT, async (tx) => {
      const a = await this.byToken(tx, token);
      this.editable(a);
      if (input.type !== a.type) {
        throw new ProblemError("VALIDATION_FAILED", "The type cannot change", [
          { path: "type", issue: "TYPE_CHANGED" },
        ]);
      }
      await this.checkCompanies(tx, input);
      const ibanChanged = this.cipher.decrypt(a.ibanEnc) !== input.iban;
      const phoneChanged = this.cipher.decrypt(a.ownerPhoneEnc) !== input.owner.phone;
      await tx.onboardingApplication.update({
        where: { id: a.id },
        data: {
          ...this.encrypted(input),
          status: "DRAFT",
          ...(ibanChanged || phoneChanged ? { ibanConfirmedAt: null } : {}),
          updatedAt: now,
        },
      });
      await this.audit.inTransaction(tx, this.actor(client), {
        action: "ONBOARDING_UPDATED",
        targetType: "OnboardingApplication",
        targetId: a.id,
        after: { ibanChanged },
      });
      return {
        id: a.id,
        ibanConfirmed: !(ibanChanged || phoneChanged) && a.ibanConfirmedAt !== null,
      };
    });
  }

  /** IBAN with a code by SMS to the owner's phone (codes as in SIC-05). */
  async sendIbanCode(token: string) {
    const now = this.clock.now();
    const prepared = await withContext(this.db, SYSTEM_CONTEXT, async (tx) => {
      const a = await this.byToken(tx, token);
      this.editable(a);
      const challenge = await this.codes.newChallenge(
        tx,
        "ONBOARDING_IBAN",
        a.id,
        { ownerUserId: null, ownerOrganizationId: null },
        now,
      );
      return { ...challenge, id: a.id, phone: this.cipher.decrypt(a.ownerPhoneEnc) };
    });
    await this.codes.sendCode(
      { email: null, phone: prepared.phone },
      "ONBOARDING_IBAN",
      prepared.code,
      prepared.minutes,
      { onboardingId: prepared.id },
    );
  }

  async confirmIban(token: string, code: string, client: ClientInfo) {
    const now = this.clock.now();
    const outcome = await withContext(this.db, SYSTEM_CONTEXT, async (tx) => {
      const a = await this.byToken(tx, token);
      this.editable(a);
      const challenge = await this.codes.verifyChallenge(tx, "ONBOARDING_IBAN", a.id, code, now);
      if (!challenge) return { id: a.id, confirmed: false };
      await tx.onboardingApplication.update({
        where: { id: a.id },
        data: { ibanConfirmedAt: now, updatedAt: now },
      });
      await this.audit.inTransaction(tx, this.actor(client), {
        action: "ONBOARDING_IBAN_CONFIRMED",
        targetType: "OnboardingApplication",
        targetId: a.id,
        after: { otpChallengeId: challenge.id },
      });
      return { id: a.id, confirmed: true };
    });
    if (!outcome.confirmed) {
      await this.audit.record(this.actor(client), {
        action: "OTP_FAILED",
        targetType: "OnboardingApplication",
        targetId: outcome.id,
      });
      throw new ProblemError("VALIDATION_FAILED", "Wrong or expired code", [
        { path: "code", issue: "OTP_INVALID" },
      ]);
    }
    return { confirmed: true };
  }

  /** The professional liability policy, as a PDF, with its expiry. */
  async uploadProfInsurance(
    token: string,
    expiresOn: string,
    file: { body: Uint8Array; contentType: string },
    client: ClientInfo,
  ) {
    const now = this.clock.now();
    const pdf =
      file.contentType === "application/pdf" &&
      Buffer.from(file.body.subarray(0, 5)).toString("latin1") === "%PDF-";
    if (!pdf) {
      throw new ProblemError("VALIDATION_FAILED", undefined, [
        { path: "file", issue: "NOT_A_PDF" },
      ]);
    }
    const id = await withContext(this.db, SYSTEM_CONTEXT, async (tx) => {
      const a = await this.byToken(tx, token);
      this.editable(a);
      const { "documents.maxUploadMb": maxMb } = await settingsAt(
        tx,
        ["documents.maxUploadMb"],
        now,
      );
      if (file.body.byteLength > maxMb * 1024 * 1024) {
        throw new ProblemError("VALIDATION_FAILED", undefined, [
          { path: "file", issue: "TOO_LARGE" },
        ]);
      }
      return a.id;
    });
    const key = `onboarding/${id}/${randomBytes(16).toString("hex")}`;
    await this.storage.put({ key, body: file.body, contentType: "application/pdf" });
    await withContext(this.db, SYSTEM_CONTEXT, async (tx) => {
      await tx.onboardingApplication.update({
        where: { id },
        data: {
          profInsuranceKey: key,
          profInsuranceSha256: sha256(file.body),
          profInsuranceSize: file.body.byteLength,
          profInsuranceExpiresOn: new Date(`${expiresOn}T00:00:00.000Z`),
          updatedAt: now,
        },
      });
      await this.audit.inTransaction(tx, this.actor(client), {
        action: "ONBOARDING_DOCUMENT_UPLOADED",
        targetType: "OnboardingApplication",
        targetId: id,
        after: { kind: "PROF_INSURANCE", expiresOn },
      });
    });
    return { uploaded: true };
  }

  /**
   * Sent to the back office: IBAN confirmed, policy valid, every contract in
   * force accepted (LEG-01: version, time, IP); the RUI check is stored.
   */
  async submit(token: string, versionIds: string[], client: ClientInfo) {
    const now = this.clock.now();
    const sent = await withContext(this.db, SYSTEM_CONTEXT, async (tx) => {
      const a = await this.byToken(tx, token);
      this.editable(a);
      const missing: { path: string; issue: string }[] = [];
      if (!a.ibanConfirmedAt) missing.push({ path: "iban", issue: "IBAN_NOT_CONFIRMED" });
      if (!a.profInsuranceKey) missing.push({ path: "profInsurance", issue: "MISSING" });
      else if ((a.profInsuranceExpiresOn?.getTime() ?? 0) <= now.getTime()) {
        missing.push({ path: "profInsurance", issue: "EXPIRED" });
      }
      const documents = await this.documentsFor(tx, a.type as OnboardingType, now);
      const required = documents.map((d) => d.versionId);
      if (
        required.some((v) => !versionIds.includes(v)) ||
        versionIds.some((v) => !required.includes(v))
      ) {
        missing.push({ path: "documents", issue: "NOT_ACCEPTED" });
      }
      const taken = await tx.organization.findFirst({ where: { ruiNumber: a.ruiNumber } });
      const pending = await tx.onboardingApplication.findFirst({
        where: { ruiNumber: a.ruiNumber, status: "SUBMITTED", id: { not: a.id } },
      });
      if (taken || pending) missing.push({ path: "ruiNumber", issue: "RUI_IN_USE" });
      if (missing.length > 0) {
        throw new ProblemError("VALIDATION_FAILED", "The entry is not complete", missing);
      }
      const companies = await tx.insuranceCompany.findMany({
        where: { id: { in: a.companyIds } },
        select: { name: true },
      });
      const ruiCheck = await asSystem(tx, () =>
        checkOnRui(tx, {
          type: a.type as OnboardingType,
          ruiNumber: a.ruiNumber,
          legalName: a.legalName,
          companyNames: companies.map((c) => c.name),
        }),
      );
      await tx.onboardingApplication.update({
        where: { id: a.id },
        data: {
          status: "SUBMITTED",
          acceptedVersionIds: required,
          acceptedAt: now,
          acceptedIp: client.ip,
          acceptedUserAgent: client.userAgent,
          ruiCheck: ruiCheck as unknown as object,
          submittedAt: now,
          decisionReason: null,
          updatedAt: now,
        },
      });
      await this.audit.inTransaction(tx, this.actor(client), {
        action: "ONBOARDING_SUBMITTED",
        targetType: "OnboardingApplication",
        targetId: a.id,
        after: { ruiFound: ruiCheck.found, versions: required.length },
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
          locale: u.locale === "sq" ? "sq" : "it",
          email: u.emailEnc ? this.cipher.decrypt(u.emailEnc) : null,
          phone: null,
        })),
        "onboarding.submitted.bo",
        () => ({
          organizzazione: a.legalName,
          tipo_organizzazione: { label: `organizationType.${a.type}` },
          numero_rui: a.ruiNumber,
          link: `${this.config.ADMIN_URL}/ingressi/${a.id}`,
        }),
        `/ingressi/${a.id}`,
        { onboardingId: a.id },
      );
      return { outbound, id: a.id };
    });
    await this.notifications.send(sent.outbound);
    return { id: sent.id, status: "SUBMITTED" as const };
  }

  // --- Back office ---------------------------------------------------------

  async queue(auth: AuthContext, status: "SUBMITTED" | "APPROVED" | "REJECTED" | "DRAFT") {
    return withContext(this.db, auth.db, async (tx) =>
      (
        await tx.onboardingApplication.findMany({
          where: { status },
          orderBy: [{ submittedAt: "asc" }, { createdAt: "asc" }],
          take: 200,
        })
      ).map((a) => ({
        id: a.id,
        type: a.type,
        status: a.status,
        legalName: a.legalName,
        ruiNumber: a.ruiNumber,
        submittedAt: a.submittedAt?.toISOString() ?? null,
        ruiFound: (a.ruiCheck as RuiCheck | null)?.found ?? null,
      })),
    );
  }

  /** Opening an entry is in the access log (rule 4): it holds IBAN and contacts. */
  async detail(auth: AuthContext, id: string) {
    return withContext(this.db, auth.db, async (tx) => {
      const a = await tx.onboardingApplication.findUnique({ where: { id } });
      if (!a) throw new ProblemError("NOT_FOUND");
      const companies = await tx.insuranceCompany.findMany({
        where: { id: { in: a.companyIds } },
        select: { id: true, name: true },
      });
      const versions = await tx.legalDocumentVersion.findMany({
        where: { id: { in: a.acceptedVersionIds } },
        include: { document: true },
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "ONBOARDING_VIEWED",
        targetType: "OnboardingApplication",
        targetId: id,
      });
      return {
        id: a.id,
        type: a.type,
        status: a.status,
        legalName: a.legalName,
        vatNumber: a.vatNumber,
        fiscalCode: a.fiscalCodeEnc ? this.cipher.decrypt(a.fiscalCodeEnc) : null,
        ruiNumber: a.ruiNumber,
        pec: a.pec,
        address: a.address,
        iban: this.cipher.decrypt(a.ibanEnc),
        ibanConfirmedAt: a.ibanConfirmedAt?.toISOString() ?? null,
        owner: {
          firstName: a.ownerFirstName,
          lastName: a.ownerLastName,
          email: this.cipher.decrypt(a.ownerEmailEnc),
          phone: this.cipher.decrypt(a.ownerPhoneEnc),
        },
        companies,
        profInsurance: a.profInsuranceKey
          ? {
              expiresOn: a.profInsuranceExpiresOn?.toISOString().slice(0, 10) ?? null,
              size: a.profInsuranceSize,
            }
          : null,
        contracts: versions.map((v) => ({
          title: v.document.title,
          number: v.number,
          validated: v.status === "VALIDATED",
        })),
        acceptedAt: a.acceptedAt?.toISOString() ?? null,
        acceptedIp: a.acceptedIp,
        ruiCheck: a.ruiCheck as RuiCheck | null,
        submittedAt: a.submittedAt?.toISOString() ?? null,
        decidedAt: a.decidedAt?.toISOString() ?? null,
        decisionReason: a.decisionReason,
        organizationId: a.organizationId,
      };
    });
  }

  async profInsuranceFile(auth: AuthContext, id: string) {
    const key = await withContext(this.db, auth.db, async (tx) => {
      const a = await tx.onboardingApplication.findUnique({ where: { id } });
      if (!a?.profInsuranceKey) throw new ProblemError("NOT_FOUND");
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "DOCUMENT_VIEWED",
        targetType: "OnboardingApplication",
        targetId: id,
        after: { kind: "PROF_INSURANCE" },
      });
      return a.profInsuranceKey;
    });
    const body = await this.storage.get(key);
    return { body, mime: "application/pdf", fileName: "rc-professionale.pdf" };
  }

  private async submitted(tx: DbTransaction, id: string) {
    const a = await tx.onboardingApplication.findUnique({ where: { id } });
    if (!a) throw new ProblemError("NOT_FOUND");
    if (a.status !== "SUBMITTED") {
      throw new ProblemError("CONFLICT", "Not waiting for a decision", [
        { path: "application", issue: "NOT_SUBMITTED" },
      ]);
    }
    return a;
  }

  /**
   * Approval: the organization (active), the mandates (from the RUI when
   * confirmed there), and the owner's invitation; the contracts accepted in
   * the entry count for the owner at the first access (LEG-01).
   */
  async approve(auth: AuthContext, id: string, reason: string) {
    const now = this.clock.now();
    const done = await withContext(this.db, auth.db, async (tx) => {
      const a = await this.submitted(tx, id);
      const check = a.ruiCheck as RuiCheck | null;
      const companies = await tx.insuranceCompany.findMany({ where: { id: { in: a.companyIds } } });
      const email = this.cipher.decrypt(a.ownerEmailEnc);
      const existing = await asSystem(tx, () =>
        tx.user.findUnique({ where: { emailHash: a.ownerEmailHash } }),
      );
      const { "team.inviteValidityDays": days } = await settingsAt(
        tx,
        ["team.inviteValidityDays"],
        now,
      );
      const organization = await asSystem(tx, () =>
        tx.organization.create({
          data: {
            type: a.type,
            legalName: a.legalName,
            vatNumber: a.vatNumber,
            fiscalCodeEnc: a.fiscalCodeEnc,
            fiscalCodeHash: a.fiscalCodeEnc
              ? this.cipher.blindIndex("fiscalCode", this.cipher.decrypt(a.fiscalCodeEnc))
              : null,
            ruiNumber: a.ruiNumber,
            ruiSection: a.type === "AGENCY" ? "A" : "B",
            pec: a.pec,
            address: a.address as object,
            ibanEnc: a.ibanEnc,
            status: "ACTIVE",
            profInsuranceExpiresOn: a.profInsuranceExpiresOn,
            createdAt: now,
            updatedAt: now,
          },
        }),
      );
      for (const c of companies) {
        await asSystem(tx, () =>
          tx.agencyMandate.create({
            data: {
              organizationId: organization.id,
              companyId: c.id,
              source: check?.confirmedCompanies.includes(c.name) ? "RUI" : "MANUAL",
              verifiedAt: now,
              createdAt: now,
            },
          }),
        );
      }
      if (existing) {
        await asSystem(tx, () =>
          tx.membership.create({
            data: {
              userId: existing.id,
              organizationId: organization.id,
              role: "OWNER",
              canIssue: true,
              canSeeColleagueOffers: true,
              canSeeAccounting: true,
              seesAllClients: true,
            },
          }),
        );
      } else {
        await asSystem(tx, () =>
          tx.teamInvite.create({
            data: {
              organizationId: organization.id,
              emailHash: a.ownerEmailHash,
              role: "OWNER",
              canIssue: true,
              canSeeColleagueOffers: true,
              canSeeAccounting: true,
              seesAllClients: true,
              tokenHash: sha256(randomBytes(32)),
              invitedByUserId: auth.userId,
              expiresAt: new Date(now.getTime() + days * DAY_MS),
            },
          }),
        );
      }
      await tx.onboardingApplication.update({
        where: { id },
        data: {
          status: "APPROVED",
          decidedAt: now,
          decidedByUserId: auth.userId,
          decisionReason: reason,
          organizationId: organization.id,
          updatedAt: now,
        },
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "ONBOARDING_APPROVED",
        targetType: "OnboardingApplication",
        targetId: id,
        before: { status: "SUBMITTED" },
        after: {
          status: "APPROVED",
          organizationId: organization.id,
          mandates: companies.length,
          existingUser: existing !== null,
        },
        reason,
      });
      if (existing) {
        await asSystem(tx, () =>
          carryOnboardingAcceptances(tx, existing.id, a.ownerEmailHash, [organization.id]),
        );
      }
      return {
        organizationId: organization.id,
        email,
        name: a.ownerFirstName,
        lastName: a.ownerLastName,
        legalName: a.legalName,
        existing: existing !== null,
        validityDays: days,
      };
    });
    if (!done.existing) {
      const keycloakId = await this.identity.createUser({
        email: done.email,
        firstName: done.name,
        lastName: done.lastName,
        requiredActions: ["UPDATE_PASSWORD", "CONFIGURE_TOTP"],
      });
      await this.identity.addRealmRoles(keycloakId, ["astax-professional"]);
      await this.identity.executeActionsEmail(keycloakId, ["UPDATE_PASSWORD", "CONFIGURE_TOTP"], {
        clientId: KEYCLOAK_CLIENTS.professional,
        redirectUri: this.config.WEB_URL,
        lifespanSeconds: done.validityDays * 86_400,
      });
    }
    await this.notifications.sendEmail(
      done.email,
      "onboarding.approved",
      {
        nome: done.name,
        organizzazione: done.legalName,
        prossimo_passo: done.existing
          ? { label: "onboarding.nextStep.existing" }
          : { label: "onboarding.nextStep.new" },
        link: this.config.WEB_URL,
      },
      { onboardingId: id, organizationId: done.organizationId },
    );
    return { id, status: "APPROVED" as const, organizationId: done.organizationId };
  }

  async reject(auth: AuthContext, id: string, reason: string) {
    const now = this.clock.now();
    const done = await withContext(this.db, auth.db, async (tx) => {
      const a = await this.submitted(tx, id);
      await tx.onboardingApplication.update({
        where: { id },
        data: {
          status: "REJECTED",
          decidedAt: now,
          decidedByUserId: auth.userId,
          decisionReason: reason,
          updatedAt: now,
        },
      });
      await this.audit.inTransaction(tx, actorOf(auth), {
        action: "ONBOARDING_REJECTED",
        targetType: "OnboardingApplication",
        targetId: id,
        before: { status: "SUBMITTED" },
        after: { status: "REJECTED" },
        reason,
      });
      return {
        email: this.cipher.decrypt(a.ownerEmailEnc),
        name: a.ownerFirstName,
        legalName: a.legalName,
        token: this.cipher.decrypt(a.tokenEnc),
      };
    });
    await this.notifications.sendEmail(
      done.email,
      "onboarding.rejected",
      {
        nome: done.name,
        organizzazione: done.legalName,
        motivo: reason,
        link: this.linkOf(done.token),
      },
      { onboardingId: id },
    );
    return { id, status: "REJECTED" as const };
  }
}
