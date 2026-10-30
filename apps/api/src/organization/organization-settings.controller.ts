import { Body, Controller, Get, HttpCode, Inject, Post, Put } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { AuthContext } from "../auth/auth-context.js";
import { CurrentAuth, RequirePermission } from "../auth/decorators.js";
import { OrganizationSettingsService } from "./organization-settings.service.js";

/** «Impostazioni» of the owner of an agency or a broker (audit of 2026-10-30, A3). */
@ApiTags("organization")
@ApiBearerAuth()
@Controller("organization")
export class OrganizationSettingsController {
  constructor(
    @Inject(OrganizationSettingsService) private readonly settings: OrganizationSettingsService,
  ) {}

  @Get("settings")
  @RequirePermission("organization.editProfile")
  view(@CurrentAuth() auth: AuthContext) {
    return this.settings.view(auth);
  }

  @Put("settings")
  @RequirePermission("organization.editProfile")
  update(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    return this.settings.updateProfile(auth, body);
  }

  @Post("iban/code")
  @HttpCode(204)
  @RequirePermission("organization.editProfile")
  async ibanCode(@CurrentAuth() auth: AuthContext, @Body() body: unknown): Promise<void> {
    await this.settings.sendIbanCode(auth, body);
  }

  @Post("iban")
  @HttpCode(200)
  @RequirePermission("organization.editProfile")
  iban(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    return this.settings.changeIban(auth, body);
  }

  @Post("mandates/request")
  @HttpCode(201)
  @RequirePermission("organization.editProfile")
  mandates(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    return this.settings.requestMandates(auth, body);
  }
}
