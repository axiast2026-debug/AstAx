import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import type { AuthContext } from "../auth/auth-context.js";
import { CurrentAuth, RequirePermission } from "../auth/decorators.js";
import { parseInput } from "../http/validation.js";
import { CatalogAdminService } from "./catalog-admin.service.js";

const reason = z.string().trim().min(3).max(500);
const code = z
  .string()
  .regex(/^[A-Z][A-Z0-9_]*$/)
  .max(60);
const listKey = z
  .string()
  .regex(/^[a-zA-Z]+$/)
  .max(60);
const label = z.string().trim().min(1).max(300);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const packageVersion = z.strictObject({
  requirements: z.unknown(),
  customerTextIt: z.string().trim().min(3).max(2000),
  validFrom: z.iso.datetime({ offset: true }),
  reason,
});
const exclusion = z.strictObject({
  blockingInWizard: z.boolean(),
  messageIt: label,
  active: z.boolean(),
  reason,
});
const listValue = z.strictObject({
  labelIt: label,
  active: z.boolean(),
  sortOrder: z.number().int().min(0).max(10_000),
  reason,
});

/** Spec 07 «Pacchetti e casi esclusi», «Elenchi e festività» (admin.catalog.manage). */
@ApiTags("admin")
@ApiBearerAuth()
@Controller("admin")
export class CatalogAdminController {
  constructor(@Inject(CatalogAdminService) private readonly catalog: CatalogAdminService) {}

  @Get("packages")
  @RequirePermission("admin.catalog.manage")
  packages(@CurrentAuth() auth: AuthContext) {
    return this.catalog.packages(auth);
  }

  @Post("packages/:code/versions")
  @RequirePermission("admin.catalog.manage")
  newPackageVersion(
    @CurrentAuth() auth: AuthContext,
    @Param("code") packageCode: string,
    @Body() body: unknown,
  ) {
    const input = parseInput(packageVersion, body);
    return this.catalog.newPackageVersion(auth, parseInput(code, packageCode), {
      requirements: input.requirements,
      customerTextIt: input.customerTextIt,
      validFrom: new Date(input.validFrom),
      reason: input.reason,
    });
  }

  @Get("exclusion-rules")
  @RequirePermission("admin.catalog.manage")
  exclusions(@CurrentAuth() auth: AuthContext) {
    return this.catalog.exclusions(auth);
  }

  @Post("exclusion-rules")
  @RequirePermission("admin.catalog.manage")
  createExclusion(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    const input = parseInput(exclusion.extend({ code }), body);
    return this.catalog.saveExclusion(auth, input.code, input, true);
  }

  @Put("exclusion-rules/:code")
  @RequirePermission("admin.catalog.manage")
  saveExclusion(
    @CurrentAuth() auth: AuthContext,
    @Param("code") ruleCode: string,
    @Body() body: unknown,
  ) {
    return this.catalog.saveExclusion(
      auth,
      parseInput(code, ruleCode),
      parseInput(exclusion, body),
      false,
    );
  }

  @Get("lists")
  @RequirePermission("admin.catalog.manage")
  lists(@CurrentAuth() auth: AuthContext) {
    return this.catalog.lists(auth);
  }

  @Post("lists/:listKey")
  @RequirePermission("admin.catalog.manage")
  createListValue(
    @CurrentAuth() auth: AuthContext,
    @Param("listKey") key: string,
    @Body() body: unknown,
  ) {
    const input = parseInput(listValue.extend({ code }), body);
    return this.catalog.saveListValue(auth, parseInput(listKey, key), input.code, input, true);
  }

  @Put("lists/:listKey/:code")
  @RequirePermission("admin.catalog.manage")
  saveListValue(
    @CurrentAuth() auth: AuthContext,
    @Param("listKey") key: string,
    @Param("code") valueCode: string,
    @Body() body: unknown,
  ) {
    return this.catalog.saveListValue(
      auth,
      parseInput(listKey, key),
      parseInput(code, valueCode),
      parseInput(listValue, body),
      false,
    );
  }

  @Get("holidays")
  @RequirePermission("admin.catalog.manage")
  holidays(@CurrentAuth() auth: AuthContext, @Query() query: unknown) {
    const { year } = parseInput(
      z.strictObject({ year: z.coerce.number().int().min(2026).max(2100).optional() }),
      query,
    );
    return this.catalog.holidays(auth, year);
  }

  @Post("holidays")
  @RequirePermission("admin.catalog.manage")
  addHoliday(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    const input = parseInput(
      z.strictObject({ date: day, name: label, nameSq: label.nullable().optional(), reason }),
      body,
    );
    return this.catalog.addHoliday(auth, { ...input, nameSq: input.nameSq ?? null });
  }

  @Post("holidays/confirm-year")
  @HttpCode(200)
  @RequirePermission("admin.catalog.manage")
  confirmYear(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    const input = parseInput(
      z.strictObject({ year: z.number().int().min(2026).max(2100), reason }),
      body,
    );
    return this.catalog.confirmYear(auth, input.year, input.reason);
  }

  @Post("holidays/:id/remove")
  @HttpCode(200)
  @RequirePermission("admin.catalog.manage")
  removeHoliday(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    const input = parseInput(z.strictObject({ reason }), body);
    return this.catalog.removeHoliday(auth, parseInput(z.uuid(), id), input.reason);
  }
}
