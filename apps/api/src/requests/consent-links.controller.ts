import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { z } from "zod";
import { Public } from "../http/public.decorator.js";
import { parseInput } from "../http/validation.js";
import { ConsentService } from "./consent.service.js";

const codeSchema = z.strictObject({ code: z.string().regex(/^\d{6}$/) });

/**
 * The page the broker's customer opens from the email or SMS: no account,
 * the secret token in the link is the proof (consent.signature_request). The
 * customer confirms with a code sent to their own contacts.
 */
@ApiTags("consent-links")
@Controller("consent-links")
export class ConsentLinksController {
  constructor(@Inject(ConsentService) private readonly consents: ConsentService) {}

  @Get(":token")
  @Public()
  summary(@Param("token") token: string) {
    return this.consents.linkSummary(token);
  }

  @Post(":token/code")
  @HttpCode(204)
  @Public()
  async sendCode(@Param("token") token: string): Promise<void> {
    await this.consents.sendLinkCode(token);
  }

  @Post(":token/confirm")
  @HttpCode(200)
  @Public()
  confirm(@Param("token") token: string, @Body() body: unknown, @Req() request: Request) {
    return this.consents.confirmLink(token, parseInput(codeSchema, body).code, {
      ip: request.ip ?? null,
      userAgent: request.headers["user-agent"]?.slice(0, 300) ?? null,
    });
  }
}
