import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { z } from "zod";
import type { AuthContext } from "../auth/auth-context.js";
import { CurrentAuth, RequirePermission } from "../auth/decorators.js";
import { ProblemError } from "../http/problem.js";
import { parseInput } from "../http/validation.js";
import { ReconciliationService } from "./reconciliation.service.js";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const note = z.string().trim().min(3).max(1000);

/** Spec 06 «Pagamenti»: reconciliation of the separate account (proposal C). */
@ApiTags("back-office")
@ApiBearerAuth()
@Controller("back-office/reconciliation")
export class ReconciliationController {
  constructor(
    @Inject(ReconciliationService) private readonly reconciliation: ReconciliationService,
  ) {}

  /** The file is the body (CSV or camt.053 XML); its name goes in the query string. */
  @Post("statements")
  @RequirePermission("payment.reconcile")
  import(
    @CurrentAuth() auth: AuthContext,
    @Query("fileName") fileName: string | undefined,
    @Req() request: Request,
  ) {
    const body = request.body as unknown;
    if (!(body instanceof Buffer) || body.byteLength === 0) {
      throw new ProblemError("VALIDATION_FAILED", undefined, [
        { path: "file", issue: "FILE_REQUIRED" },
      ]);
    }
    return this.reconciliation.importStatement(
      auth,
      parseInput(z.string().trim().min(1).max(200), fileName ?? "estratto"),
      new Uint8Array(body),
    );
  }

  @Get("statements")
  @RequirePermission("accounting.view")
  statements(@CurrentAuth() auth: AuthContext) {
    return this.reconciliation.statements(auth);
  }

  @Get("lines")
  @RequirePermission("accounting.view")
  lines(@CurrentAuth() auth: AuthContext, @Query("status") status: string | undefined) {
    return this.reconciliation.lines(
      auth,
      parseInput(z.enum(["UNMATCHED", "MATCHED", "IGNORED"]), status ?? "UNMATCHED"),
    );
  }

  @Post("lines/:id/match")
  @HttpCode(200)
  @RequirePermission("payment.reconcile")
  match(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    const input = parseInput(z.strictObject({ paymentId: z.uuid(), note }), body);
    return this.reconciliation.match(auth, parseInput(z.uuid(), id), input.paymentId, input.note);
  }

  @Post("lines/:id/ignore")
  @HttpCode(200)
  @RequirePermission("payment.reconcile")
  ignore(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    const input = parseInput(z.strictObject({ note }), body);
    return this.reconciliation.ignore(auth, parseInput(z.uuid(), id), input.note);
  }

  @Post("lines/:id/reopen")
  @HttpCode(200)
  @RequirePermission("payment.reconcile")
  reopen(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    const input = parseInput(z.strictObject({ note }), body);
    return this.reconciliation.reopen(auth, parseInput(z.uuid(), id), input.note);
  }

  @Get("daily")
  @RequirePermission("accounting.view")
  daily(
    @CurrentAuth() auth: AuthContext,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
  ) {
    return this.reconciliation.daily(auth, parseInput(day, from), parseInput(day, to));
  }
}
