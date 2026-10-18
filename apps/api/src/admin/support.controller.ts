import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import type { AuthContext } from "../auth/auth-context.js";
import { CurrentAuth, RequirePermission } from "../auth/decorators.js";
import { parseInput } from "../http/validation.js";
import { SupportService } from "./support.service.js";

const status = z.enum(["OPEN", "WAITING_CUSTOMER", "CLOSED"]);
const openSchema = z.strictObject({
  subject: z.string().trim().min(3).max(200),
  channel: z.enum(["EMAIL", "PHONE", "CHAT"]),
  text: z.string().trim().min(3).max(5000),
  contactEmail: z.email().max(200).nullable().optional(),
  locale: z.enum(["it", "sq"]).default("it"),
  customerId: z.uuid().nullable().optional(),
  requestCode: z.string().trim().max(40).nullable().optional(),
});

/** Spec 06 «Assistenza» (support.tickets). */
@ApiTags("back-office")
@ApiBearerAuth()
@Controller("back-office/tickets")
export class SupportController {
  constructor(@Inject(SupportService) private readonly support: SupportService) {}

  @Get()
  @RequirePermission("support.tickets")
  list(@CurrentAuth() auth: AuthContext, @Query() query: unknown) {
    const input = parseInput(
      z.strictObject({
        status: z.union([status, z.literal("ALL")]).default("OPEN"),
        mine: z.enum(["1"]).optional(),
      }),
      query,
    );
    return this.support.list(auth, input.status, input.mine === "1");
  }

  @Post()
  @RequirePermission("support.tickets")
  open(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    const input = parseInput(openSchema, body);
    return this.support.open(auth, {
      ...input,
      contactEmail: input.contactEmail ?? null,
      customerId: input.customerId ?? null,
      requestCode: input.requestCode || null,
    });
  }

  @Get(":id")
  @RequirePermission("support.tickets")
  detail(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.support.detail(auth, parseInput(z.uuid(), id));
  }

  @Post(":id/messages")
  @RequirePermission("support.tickets")
  message(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    const input = parseInput(
      z.strictObject({ kind: z.enum(["REPLY", "NOTE"]), text: z.string().trim().min(3).max(5000) }),
      body,
    );
    return this.support.addMessage(auth, parseInput(z.uuid(), id), input.kind, input.text);
  }

  @Post(":id/status")
  @HttpCode(200)
  @RequirePermission("support.tickets")
  setStatus(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    const input = parseInput(z.strictObject({ status }), body);
    return this.support.setStatus(auth, parseInput(z.uuid(), id), input.status);
  }

  @Post(":id/assign")
  @HttpCode(200)
  @RequirePermission("support.tickets")
  assign(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.support.assignToMe(auth, parseInput(z.uuid(), id));
  }
}
