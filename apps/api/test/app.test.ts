import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InvalidConfigError, loadConfig } from "../src/config/config.js";
import { fakeDb, startTestApi, TEST_ENV, type TestApi } from "./helpers.js";

describe("configuration", () => {
  it("is validated at start-up and names the missing variables, not their values", () => {
    try {
      loadConfig({ ...TEST_ENV, DATABASE_URL: "mysql://x", FIELD_ENCRYPTION_KEY: "secret-value" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidConfigError);
      const message = (error as Error).message;
      expect(message).toContain("DATABASE_URL");
      expect(message).toContain("FIELD_ENCRYPTION_KEY");
      expect(message).not.toContain("secret-value");
    }
  });

  it("rule 13: DEV_TOOLS cannot be on in production", () => {
    expect(() => loadConfig({ ...TEST_ENV, NODE_ENV: "production", DEV_TOOLS: "true" })).toThrow(
      /DEV_TOOLS/,
    );
    expect(loadConfig({ ...TEST_ENV, NODE_ENV: "development", DEV_TOOLS: "true" }).DEV_TOOLS).toBe(
      true,
    );
  });
});

describe("API skeleton", () => {
  let api: TestApi;

  beforeAll(async () => {
    api = await startTestApi({ db: fakeDb(true) });
  });

  afterAll(async () => {
    await api.close();
  });

  it("health check answers with the time from the Clock", async () => {
    const response = await fetch(`${api.baseUrl}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      database: "ok",
      time: "2026-11-16T09:00:00.000Z",
    });
  });

  it("errors are application/problem+json with a stable code", async () => {
    const response = await fetch(`${api.baseUrl}/does-not-exist`);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    expect(await response.json()).toEqual({
      type: "https://astax.it/problems/not-found",
      title: "Not found",
      status: 404,
      code: "NOT_FOUND",
      instance: "/does-not-exist",
    });
  });

  it("publishes the OpenAPI document generated from the code", async () => {
    const document = (await (await fetch(`${api.baseUrl}/openapi.json`)).json()) as {
      openapi: string;
      paths: Record<string, unknown>;
    };
    expect(document.openapi).toMatch(/^3\./);
    expect(Object.keys(document.paths)).toContain("/health");
  });

  it("logs one line per request without query strings", async () => {
    await fetch(`${api.baseUrl}/health?email=giulia.neri@example.test`);
    const line = api.logs.find((l) => l.includes('"path":"/health"'));
    expect(line).toBeDefined();
    expect(api.logs.join("")).not.toContain("giulia.neri");
    expect(line).toContain('"status":200');
  });

  it("propagates a well-formed request id and replaces a malformed one", async () => {
    const kept = await fetch(`${api.baseUrl}/health`, {
      headers: { "x-request-id": "abcdef12-3456" },
    });
    expect(kept.headers.get("x-request-id")).toBe("abcdef12-3456");
    const replaced = await fetch(`${api.baseUrl}/health`, {
      headers: { "x-request-id": "<script>" },
    });
    expect(replaced.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("unexpected errors", () => {
  it("health reports a degraded database instead of failing", async () => {
    const api = await startTestApi({ db: fakeDb(false) });
    try {
      const response = await fetch(`${api.baseUrl}/health`);
      expect(await response.json()).toMatchObject({ status: "degraded", database: "unreachable" });
    } finally {
      await api.close();
    }
  });
});
