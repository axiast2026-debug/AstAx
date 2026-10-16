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
import { AuctionsService } from "./auctions.service.js";
import { OffersService, type PdfInput } from "./offers.service.js";

const uuid = z.uuid();
const reason = z.string().trim().min(3).max(500);
const declineSchema = z.strictObject({
  reasonCode: z
    .string()
    .regex(/^[A-Z_]+$/)
    .optional(),
});
const extendSchema = z.strictObject({ workingHours: z.number().int().min(1).max(24), reason });
const inviteSchema = z.strictObject({ organizationIds: z.array(uuid).min(1).max(20), reason });
const cancelSchema = z.strictObject({ reason });

/**
 * The offer content travels in the `x-offer` header (base64url JSON) and the
 * PDF as the body, like the document uploads: nothing in the URL (rule 8),
 * nothing logged (BC-07).
 */
function offerInput(header: string | undefined): unknown {
  if (!header)
    throw new ProblemError("VALIDATION_FAILED", undefined, [{ path: "offer", issue: "required" }]);
  try {
    return JSON.parse(Buffer.from(header, "base64url").toString("utf8")) as unknown;
  } catch {
    throw new ProblemError("VALIDATION_FAILED", undefined, [{ path: "offer", issue: "invalid" }]);
  }
}

function pdfOf(request: Request, contentType: string | undefined): PdfInput | null {
  const body = request.body as unknown;
  if (!(body instanceof Buffer) || body.length === 0) return null;
  return {
    body: new Uint8Array(body),
    contentType: (contentType ?? "").split(";")[0]?.trim() ?? "",
  };
}

/** Auctions and offers (phase 3; the agency screens arrive in phase 4). */
@ApiTags("auctions")
@ApiBearerAuth()
@Controller()
export class AuctionsController {
  constructor(
    @Inject(AuctionsService) private readonly auctions: AuctionsService,
    @Inject(OffersService) private readonly offers: OffersService,
  ) {}

  // ---------------------------------------------------------------- requester

  @Get("requests/:id/auction")
  @RequirePermission("auction.viewStatus")
  requesterStatus(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.auctions.forRequester(auth, parseInput(uuid, id));
  }

  @Get("requests/:id/offers")
  @RequirePermission("offers.viewPresented")
  presented(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.auctions.presentedOffers(auth, parseInput(uuid, id));
  }

  // ---------------------------------------------------------------- agency

  @Get("agency/auctions")
  @RequirePermission("auction.viewStatus")
  agencyAuctions(@CurrentAuth() auth: AuthContext) {
    return this.auctions.forAgency(auth);
  }

  @Post("auctions/:id/claim")
  @HttpCode(200)
  @RequirePermission("claim.manage")
  claim(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.offers.claim(auth, parseInput(uuid, id));
  }

  @Post("auctions/:id/release")
  @HttpCode(200)
  @RequirePermission("claim.manage")
  release(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.offers.release(auth, parseInput(uuid, id));
  }

  @Post("auctions/:id/decline")
  @HttpCode(200)
  @RequirePermission("claim.manage")
  decline(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    return this.offers.decline(
      auth,
      parseInput(uuid, id),
      parseInput(declineSchema, body ?? {}).reasonCode,
    );
  }

  @Post("auctions/:id/offers")
  @HttpCode(201)
  @RequirePermission("offer.submit")
  submit(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Headers("x-offer") offer: string | undefined,
    @Headers("content-type") contentType: string | undefined,
    @Req() request: Request,
  ) {
    return this.offers.submit(
      auth,
      parseInput(uuid, id),
      offerInput(offer),
      pdfOf(request, contentType),
    );
  }

  @Put("offers/:id")
  @RequirePermission("offer.submit")
  change(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Headers("x-offer") offer: string | undefined,
    @Headers("content-type") contentType: string | undefined,
    @Req() request: Request,
  ) {
    return this.offers.change(
      auth,
      parseInput(uuid, id),
      offerInput(offer),
      pdfOf(request, contentType),
    );
  }

  @Post("offers/:id/withdraw")
  @HttpCode(200)
  @RequirePermission("offer.submit")
  withdraw(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.offers.withdraw(auth, parseInput(uuid, id));
  }

  /** Any role may ask: only the owner agency gets an answer, the others 403 and a log entry (BC-01). */
  @Get("offers/:id")
  @RequirePermission("auction.viewStatus")
  read(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.offers.read(auth, parseInput(uuid, id));
  }

  @Get("offers/:id/pdf")
  @RequirePermission("auction.viewStatus")
  async pdf(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Res() response: Response) {
    sendFile(response, await this.offers.readPdf(auth, parseInput(uuid, id)));
  }

  @Get("auctions/:id/offers")
  @RequirePermission("auction.viewStatus")
  offersOfRound(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.auctions.offersOfRound(auth, parseInput(uuid, id));
  }

  // ---------------------------------------------------------------- back office

  @Get("auctions")
  @RequirePermission("auction.viewStatus")
  backOffice(@CurrentAuth() auth: AuthContext) {
    return this.auctions.forBackOffice(auth);
  }

  @Post("auctions/:id/extend")
  @HttpCode(202)
  @RequirePermission("auction.manage")
  extend(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    return this.auctions.extend(auth, parseInput(uuid, id), parseInput(extendSchema, body));
  }

  @Post("auctions/:id/invite")
  @HttpCode(202)
  @RequirePermission("auction.manage")
  invite(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    return this.auctions.invite(auth, parseInput(uuid, id), parseInput(inviteSchema, body));
  }

  @Post("auctions/:id/cancel")
  @HttpCode(202)
  @RequirePermission("auction.manage")
  cancel(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    return this.auctions.cancel(auth, parseInput(uuid, id), parseInput(cancelSchema, body));
  }
}
