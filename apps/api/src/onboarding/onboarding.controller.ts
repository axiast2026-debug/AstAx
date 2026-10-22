import { isValidIban, isValidVatNumber } from "@astax/shared/domain";
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { z } from "zod";
import type { AuthContext } from "../auth/auth-context.js";
import { CurrentAuth, RequirePermission } from "../auth/decorators.js";
import { Public } from "../http/public.decorator.js";
import { RateLimiter } from "../security/rate-limiter.js";
import { ProblemError } from "../http/problem.js";
import { parseInput } from "../http/validation.js";
import { sendFile } from "../requests/requests.controller.js";
import { OnboardingService } from "./onboarding.service.js";

const text = (max: number) => z.string().trim().min(1).max(max);
const token = z
  .string()
  .regex(/^[A-Za-z0-9_-]{40,60}$/)
  .max(60);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const inputSchema = z.strictObject({
  type: z.enum(["AGENCY", "BROKER"]),
  legalName: text(200),
  vatNumber: z.string().trim().refine(isValidVatNumber, { message: "INVALID_VAT_NUMBER" }),
  fiscalCode: z.string().trim().toUpperCase().min(11).max(16).nullable().optional(),
  ruiNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[ABE]\d{9}$/),
  /** Section E only: the RUI number of the agency or broker it works for. */
  principalRuiNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[AB]\d{9}$/)
    .nullable()
    .optional(),
  pec: z.email().max(200),
  address: z.strictObject({
    street: text(200),
    postalCode: z.string().regex(/^\d{5}$/),
    municipalityIstat: z.string().regex(/^\d{6}$/),
    province: z.string().regex(/^[A-Z]{2}$/),
  }),
  iban: z
    .string()
    .transform((v) => v.replace(/\s+/g, "").toUpperCase())
    .refine(isValidIban, { message: "INVALID_IBAN" }),
  owner: z.strictObject({
    firstName: text(100),
    lastName: text(100),
    email: z.email().max(200),
    phone: z.string().regex(/^\+?\d{8,15}$/),
  }),
  companyIds: z.array(z.uuid()).max(50).default([]),
});

function clientOf(request: Request) {
  return {
    ip: request.ip ?? null,
    userAgent: request.headers["user-agent"]?.slice(0, 300) ?? null,
  };
}

function parsed(body: unknown) {
  const input = parseInput(inputSchema, body);
  // The section of the RUI follows the type: A for agencies, B for brokers, and
  // E for the intermediaries who ask for quotes like a broker (Dan, 2026-10-21).
  const section = input.ruiNumber[0];
  // Dan, 2026-10-22 (docs/piano-agenzie.md, step 5): a section E intermediary
  // enters as an agency when it works for an agency, as a broker when for a broker.
  const principalSection = input.principalRuiNumber?.[0];
  const type =
    section === "E" && principalSection
      ? principalSection === "A"
        ? "AGENCY"
        : "BROKER"
      : input.type;
  const allowed = type === "AGENCY" ? ["A", "E"] : ["B", "E"];
  if (!allowed.includes(section ?? "")) {
    throw new ProblemError("VALIDATION_FAILED", undefined, [
      { path: "ruiNumber", issue: "WRONG_SECTION" },
    ]);
  }
  const principal = section === "E" ? (input.principalRuiNumber ?? null) : null;
  if (section === "E" && !principal) {
    throw new ProblemError("VALIDATION_FAILED", undefined, [
      { path: "principalRuiNumber", issue: "PRINCIPAL_REQUIRED" },
    ]);
  }
  return {
    ...input,
    type,
    fiscalCode: input.fiscalCode ?? null,
    principalRuiNumber: principal,
  };
}

/**
 * The entry of agencies and brokers from the site (phase 7): no account,
 * the private link in the path. Only identifiers in logs and errors (rule 8).
 */
@ApiTags("onboarding")
@Controller("onboarding")
export class OnboardingController {
  constructor(
    @Inject(OnboardingService) private readonly onboarding: OnboardingService,
    @Inject(RateLimiter) private readonly limiter: RateLimiter,
  ) {}

  @Get("options")
  @Public()
  options(@Query("type") type: string | undefined) {
    return this.onboarding.options(parseInput(z.enum(["AGENCY", "BROKER"]), type));
  }

