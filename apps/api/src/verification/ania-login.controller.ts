import {
  ANIA_LOGIN_KEYS,
  type AniaLoginAction,
  type AniaLoginPort,
  type AniaLoginState,
} from "@astax/adapters/ania";
import { withContext, type DbClient } from "@astax/db";
import { Body, Controller, Get, HttpCode, Inject, Post, Res } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { z } from "zod";
import { actorOf, AuditService } from "../audit/audit.service.js";
import type { AuthContext } from "../auth/auth-context.js";
import { CurrentAuth, RequirePermission } from "../auth/decorators.js";
import { ProblemError } from "../http/problem.js";
import { parseInput } from "../http/validation.js";
import { ANIA_LOGIN, DB } from "../infra/tokens.js";

const actionSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("click"),
    x: z.int().min(0).max(4000),
    y: z.int().min(0).max(4000),
  }),
  // What the operator types into the portal: never logged (rule 8).
  z.strictObject({ kind: z.literal("text"), text: z.string().min(1).max(200) }),
  z.strictObject({ kind: z.literal("key"), key: z.enum(ANIA_LOGIN_KEYS) }),
  z.strictObject({ kind: z.literal("scroll"), dy: z.int().min(-2000).max(2000) }),
]);

/**
 * Dan, 2026-10-28: the back office logs in to the agencies' portal on the
 * server, through a screen of the ANIA reader's browser; the readings then
 * use that same live session. Only the operators who decide on requests;
 * the log keeps who opened the screen and when the portal was ready, never
 * what was typed.
 */
@ApiTags("verification")
@ApiBearerAuth()
@Controller("verification/ania-login")
export class AniaLoginController {
  constructor(
    @Inject(ANIA_LOGIN) private readonly login: AniaLoginPort | null,
    @Inject(DB) private readonly db: DbClient,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private port(auth: AuthContext): AniaLoginPort {
    if (auth.membership?.organizationType !== "ASTAX") throw new ProblemError("NOT_FOUND");
    if (!this.login) {
      throw new ProblemError("CONFLICT", undefined, [{ path: "ania", issue: "ANIA_FAKE" }]);
    }
    return this.login;
  }

  private async log(auth: AuthContext, action: "ANIA_LOGIN_OPENED" | "ANIA_LOGIN_READY") {
    await withContext(this.db, auth.db, (tx) =>
      this.audit.inTransaction(tx, actorOf(auth), {
        action,
        targetType: "AniaReader",
        targetId: "portal",
      }),
    );
  }

  private answer(state: AniaLoginState | null): { state: AniaLoginState } {
    if (state === null) {
      throw new ProblemError("CONFLICT", undefined, [
        { path: "ania", issue: "ANIA_PROVIDER_ERROR" },
      ]);
    }
    return { state };
  }

  /** Whether the real reader is there and its portal session is open. */
  @Get("status")
  @RequirePermission("verification.decide")
  async status(@CurrentAuth() auth: AuthContext) {
    if (auth.membership?.organizationType !== "ASTAX") throw new ProblemError("NOT_FOUND");
    if (!this.login) return { real: false, state: null };
    return { real: true, state: await this.login.state() };
  }

  @Post("open")
  @HttpCode(200)
  @RequirePermission("verification.decide")
  async open(@CurrentAuth() auth: AuthContext) {
    const opened = await this.port(auth).open();
    if (!opened) {
      throw new ProblemError("CONFLICT", undefined, [
        { path: "ania", issue: "ANIA_PROVIDER_ERROR" },
      ]);
    }
    await this.log(auth, "ANIA_LOGIN_OPENED");
    if (opened.state === "READY") await this.log(auth, "ANIA_LOGIN_READY");
    return opened;
  }

  @Get("screen")
  @RequirePermission("verification.decide")
  async screen(@CurrentAuth() auth: AuthContext, @Res() response: Response): Promise<void> {
    const image = await this.port(auth).screen();
    if (!image) throw new ProblemError("NOT_FOUND");
    response.setHeader("content-type", "image/jpeg");
    response.setHeader("cache-control", "private, no-store");
    response.setHeader("x-content-type-options", "nosniff");
    response.end(Buffer.from(image));
  }

  @Post("action")
  @HttpCode(200)
  @RequirePermission("verification.decide")
  async act(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    const action = parseInput(actionSchema, body) as AniaLoginAction;
    const state = await this.port(auth).act(action);
    if (state === "READY") await this.log(auth, "ANIA_LOGIN_READY");
    return this.answer(state);
  }
}
