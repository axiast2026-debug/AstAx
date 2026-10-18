import "reflect-metadata";
import { Writable } from "node:stream";
import { createLogger } from "@astax/shared/logging";
import { Controller, Get } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AuditService, type AuditEvent } from "../src/audit/audit.service.js";
import { AuthGuard } from "../src/auth/auth.guard.js";
import { RateLimiter } from "../src/security/rate-limiter.js";
import { NoContext, RequirePermission } from "../src/auth/decorators.js";
import type { TokenVerifier } from "../src/auth/token-verifier.js";
import { UserResolver } from "../src/auth/user-resolver.js";
import { ProblemFilter } from "../src/http/problem.filter.js";
import { Public } from "../src/http/public.decorator.js";
import { LOGGER, TOKEN_VERIFIER } from "../src/infra/tokens.js";
import { LegalGate } from "../src/legal/legal-gate.js";

@Controller("probe")
class ProbeController {
  @Get("open")
  @Public()
  open() {
    return { ok: true };
  }

  @Get("undeclared")
  @NoContext()
  undeclared() {
    return { secret: "should never be returned" };
  }

  @Get("declared")
  @RequirePermission("profile.view")
  @NoContext()
  declared() {
    return { ok: true };
  }
}

describe("SIC-01 AuthGuard default deny", () => {
  let baseUrl: string;
  let close: () => Promise<void>;
  const audited: AuditEvent[] = [];

  beforeAll(async () => {
    const verifier: TokenVerifier = {
      verify: async () => ({
        sub: "kc-1",
        azp: "astax-web-private",
        roles: ["astax-private"],
        email: null,
        emailVerified: false,
        givenName: null,
        familyName: null,
      }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [ProbeController],
      providers: [
        {
          provide: LOGGER,
          useValue: createLogger({
            name: "t",
            destination: new Writable({ write: (_c, _e, cb) => cb() }),
          }),
        },
        { provide: TOKEN_VERIFIER, useValue: verifier },
        {
          provide: UserResolver,
          useValue: {
            resolve: async () => ({ user: { id: "u-1", kind: "PRIVATE", status: "ACTIVE" } }),
            activeMemberships: async () => [],
          },
        },
        {
          provide: AuditService,
          useValue: {
            record: async (_actor: unknown, event: AuditEvent) => void audited.push(event),
          },
        },
        { provide: LegalGate, useValue: { hasPending: async () => false } },
        // Phase 8: the limits are tested in rate-limits.int.test.ts.
        {
          provide: RateLimiter,
          useValue: { assertNotBlocked: async () => {}, record: async () => {} },
        },
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_FILTER, useClass: ProblemFilter },
      ],
    }).compile();
    const app = moduleRef.createNestApplication({ logger: false });
    await app.listen(0, "127.0.0.1");
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
    close = () => app.close();
  });

  afterAll(async () => {
    await close();
  });

  const get = (path: string, token = true) =>
    fetch(`${baseUrl}${path}`, token ? { headers: { authorization: "Bearer x" } } : {});

  it("@Public endpoints need nothing", async () => {
    expect((await get("/probe/open", false)).status).toBe(200);
  });

  it("an endpoint that declares no permission answers 403 even to an authenticated user, and it is logged", async () => {
    const response = await get("/probe/undeclared");
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain("should never be returned");
    expect(audited.at(-1)).toMatchObject({
      action: "ACCESS_DENIED",
      after: { code: "FORBIDDEN", reason: "NO_PERMISSION_DECLARED" },
    });
  });

  it("a declared permission held by the user lets the call through", async () => {
    expect((await get("/probe/declared")).status).toBe(200);
  });

  it("without a token: 401, not logged in the audit chain", async () => {
    const before = audited.length;
    expect((await get("/probe/declared", false)).status).toBe(401);
    expect(audited.length).toBe(before);
  });
});
