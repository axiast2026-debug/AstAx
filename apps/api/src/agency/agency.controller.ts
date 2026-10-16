import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Res } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { z } from "zod";
import type { AuthContext } from "../auth/auth-context.js";
import { CurrentAuth, RequirePermission } from "../auth/decorators.js";
import { parseInput } from "../http/validation.js";
import { sendFile } from "../requests/requests.controller.js";
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
});
const assignSchema = z.strictObject({ membershipId: uuid });

/** The agency area (spec 04, spec 05 for the sub-agents). */
@ApiTags("agency")
@ApiBearerAuth()
@Controller("agency")
export class AgencyController {
  constructor(@Inject(AgencyService) private readonly agency: AgencyService) {}

  @Get("dashboard")
  @RequirePermission("auction.viewStatus")
  dashboard(@CurrentAuth() auth: AuthContext) {
    return this.agency.dashboard(auth);
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

  @Get("offers")
  @RequirePermission("offer.readOwnDuringAuction")
  offers(@CurrentAuth() auth: AuthContext) {
    return this.agency.myOffers(auth);
  }
}
