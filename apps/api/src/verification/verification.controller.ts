import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Res,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { z } from "zod";
import {
  QUOTE_DRAFT_SECTIONS,
  QUOTE_TYPES,
  VERIFICATION_STEPS,
  type CheckInput,
} from "@astax/shared/domain";
import type { AuthContext } from "../auth/auth-context.js";
import { CurrentAuth, RequirePermission } from "../auth/decorators.js";
import { parseInput } from "../http/validation.js";
import { sendFile } from "../requests/requests.controller.js";
import { AgencyPreviewService } from "./agency-preview.service.js";
import { VerificationService } from "./verification.service.js";

const uuid = z.uuid();
const reason = z.string().trim().min(3).max(500);
const queueSchema = z.object({
  outcome: z.enum(["GREEN", "YELLOW", "RED"]).optional(),
  mine: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});
const checklistSchema = z
  .strictObject({
    correction: z.string().max(300).optional(),
    note: z.string().max(500).optional(),
  })
  .refine((v) => v.correction !== undefined || v.note !== undefined, "nothing to change");
const stepSchema = z.enum(VERIFICATION_STEPS);
const checkSchema = z.strictObject({
  value: z.string().trim().min(1).max(20).optional(),
});
const quoteTypeCheckSchema = z.strictObject({ value: z.enum(QUOTE_TYPES) });
const correctionSchema = z.strictObject({ quoteData: z.unknown(), reason });
const approveSchema = z.strictObject({ note: z.string().max(500).optional() });
const integrationSchema = z
  .strictObject({
    reasonCodes: z
      .array(z.string().regex(/^[A-Z_]+$/))
      .min(1)
      .max(10),
    message: z.string().trim().max(1000).optional(),
    sections: z.array(z.enum(QUOTE_DRAFT_SECTIONS as [string, ...string[]])).max(6),
    documents: z
      .array(
        z.enum([
          "REGISTRATION_CERTIFICATE",
          "DRIVING_LICENCE",
          "RISK_CERTIFICATE",
          "IDENTITY_DOCUMENT",
          "FISCAL_CODE_CARD",
          "CONSENT_FORM",
          "OTHER",
        ]),
      )
      .max(6),
  })
  .refine(
    (v) => v.sections.length + v.documents.length > 0,
    "ask for at least one section or document",
  );
const excludeSchema = z.strictObject({
  reasonCode: z.string().regex(/^[A-Z_]+$/),
  message: z.string().trim().max(1000).optional(),
});

/** Back office: verification queue and card (spec 06). */
@ApiTags("verification")
@ApiBearerAuth()
@Controller("verification")
export class VerificationController {
  constructor(
    @Inject(VerificationService) private readonly verification: VerificationService,
    @Inject(AgencyPreviewService) private readonly agencies: AgencyPreviewService,
  ) {}

  /** The agencies an approval would invite now (fase 3). */
  @Get("requests/:id/agencies")
  @RequirePermission("verification.viewQueue")
  agencyPreview(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.agencies.preview(auth, parseInput(uuid, id));
  }

  @Post("requests/:id/agencies/:organizationId/exclude")
  @HttpCode(200)
  @RequirePermission("verification.excludeAgency")
  excludeAgency(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Param("organizationId") organizationId: string,
    @Body() body: unknown,
  ) {
    return this.agencies.exclude(
      auth,
      parseInput(uuid, id),
      parseInput(uuid, organizationId),
      parseInput(z.strictObject({ reason }), body).reason,
    );
  }

  @Post("requests/:id/agencies/:organizationId/include")
  @HttpCode(200)
  @RequirePermission("verification.excludeAgency")
  includeAgency(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Param("organizationId") organizationId: string,
  ) {
    return this.agencies.include(auth, parseInput(uuid, id), parseInput(uuid, organizationId));
  }

  @Get("queue")
  @RequirePermission("verification.viewQueue")
  queue(@CurrentAuth() auth: AuthContext, @Query() query: unknown) {
    return this.verification.queue(auth, parseInput(queueSchema, query));
  }

