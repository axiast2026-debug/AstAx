import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Patch,
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
import { ProblemError } from "../http/problem.js";
import { parseInput } from "../http/validation.js";
import { sendFile } from "../requests/requests.controller.js";
import { AgencyIbanService } from "./agency-iban.service.js";
import { AgencySettingsService, CapacityInputSchema } from "./agency-settings.service.js";
import { AgencyService } from "./agency.service.js";

const uuid = z.uuid();
const incomingSchema = z.object({
  vehicleType: z
    .string()
    .regex(/^[A-Z_]+$/)
    .optional(),
  province: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .optional(),
  state: z.enum(["NEW", "CLAIMED_BY_ME", "CLAIMED_BY_COLLEAGUE", "OFFERED", "DECLINED"]).optional(),
  // «Partecipa all'asta» (Dan, 2026-10-21, docs/piano-agenzie.md B).
  auction: z.enum(["OPEN", "CLOSED"]).optional(),
  closesWithinHours: z.coerce.number().int().min(1).max(168).optional(),
  // Dan, 2026-10-29: the same filters as «I miei filtri», by hand, or the saved ones.
  cuClassMin: z.coerce.number().int().min(1).max(18).optional(),
  cuClassMax: z.coerce.number().int().min(1).max(18).optional(),
  maxClaims: z.coerce.number().int().min(0).max(20).optional(),
  driverAgeMin: z.coerce.number().int().min(14).max(110).optional(),
  driverAgeMax: z.coerce.number().int().min(14).max(110).optional(),
  mine: z.literal("1").optional(),
  packageCode: z
    .string()
    .regex(/^[A-Z_]+$/)
    .optional(),
  withoutDocuments: z.enum(["1"]).optional(),
});
const assignSchema = z.strictObject({ membershipId: uuid });
const productSchema = z.strictObject({ companyId: uuid, name: z.string().trim().min(1).max(120) });
const productUpdateSchema = z.strictObject({ active: z.boolean() });
const accessLogSchema = z.object({ before: z.coerce.bigint().positive().optional() });

/** The agency area (spec 04, spec 05 for the sub-agents). */
@ApiTags("agency")
@ApiBearerAuth()
@Controller("agency")
export class AgencyController {
  constructor(
    @Inject(AgencyService) private readonly agency: AgencyService,
    @Inject(AgencySettingsService) private readonly settings: AgencySettingsService,
    @Inject(AgencyIbanService) private readonly iban: AgencyIbanService,
  ) {}

  @Get("dashboard")
  @RequirePermission("auction.viewStatus")
  dashboard(@CurrentAuth() auth: AuthContext) {
    return this.agency.dashboard(auth);
  }

  /** Dan, 2026-10-29: the agency's IBAN, asked at its first offer to whoever sends it. */
  @Get("iban")
  @RequirePermission("offer.submit")
  ibanStatus(@CurrentAuth() auth: AuthContext) {
    return this.iban.status(auth);
  }

  @Post("iban/code")
  @HttpCode(204)
  @RequirePermission("offer.submit")
  async ibanCode(@CurrentAuth() auth: AuthContext, @Body() body: unknown): Promise<void> {
    await this.iban.sendCode(auth, body);
  }

  @Post("iban")
  @HttpCode(200)
  @RequirePermission("offer.submit")
  ibanConfirm(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    return this.iban.confirm(auth, body);
  }

  /** «Profilo» of the agency (Dan, 2026-10-21, docs/piano-agenzie.md D). */
  @Get("profile")
  @RequirePermission("auction.viewStatus")
  profile(@CurrentAuth() auth: AuthContext) {
    return this.agency.profile(auth);
  }

  @Get("requests")
  @RequirePermission("auction.viewStatus")
  incoming(@CurrentAuth() auth: AuthContext, @Query() query: unknown) {
    return this.agency.incoming(auth, parseInput(incomingSchema, query));
  }

  @Get("requests/:auctionId")
  @RequirePermission("request.viewQuoteData")
  detail(@CurrentAuth() auth: AuthContext, @Param("auctionId") auctionId: string) {
    return this.agency.detail(auth, parseInput(uuid, auctionId));
  }

