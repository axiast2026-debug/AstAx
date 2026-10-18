import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import type { AuthContext } from "../auth/auth-context.js";
import { CurrentAuth, RequirePermission } from "../auth/decorators.js";
import { parseInput } from "../http/validation.js";
import { STAFF_ROLES, UsersAdminService } from "./users-admin.service.js";

const reason = z.strictObject({ reason: z.string().trim().min(3).max(500) });
const listQuery = z.strictObject({
  q: z.string().trim().max(120).optional(),
  kind: z.enum(["PRIVATE", "PROFESSIONAL", "STAFF"]).optional(),
});
const staffRole = z.strictObject({
  role: z.enum(STAFF_ROLES).nullable(),
  reason: z.string().trim().min(3).max(500),
});

/** Spec 07 «Utenti e permessi» (admin.users.manage). */
@ApiTags("admin")
@ApiBearerAuth()
@Controller("admin/users")
export class UsersAdminController {
  constructor(@Inject(UsersAdminService) private readonly users: UsersAdminService) {}

  @Get()
  @RequirePermission("admin.users.manage")
  list(@CurrentAuth() auth: AuthContext, @Query() query: unknown) {
    return this.users.list(auth, parseInput(listQuery, query));
  }

  @Post(":id/block")
  @HttpCode(200)
  @RequirePermission("admin.users.manage")
  block(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    const input = parseInput(reason, body);
    return this.users.setBlocked(auth, parseInput(z.uuid(), id), true, input.reason);
  }

  @Post(":id/unblock")
  @HttpCode(200)
  @RequirePermission("admin.users.manage")
  unblock(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    const input = parseInput(reason, body);
    return this.users.setBlocked(auth, parseInput(z.uuid(), id), false, input.reason);
  }

  @Post(":id/reset-second-factor")
  @HttpCode(200)
  @RequirePermission("admin.users.manage")
  resetSecondFactor(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const input = parseInput(reason, body);
    return this.users.resetSecondFactor(auth, parseInput(z.uuid(), id), input.reason);
  }

  @Put(":id/staff-role")
  @RequirePermission("admin.users.manage")
  setStaffRole(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    const input = parseInput(staffRole, body);
    return this.users.setStaffRole(auth, parseInput(z.uuid(), id), input.role, input.reason);
  }
}
