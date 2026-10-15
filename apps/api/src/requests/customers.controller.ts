import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import type { AuthContext } from "../auth/auth-context.js";
import { CurrentAuth, RequirePermission } from "../auth/decorators.js";
import { parseInput } from "../http/validation.js";
import { CustomersService } from "./customers.service.js";

const contacts = {
  email: z.email().max(254).optional(),
  phone: z
    .string()
    .regex(/^\+?[\d\s-]{6,20}$/)
    .optional(),
};
const createSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("PERSON"),
    surname: z.string().trim().min(1).max(80),
    givenName: z.string().trim().min(1).max(80),
    fiscalCode: z.string().trim().min(16).max(20),
    ...contacts,
  }),
  z.strictObject({
    kind: z.literal("COMPANY"),
    companyName: z.string().trim().min(1).max(160),
    vatNumber: z.string().trim().min(11).max(15),
    ...contacts,
  }),
]);

/** The broker's customers (spec 02 «Clienti»). */
@ApiTags("customers")
@ApiBearerAuth()
@Controller("customers")
export class CustomersController {
  constructor(@Inject(CustomersService) private readonly customers: CustomersService) {}

  @Get()
  @RequirePermission("brokerCustomer.manage")
  list(@CurrentAuth() auth: AuthContext, @Query("q") q: string | undefined) {
    return this.customers.list(auth, q);
  }

  @Post()
  @HttpCode(201)
  @RequirePermission("brokerCustomer.manage")
  create(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    return this.customers.create(auth, parseInput(createSchema, body));
  }

  @Get(":id")
  @RequirePermission("brokerCustomer.manage")
  detail(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.customers.detail(auth, parseInput(z.uuid(), id));
  }
}
