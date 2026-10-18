import { Body, Controller, Get, HttpCode, Inject, Param, Post, Res } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { z } from "zod";
import type { AuthContext } from "../auth/auth-context.js";
import { CurrentAuth, RequirePermission } from "../auth/decorators.js";
import { parseInput } from "../http/validation.js";
import { sendFile } from "../requests/requests.controller.js";
import { CustomersBackOfficeService } from "./customers-bo.service.js";

const openSchema = z.strictObject({
  kind: z.enum(["ACCESS", "RECTIFICATION", "ERASURE"]),
  description: z.string().trim().min(3).max(2000),
  receivedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
const closeSchema = z.strictObject({
  done: z.boolean(),
  outcome: z.string().trim().min(3).max(2000),
});

/** Spec 06 «Clienti» (accessLog.viewCustomer; the data requests: dataSubjectRequest.manage). */
@ApiTags("back-office")
@ApiBearerAuth()
@Controller("back-office")
export class CustomersBackOfficeController {
  constructor(
    @Inject(CustomersBackOfficeService) private readonly customers: CustomersBackOfficeService,
  ) {}

  /** Rule 8: names, fiscal codes and plates travel in the body, never in the URL. */
  @Post("customers/search")
  @HttpCode(200)
  @RequirePermission("accessLog.viewCustomer")
  search(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    const { q } = parseInput(z.strictObject({ q: z.string().max(120) }), body);
    return this.customers.search(auth, q);
  }

  @Get("customers/:id")
  @RequirePermission("accessLog.viewCustomer")
  card(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.customers.card(auth, parseInput(z.uuid(), id));
  }

  @Get("customers/:id/export")
  @RequirePermission("accessLog.viewCustomer")
  async export(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Res() response: Response,
  ) {
    sendFile(response, await this.customers.exportData(auth, parseInput(z.uuid(), id)));
  }

  @Post("customers/:id/data-requests")
  @RequirePermission("dataSubjectRequest.manage")
  open(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    return this.customers.openRequest(auth, parseInput(z.uuid(), id), parseInput(openSchema, body));
  }

  @Get("data-requests")
  @RequirePermission("dataSubjectRequest.manage")
  openRequests(@CurrentAuth() auth: AuthContext) {
    return this.customers.openRequests(auth);
  }

  @Post("data-requests/:id/close")
  @HttpCode(200)
  @RequirePermission("dataSubjectRequest.manage")
  close(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    const input = parseInput(closeSchema, body);
    return this.customers.closeRequest(auth, parseInput(z.uuid(), id), input.done, input.outcome);
  }
}