  @Get("requests/:id")
  @RequirePermission("verification.viewQueue")
  card(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.verification.card(auth, parseInput(uuid, id));
  }

  @Get("requests/:id/documents/:documentId/file")
  @RequirePermission("verification.viewQueue")
  async file(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Param("documentId") documentId: string,
    @Res() response: Response,
  ): Promise<void> {
    sendFile(
      response,
      await this.verification.documentFile(
        auth,
        parseInput(uuid, id),
        parseInput(uuid, documentId),
      ),
    );
  }

  @Post("requests/:id/assign")
  @HttpCode(200)
  @RequirePermission("verification.decide")
  assign(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.verification.assign(auth, parseInput(uuid, id));
  }

  @Post("requests/:id/release")
  @HttpCode(200)
  @RequirePermission("verification.decide")
  release(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.verification.release(auth, parseInput(uuid, id));
  }

  /** One of the five checks (Dan, 2026-10-28). */
  @Put("requests/:id/checks/:step")
  @RequirePermission("verification.decide")
  check(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Param("step") step: string,
    @Body() body: unknown,
  ) {
    const parsedStep = parseInput(stepSchema, step);
    let input: CheckInput;
    if (parsedStep === "QUOTE_TYPE") {
      input = { step: parsedStep, value: parseInput(quoteTypeCheckSchema, body).value };
    } else if (parsedStep === "PLATE" || parsedStep === "BIRTH_DATE") {
      const { value } = parseInput(checkSchema, body ?? {});
      input = value === undefined ? { step: parsedStep } : { step: parsedStep, value };
    } else {
      parseInput(z.strictObject({}), body ?? {});
      input = { step: parsedStep };
    }
    return this.verification.recordCheck(auth, parseInput(uuid, id), input);
  }

  /** «Leggi da ANIA» with the plate of the request (Dan, 2026-10-28). */
  @Post("requests/:id/ania")
  @HttpCode(200)
  @RequirePermission("verification.decide")
  readAnia(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.verification.readAnia(auth, parseInput(uuid, id));
  }

  @Delete("requests/:id/checks/:step")
  @RequirePermission("verification.decide")
  clearCheck(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Param("step") step: string,
  ) {
    return this.verification.clearCheck(auth, parseInput(uuid, id), parseInput(stepSchema, step));
  }

  @Put("requests/:id/checklist/:code")
  @RequirePermission("verification.decide")
  checklist(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Param("code") code: string,
    @Body() body: unknown,
  ) {
    return this.verification.updateChecklistItem(
      auth,
      parseInput(uuid, id),
      parseInput(z.string().regex(/^[A-Z_]+$/), code),
      parseInput(checklistSchema, body),
    );
  }

  @Post("requests/:id/corrections")
  @HttpCode(200)
  @RequirePermission("verification.decide")
  correct(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    return this.verification.correct(
      auth,
      parseInput(uuid, id),
      parseInput(correctionSchema, body),
    );
  }

  @Post("requests/:id/approve")
  @HttpCode(200)
  @RequirePermission("verification.decide")
  approve(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    return this.verification.approve(
      auth,
      parseInput(uuid, id),
      parseInput(approveSchema, body ?? {}).note,
    );
  }

  @Post("requests/:id/integration")
  @HttpCode(200)
  @RequirePermission("verification.decide")
  integration(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    const input = parseInput(integrationSchema, body);
    return this.verification.requestIntegration(auth, parseInput(uuid, id), {
      reasonCodes: input.reasonCodes,
      ...(input.message ? { message: input.message } : {}),
      sections: input.sections as (typeof QUOTE_DRAFT_SECTIONS)[number][],
      documents: input.documents,
    });
  }

  @Post("requests/:id/exclude")
  @HttpCode(200)
  @RequirePermission("verification.decide")
  exclude(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    const input = parseInput(excludeSchema, body);
    return this.verification.exclude(auth, parseInput(uuid, id), {
      reasonCode: input.reasonCode,
      ...(input.message ? { message: input.message } : {}),
    });
  }
}