  @Get("requests/:auctionId/documents/:documentId")
  @RequirePermission("request.viewQuoteData")
  async document(
    @CurrentAuth() auth: AuthContext,
    @Param("auctionId") auctionId: string,
    @Param("documentId") documentId: string,
    @Res() response: Response,
  ) {
    sendFile(
      response,
      await this.agency.documentFile(
        auth,
        parseInput(uuid, auctionId),
        parseInput(uuid, documentId),
      ),
    );
  }

  @Post("requests/:auctionId/assign")
  @HttpCode(200)
  @RequirePermission("claim.override")
  assign(
    @CurrentAuth() auth: AuthContext,
    @Param("auctionId") auctionId: string,
    @Body() body: unknown,
  ) {
    return this.agency.assignClaim(
      auth,
      parseInput(uuid, auctionId),
      parseInput(assignSchema, body).membershipId,
    );
  }

  @Get("to-issue")
  @RequirePermission("issuance.manage")
  toIssue(@CurrentAuth() auth: AuthContext) {
    return this.agency.toIssue(auth);
  }

  @Get("offers")
  @RequirePermission("offer.readOwnDuringAuction")
  offers(@CurrentAuth() auth: AuthContext) {
    return this.agency.myOffers(auth);
  }

  // «Filtri e capacità» (ASTA-05, VIS-06)

  @Get("filters")
  @RequirePermission("memberFilters.manageOwn")
  filters(@CurrentAuth() auth: AuthContext) {
    return this.settings.filters(auth);
  }

  @Put("filters")
  @RequirePermission("agencyFilters.manage")
  saveFilters(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    return this.settings.saveAgencyFilters(auth, body);
  }

  @Put("capacity")
  @RequirePermission("agencyFilters.manage")
  saveCapacity(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    return this.settings.saveCapacity(auth, parseInput(CapacityInputSchema, body));
  }

  @Put("filters/mine")
  @RequirePermission("memberFilters.manageOwn")
  saveMyFilters(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    const criteria = (body as { criteria?: unknown } | null)?.criteria;
    return this.settings.saveMyFilters(auth, criteria === undefined ? body : criteria);
  }

  // Product library (decision 17)

  @Get("products")
  @RequirePermission("offer.submit")
  products(@CurrentAuth() auth: AuthContext) {
    return this.settings.products(auth);
  }

  @Post("products")
  @RequirePermission("productLibrary.manage")
  createProduct(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    return this.settings.createProduct(auth, parseInput(productSchema, body));
  }

  @Patch("products/:id")
  @RequirePermission("productLibrary.manage")
  updateProduct(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    return this.settings.setProductActive(
      auth,
      parseInput(uuid, id),
      parseInput(productUpdateSchema, body).active,
    );
  }

  /** The PDF is the body; the kind goes in the query string. */
  @Post("products/:id/documents")
  @RequirePermission("productLibrary.manage")
  uploadProductDocument(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Query("kind") kind: string | undefined,
    @Headers("content-type") contentType: string | undefined,
    @Req() request: Request,
  ) {
    const body = request.body as unknown;
    if (!(body instanceof Buffer)) {
      throw new ProblemError("VALIDATION_FAILED", undefined, [
        { path: "file", issue: "PDF_REQUIRED" },
      ]);
    }
    return this.settings.uploadProductDocument(auth, parseInput(uuid, id), kind ?? "", {
      body: new Uint8Array(body),
      contentType: (contentType ?? "").split(";")[0]?.trim() ?? "",
    });
  }

  @Get("products/:id/documents/:documentId")
  @RequirePermission("offer.submit")
  async productDocument(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Param("documentId") documentId: string,
    @Res() response: Response,
  ) {
    sendFile(
      response,
      await this.settings.productDocument(auth, parseInput(uuid, id), parseInput(uuid, documentId)),
    );
  }

  // VIS-08

  @Get("access-log")
  @RequirePermission("accessLog.viewOwnAgency")
  accessLog(@CurrentAuth() auth: AuthContext, @Query() query: unknown) {
    return this.settings.accessLog(auth, parseInput(accessLogSchema, query).before);
  }
}
