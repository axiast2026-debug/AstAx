import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import type { AuthContext } from "../auth/auth-context.js";
import { CurrentAuth, NoContext, RequirePermission } from "../auth/decorators.js";
import { parseInput } from "../http/validation.js";
import { TeamService } from "./team.service.js";

const flagsSchema = z
  .object({
    canIssue: z.boolean(),
    canSeeColleagueOffers: z.boolean(),
    canSeeAccounting: z.boolean(),
    seesAllClients: z.boolean(),
  })
  .partial()
  .strict();
const roleSchema = z.enum(["SUPERVISOR", "OPERATOR"]);

const inviteSchema = z
  .object({
    email: z.email().max(254),
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    role: roleSchema,
    flags: flagsSchema.default({}),
  })
  .strict();

const updateSchema = z
  .object({
    role: roleSchema.optional(),
    flags: flagsSchema.optional(),
    status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  })
  .strict()
  .refine(
    (v) => v.role !== undefined || v.flags !== undefined || v.status !== undefined,
    "nothing to change",
  );

@ApiTags("team")
@ApiBearerAuth()
@Controller()
export class TeamController {
  constructor(@Inject(TeamService) private readonly team: TeamService) {}

  @Get("team")
  @RequirePermission("team.manage")
  list(@CurrentAuth() auth: AuthContext) {
    return this.team.list(auth);
  }

  @Post("team/invites")
  @HttpCode(201)
  @RequirePermission("team.manage")
  invite(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    return this.team.invite(auth, parseInput(inviteSchema, body));
  }

  @Delete("team/invites/:id")
  @HttpCode(204)
  @RequirePermission("team.manage")
  async revoke(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<void> {
    await this.team.revokeInvite(auth, id);
  }

  @Patch("team/members/:id")
  @RequirePermission("team.manage")
  update(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    const input = parseInput(updateSchema, body);
    return this.team.updateMember(auth, id, {
      ...(input.role ? { role: input.role } : {}),
      ...(input.flags ? { flags: input.flags } : {}),
      ...(input.status ? { status: input.status } : {}),
    });
  }

  @Delete("team/members/:id")
  @HttpCode(204)
  @RequirePermission("team.manage")
  async remove(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<void> {
    await this.team.removeMember(auth, id);
  }

  /** Invitations for the caller, from any organization (sub-agent joining a second agency). */
  @Get("me/invites")
  @RequirePermission("profile.view")
  @NoContext()
  myInvites(@CurrentAuth() auth: AuthContext) {
    return this.team.myInvites(auth);
  }

  @Post("me/invites/:id/accept")
  @RequirePermission("profile.update")
  @NoContext()
  accept(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.team.acceptInvite(auth, id);
  }
}
