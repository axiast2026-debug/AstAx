import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Res } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { z } from "zod";
import type { AuthContext } from "../auth/auth-context.js";
import { CurrentAuth, RequirePermission } from "../auth/decorators.js";
import { parseInput } from "../http/validation.js";
import { InvoicesService } from "../invoicing/invoices.service.js";
import { sendFile } from "../requests/requests.controller.js";
import { RemittancesService } from "./remittances.service.js";

const uuid = z.uuid();
const date = z.iso.date();
const completeSchema = z.strictObject({
  fiscalCode: z
    .string()
    .trim()
    .regex(/^[A-Z0-9]{11,16}$/)
    .optional(),
  vatNumber: z
    .string()
    .trim()
    .regex(/^\d{11}$/)
    .optional(),
  address: z.strictObject({
    street: z.string().trim().min(3).max(120),
    postalCode: z.string().regex(/^\d{5}$/),
    municipalityIstat: z.string().regex(/^\d{6}$/),
    province: z.string().regex(/^[A-Z]{2}$/),
  }),
  sdiCode: z
    .string()
    .regex(/^[A-Z0-9]{7}$/)
    .optional(),
  pec: z.email().optional(),
});

/** CONT-01, CONT-02: the remittances (spec 06 «Pagamenti»), and the agency's statement. */
@ApiTags("accounting")
@ApiBearerAuth()
@Controller()
export class RemittancesController {
  constructor(
    @Inject(RemittancesService) private readonly remittances: RemittancesService,
    @Inject(InvoicesService) private readonly invoices: InvoicesService,
  ) {}

  @Get("back-office/remittances")
  @RequirePermission("accounting.view")
  list(@CurrentAuth() auth: AuthContext) {
    return this.remittances.list(auth);
  }

  @Post("back-office/remittances/prepare")
  @HttpCode(200)
  @RequirePermission("remittance.execute")
  prepare(@CurrentAuth() auth: AuthContext) {
    return this.remittances.prepare(auth);
  }

  @Post("back-office/remittances/:id/review")
  @HttpCode(200)
  @RequirePermission("remittance.execute")
  review(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.remittances.review(auth, parseInput(uuid, id));
  }

  @Post("back-office/remittances/file")
  @HttpCode(201)
  @RequirePermission("remittance.execute")
  generateFile(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    return this.remittances.generateFile(
      auth,
      parseInput(z.strictObject({ runDate: date }), body).runDate,
    );
  }

  @Get("back-office/remittances/:id/file")
  @RequirePermission("remittance.execute")
  async file(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Res() response: Response) {
    sendFile(response, await this.remittances.file(auth, parseInput(uuid, id)));
  }

  @Post("back-office/remittances/:id/execute")
  @HttpCode(200)
  @RequirePermission("remittance.execute")
  execute(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.remittances.execute(auth, parseInput(uuid, id));
  }

  @Get("agency/statement")
  @RequirePermission("accounting.agencyStatement")
  statement(@CurrentAuth() auth: AuthContext) {
    return this.remittances.agencyStatement(auth);
  }

  // Spec 06 «Fatturazione».
  @Get("back-office/invoices")
  @RequirePermission("accounting.view")
  invoiceList(@CurrentAuth() auth: AuthContext, @Query("daCompletare") toComplete?: string) {
    return this.invoices.list(auth, { toComplete: toComplete === "1" });
  }

  @Post("back-office/invoices/:id/recipient")
  @HttpCode(200)
  @RequirePermission("remittance.execute")
  complete(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    return this.invoices.complete(auth, parseInput(uuid, id), parseInput(completeSchema, body));
  }

  @Get("back-office/invoices/:id/pdf")
  @RequirePermission("accounting.view")
  async staffPdf(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Res() response: Response,
  ) {
    sendFile(response, await this.invoices.pdf(auth, parseInput(uuid, id), true));
  }

  @Get("invoices")
  @RequirePermission("invoice.viewOwn")
  own(@CurrentAuth() auth: AuthContext) {
    return this.invoices.own(auth);
  }

  @Get("invoices/:id/pdf")
  @RequirePermission("invoice.viewOwn")
  async pdf(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Res() response: Response) {
    sendFile(response, await this.invoices.pdf(auth, parseInput(uuid, id), false));
  }
}