  @Post()
  @Public()
  async start(@Body() body: unknown, @Req() request: Request) {
    // Phase 8: each entry costs an SMS and a check; a limit per IP address.
    await this.limiter.consume("application", request.ip ?? "unknown");
    return this.onboarding.start(parsed(body), clientOf(request));
  }

  @Get(":token")
  @Public()
  view(@Param("token") value: string) {
    return this.onboarding.view(parseInput(token, value));
  }

  @Put(":token")
  @Public()
  update(@Param("token") value: string, @Body() body: unknown, @Req() request: Request) {
    return this.onboarding.update(parseInput(token, value), parsed(body), clientOf(request));
  }

  @Post(":token/iban-code")
  @HttpCode(204)
  @Public()
  async ibanCode(@Param("token") value: string): Promise<void> {
    await this.onboarding.sendIbanCode(parseInput(token, value));
  }

  @Post(":token/iban-confirm")
  @HttpCode(200)
  @Public()
  ibanConfirm(@Param("token") value: string, @Body() body: unknown, @Req() request: Request) {
    const { code } = parseInput(z.strictObject({ code: z.string().regex(/^\d{6}$/) }), body);
    return this.onboarding.confirmIban(parseInput(token, value), code, clientOf(request));
  }

  /** The PDF is the body; the expiry goes in the query string. */
  @Post(":token/prof-insurance")
  @HttpCode(200)
  @Public()
  profInsurance(
    @Param("token") value: string,
    @Query("expiresOn") expiresOn: string | undefined,
    @Headers("content-type") contentType: string | undefined,
    @Req() request: Request,
  ) {
    const body = request.body as unknown;
    if (!(body instanceof Buffer)) {
      throw new ProblemError("VALIDATION_FAILED", undefined, [
        { path: "file", issue: "PDF_REQUIRED" },
      ]);
    }
    return this.onboarding.uploadProfInsurance(
      parseInput(token, value),
      parseInput(day, expiresOn),
      { body: new Uint8Array(body), contentType: (contentType ?? "").split(";")[0]?.trim() ?? "" },
      clientOf(request),
    );
  }

  @Post(":token/submit")
  @HttpCode(200)
  @Public()
  submit(@Param("token") value: string, @Body() body: unknown, @Req() request: Request) {
    const { versionIds } = parseInput(
      z.strictObject({ versionIds: z.array(z.uuid()).min(1).max(10) }),
      body,
    );
    return this.onboarding.submit(parseInput(token, value), versionIds, clientOf(request));
  }
}

const reason = z.strictObject({ reason: z.string().trim().min(3).max(500) });

/** Spec 06 «Coda di ingresso» (organization.approveOnboarding). */
@ApiTags("back-office")
@ApiBearerAuth()
@Controller("back-office/onboarding")
export class OnboardingQueueController {
  constructor(@Inject(OnboardingService) private readonly onboarding: OnboardingService) {}

  @Get()
  @RequirePermission("organization.approveOnboarding")
  queue(@CurrentAuth() auth: AuthContext, @Query("status") status: string | undefined) {
    return this.onboarding.queue(
      auth,
      parseInput(z.enum(["SUBMITTED", "APPROVED", "REJECTED", "DRAFT"]), status ?? "SUBMITTED"),
    );
  }

  @Get(":id")
  @RequirePermission("organization.approveOnboarding")
  detail(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.onboarding.detail(auth, parseInput(z.uuid(), id));
  }

  @Get(":id/prof-insurance")
  @RequirePermission("organization.approveOnboarding")
  async file(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Res() response: Response) {
    sendFile(response, await this.onboarding.profInsuranceFile(auth, parseInput(z.uuid(), id)));
  }

  @Post(":id/approve")
  @HttpCode(200)
  @RequirePermission("organization.approveOnboarding")
  approve(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    return this.onboarding.approve(auth, parseInput(z.uuid(), id), parseInput(reason, body).reason);
  }

  @Post(":id/reject")
  @HttpCode(200)
  @RequirePermission("organization.approveOnboarding")
  reject(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    return this.onboarding.reject(auth, parseInput(z.uuid(), id), parseInput(reason, body).reason);
  }
}
