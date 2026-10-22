import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import type { AuthContext } from "../auth/auth-context.js";
import { CurrentAuth, RequirePermission } from "../auth/decorators.js";
import { parseInput } from "../http/validation.js";
import { CommunicationsService } from "./communications.service.js";

const key = z
  .string()
  .regex(/^[a-z_.]+$/)
  .max(80);
const text = z.string().max(4000).optional();
const texts = z.strictObject({
  title: text,
  body: text,
  emailSubject: text,
  emailBody: text,
  sms: z.string().max(480).optional(),
});
const reason = z.string().trim().min(3).max(500);

/** Spec 07 «Comunicazioni» (admin.notifications.manage). */
@ApiTags("admin")
@ApiBearerAuth()
@Controller("admin")
export class CommunicationsController {
  constructor(
    @Inject(CommunicationsService) private readonly communications: CommunicationsService,
  ) {}

  @Get("notification-templates")
  @RequirePermission("admin.notifications.manage")
  list() {
    return this.communications.list();
  }

  @Get("notification-templates/:key/history")
  @RequirePermission("admin.notifications.manage")
  history(@CurrentAuth() auth: AuthContext, @Param("key") eventKey: string) {
    return this.communications.history(auth, parseInput(key, eventKey));
  }

  @Put("notification-templates/:key")
  @RequirePermission("admin.notifications.manage")
  update(@CurrentAuth() auth: AuthContext, @Param("key") eventKey: string, @Body() body: unknown) {
    const input = parseInput(z.strictObject({ it: texts, reason }), body);
    return this.communications.update(auth, parseInput(key, eventKey), {
      it: input.it,
      reason: input.reason,
    });
  }

  @Post("notification-templates/:key/preview")
  @HttpCode(200)
  @RequirePermission("admin.notifications.manage")
  preview(@Param("key") eventKey: string, @Body() body: unknown) {
    const input = parseInput(z.strictObject({ texts: texts.optional() }), body);
    return this.communications.preview(parseInput(key, eventKey), input.texts);
  }

  @Post("notification-templates/:key/test")
  @HttpCode(200)
  @RequirePermission("admin.notifications.manage")
  test(@CurrentAuth() auth: AuthContext, @Param("key") eventKey: string) {
    return this.communications.test(auth, parseInput(key, eventKey));
  }

  @Post("communications")
  @HttpCode(201)
  @RequirePermission("admin.notifications.manage")
  broadcast(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    return this.communications.broadcast(
      auth,
      parseInput(
        z.strictObject({
          group: z.enum(["PRIVATE", "AGENCY", "BROKER", "STAFF"]),
          title: z.string().trim().min(3).max(120),
          text: z.string().trim().min(3).max(2000),
          reason,
        }),
        body,
      ),
    );
  }
}
