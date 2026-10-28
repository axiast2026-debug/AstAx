import type { AniaLoginAction, AniaLoginPort, AniaLoginState } from "@astax/adapters/ania";
import { SYSTEM_CONTEXT, withContext } from "@astax/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { acceptAllLegal, membershipId, startHarness, type Harness } from "./fixtures.js";
import { requestHelpers, type Who } from "./request-helpers.js";

// Dan, 2026-10-28: the back office logs in to the portal through the screen of
// the ANIA reader's browser. Here the portal is simulated.
class SimulatedPortal implements AniaLoginPort {
  readonly actions: AniaLoginAction[] = [];
  private current: AniaLoginState = "LOGIN";
  async open() {
    return { state: this.current, screen: { width: 1280, height: 800 } };
  }
  async state() {
    return this.current;
  }
  async screen() {
    return new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
  }
  async act(action: AniaLoginAction) {
    this.actions.push(action);
    if (action.kind === "key" && action.key === "Enter") this.current = "READY";
    return this.current;
  }
}

const portal = new SimulatedPortal();
let h: Harness;
let r: ReturnType<typeof requestHelpers>;
let verifier: Who;

beforeAll(async () => {
  h = await startHarness({ aniaLogin: portal });
  r = requestHelpers(h);
  await acceptAllLegal(h, "bo-verifier");
  verifier = {
    token: await h.tokenFor("bo-verifier"),
    context: membershipId("bo-verifier", "astax"),
  };
});

afterAll(async () => {
  await h.close();
});

const audit = (action: string) =>
  withContext(h.db, SYSTEM_CONTEXT, (tx) =>
    tx.auditLog.findMany({ where: { action, targetType: "AniaReader" } }),
  );

describe("login to the ANIA portal from the back office", () => {
  it("the operator opens the screen, clicks, types and presses Enter; the log keeps who and when, never the text", async () => {
    expect(await r.json(await r.call(verifier, "/verification/ania-login/status"), 200)).toEqual({
      real: true,
      state: "LOGIN",
    });
    expect(
      await r.json(await r.call(verifier, "/verification/ania-login/open", { body: {} }), 200),
    ).toEqual({
      state: "LOGIN",
      screen: { width: 1280, height: 800 },
    });
    const screen = await r.call(verifier, "/verification/ania-login/screen");
    expect(screen.headers.get("content-type")).toBe("image/jpeg");
    expect(screen.headers.get("cache-control")).toBe("private, no-store");

    await r.json(
      await r.call(verifier, "/verification/ania-login/action", {
        body: { kind: "click", x: 100, y: 200 },
      }),
      200,
    );
    await r.json(
      await r.call(verifier, "/verification/ania-login/action", {
        body: { kind: "text", text: "segreto-di-prova" },
      }),
      200,
    );
    expect(
      await r.json(
        await r.call(verifier, "/verification/ania-login/action", {
          body: { kind: "key", key: "Enter" },
        }),
        200,
      ),
    ).toEqual({ state: "READY" });
    expect(portal.actions).toHaveLength(3);
    expect(await audit("ANIA_LOGIN_OPENED")).toHaveLength(1);
    expect(await audit("ANIA_LOGIN_READY")).toHaveLength(1);
    const all = await withContext(h.db, SYSTEM_CONTEXT, (tx) => tx.auditLog.findMany());
    expect(JSON.stringify(all.map((a) => [a.before, a.after, a.reason]))).not.toContain(
      "segreto-di-prova",
    );
  });

  it("only allowed keys and actions reach the portal", async () => {
    for (const body of [
      { kind: "key", key: "Control+A" },
      { kind: "script", code: "x" },
      { kind: "text", text: "" },
    ]) {
      expect((await r.call(verifier, "/verification/ania-login/action", { body })).status).toBe(
        400,
      );
    }
  });
});
