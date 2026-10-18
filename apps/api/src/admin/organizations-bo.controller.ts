import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import type { AuthContext } from "../auth/auth-context.js";
import { CurrentAuth, RequirePermission } from "../auth/decorators.js";
import { parseInput } from "../http/validation.js";
import { OrganizationsBackOfficeService } from "./organizations-bo.service.js";

const reason = z.strictObject({ reason: z.string().trim().min(3).max(500) });
const note = z.strictObject({
  kind: z.enum(["NOTE", "EXCLUSION_PROPOSAL"]),
  text: z.string().trim().min(3).max(2000),
});

/** Spec 06 «Agenzie e broker» (organization.suspend). */
@ApiTags("back-office")
@ApiBearerAuth()
@Controller("back-office/organizations")
export class OrganizationsBackOfficeController {
  constructor(
    @Inject(OrganizationsBackOfficeService)
    private readonly organizations: OrganizationsBackOfficeService,
  ) {}

  @Get()
  @RequirePermission("organization.suspend")
  list(@CurrentAuth() auth: AuthContext, @Query() query: unknown) {
    return this.organizations.list(
      auth,
      parseInput(
        z.strictObject({
          type: z.enum(["AGENCY", "BROKER"]).optional(),
          q: z.string().trim().max(120).optional(),
        }),
        query,
      ),
    );
  }

  @Get(":id")
  @RequirePermission("organization.suspend")
  detail(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.organizations.detail(auth, parseInput(z.uuid(), id));
  }

  @Post(":id/suspend")
  @HttpCode(200)
  @RequirePermission("organization.suspend")
  suspend(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    return this.organizations.suspend(
      auth,
      parseInput(z.uuid(), id),
      parseInput(reason, body).reason,
    );
  }

  @Post(":id/reactivate")
  @HttpCode(200)
  @RequirePermission("organization.suspend")
  reactivate(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    return this.organizations.reactivate(
      auth,
      parseInput(z.uuid(), id),
      parseInput(reason, body).reason,
    );
  }

  @Post(":id/notes")
  @RequirePermission("organization.suspend")
  addNote(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    const input = parseInput(note, body);
    return this.organizations.addNote(auth, parseInput(z.uuid(), id), input.kind, input.text);
  }
}

/** Spec 07 «Agenzie e broker»: the exclusion proposals (organization.exclude). */
@ApiTags("admin")
@ApiBearerAuth()
@Controller("admin/exclusion-proposals")
export class ExclusionProposalsController {
  constructor(
    @Inject(OrganizationsBackOfficeService)
    private readonly organizations: OrganizationsBackOfficeService,
  ) {}

  @Get()
  @RequirePermission("organization.exclude")
  list(@CurrentAuth() auth: AuthContext) {
    return this.organizations.proposals(auth);
  }

  @Post(":id/decide")
  @HttpCode(200)
  @RequirePermission("organization.exclude")
  decide(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    const input = parseInput(
      z.strictObject({ accept: z.boolean(), reason: z.string().trim().min(3).max(500) }),
      body,
    );
    return this.organizations.decideExclusion(
      auth,
      parseInput(z.uuid(), id),
      input.accept,
      input.reason,
    );
  }
}
