import { Body, Controller, Get, Inject, Param, Put, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import type { AuthContext } from "../auth/auth-context.js";
import { CurrentAuth, RequirePermission } from "../auth/decorators.js";
import { parseInput } from "../http/validation.js";
import { SettingsService } from "./settings.service.js";

const changeSchema = z
  .object({
    value: z.unknown(),
    reason: z.string().trim().min(3).max(500),
    validFrom: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();
const atSchema = z.object({ at: z.iso.datetime({ offset: true }).optional() });

/** Administration of the parameters; the interface arrives in phase 7. */
@ApiTags("admin")
@ApiBearerAuth()
@Controller("admin/settings")
export class SettingsController {
  constructor(@Inject(SettingsService) private readonly settings: SettingsService) {}

  @Get()
  @RequirePermission("admin.settings.manage")
  list(@CurrentAuth() auth: AuthContext, @Query() query: unknown) {
    const { at } = parseInput(atSchema, query);
    return this.settings.valuesAt(auth, at ? new Date(at) : undefined);
  }

  @Get(":key/history")
  @RequirePermission("admin.settings.manage")
  history(@CurrentAuth() auth: AuthContext, @Param("key") key: string) {
    return this.settings.history(auth, key);
  }

  @Put(":key")
  @RequirePermission("admin.settings.manage")
  change(@CurrentAuth() auth: AuthContext, @Param("key") key: string, @Body() body: unknown) {
    const input = parseInput(changeSchema, body);
    return this.settings.change(auth, key, {
      value: input.value,
      reason: input.reason,
      ...(input.validFrom ? { validFrom: new Date(input.validFrom) } : {}),
    });
  }
}
