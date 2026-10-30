import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Res } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { z } from "zod";
import type { AuthContext } from "../auth/auth-context.js";
import { CurrentAuth, NoContext, RequirePermission } from "../auth/decorators.js";
import { parseInput } from "../http/validation.js";
import { sendFile } from "../requests/requests.controller.js";
import { ComplaintsService } from "./complaints.service.js";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const text = (min: number, max: number) => z.string().trim().min(min).max(max);

/** Spec 03 «Assistenza e reclami»: the private's own complaints. */
@ApiTags("complaints")
@ApiBearerAuth()
@Controller("me/complaints")
export class OwnComplaintsController {
  constructor(@Inject(ComplaintsService) private readonly complaints: ComplaintsService) {}

  @Get()
  @RequirePermission("complaint.open")
  @NoContext()
  own(@CurrentAuth() auth: AuthContext) {
    return this.complaints.own(auth);
  }

  @Post()
  @RequirePermission("complaint.open")
  @NoContext()
  file(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    const input = parseInput(
      z.strictObject({
        subject: text(3, 200),
        description: text(10, 5000),
        requestCode: z.string().trim().max(40).nullable().optional(),
      }),
      body,
    );
    return this.complaints.fileOwn(auth, { ...input, requestCode: input.requestCode || null });
  }
}

/** Spec 06 «Reclami». */
@ApiTags("back-office")
@ApiBearerAuth()
@Controller("back-office/complaints")
export class ComplaintsController {
  constructor(@Inject(ComplaintsService) private readonly complaints: ComplaintsService) {}

  @Get()
  @RequirePermission("complaint.manage")
  list(@CurrentAuth() auth: AuthContext, @Query("status") status: string | undefined) {
    return this.complaints.list(
      auth,
      parseInput(z.enum(["OPEN", "ANSWERED", "ALL"]), status ?? "OPEN"),
    );
  }

  @Post()
  @RequirePermission("complaint.register")
  register(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    const input = parseInput(
      z.strictObject({
        channel: z.enum(["EMAIL", "PEC", "POST", "PHONE"]),
        receivedOn: day,
        complainantName: text(2, 200),
        complainantEmail: z.email().max(200).nullable().optional(),
        subject: text(3, 200),
        description: text(10, 5000),
        requestCode: z.string().trim().max(40).nullable().optional(),
        organizationId: z.uuid().nullable().optional(),
      }),
      body,
    );
    return this.complaints.registerReceived(auth, {
      ...input,
      complainantEmail: input.complainantEmail ?? null,
      requestCode: input.requestCode || null,
      organizationId: input.organizationId ?? null,
    });
  }

  @Get("export")
  @RequirePermission("complaint.export")
  async export(
    @CurrentAuth() auth: AuthContext,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Res() response: Response,
  ) {
    sendFile(
      response,
      await this.complaints.exportCsv(auth, parseInput(day, from), parseInput(day, to)),
    );
  }

  @Get(":id")
  @RequirePermission("complaint.manage")
  detail(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.complaints.detail(auth, parseInput(z.uuid(), id));
  }

  @Post(":id/answer")
  @HttpCode(200)
  @RequirePermission("complaint.manage")
  answer(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    const input = parseInput(
      z.strictObject({
        responseText: text(10, 10_000),
        outcome: z.enum(["ACCEPTED", "PARTIALLY_ACCEPTED", "REJECTED"]),
      }),
      body,
    );
    return this.complaints.answer(
      auth,
      parseInput(z.uuid(), id),
      input.responseText,
      input.outcome,
    );
  }
}
