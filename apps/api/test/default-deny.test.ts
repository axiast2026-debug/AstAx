import "reflect-metadata";
import { Writable } from "node:stream";
import { createLogger } from "@astax/shared/logging";
import { Controller, Get } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DefaultDenyGuard } from "../src/http/default-deny.guard.js";
import { ProblemFilter } from "../src/http/problem.filter.js";
import { Public } from "../src/http/public.decorator.js";
import { LOGGER } from "../src/infra/tokens.js";

@Controller("probe")
class ProbeController {
  @Get("open")
  @Public()
  open(): { ok: true } {
    return { ok: true };
  }

  @Get("closed")
  closed(): { secret: string } {
    return { secret: "should never be returned" };
  }
}

describe("SIC-01 default deny", () => {
  let baseUrl: string;
  let close: () => Promise<void>;

  beforeAll(async () => {
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
        { provide: APP_GUARD, useClass: DefaultDenyGuard },
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

  it("lets through only endpoints marked @Public", async () => {
    expect((await fetch(`${baseUrl}/probe/open`)).status).toBe(200);
  });

  it("closes every other endpoint with a problem+json 401", async () => {
    const response = await fetch(`${baseUrl}/probe/closed`);
    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    const body = await response.text();
    expect(body).toContain('"code":"UNAUTHENTICATED"');
    expect(body).not.toContain("should never be returned");
  });
});
