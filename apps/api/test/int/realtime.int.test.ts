import { io, type Socket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RealtimeHub } from "../../src/realtime/realtime-hub.js";
import { openTestAuction } from "./auction-helpers.js";
import { acceptAllLegal, membershipId, startHarness, type Harness } from "./fixtures.js";

// ADR 0008 and phase 8: the browser connects with a ticket asked by the web
// app's server, valid 30 seconds and usable once (in Redis when there is one).
let h: Harness;
let token: string;

beforeAll(async () => {
  h = await startHarness();
  token = await h.tokenFor("private-giulia-neri");
  await acceptAllLegal(h, "private-giulia-neri");
  for (const key of ["agenzia-uno-owner", "agenzia-due-owner"] as const) {
    await acceptAllLegal(h, key);
  }
});

afterAll(async () => {
  await h.close();
});

async function ticket(as?: { token: string; context: string }): Promise<string> {
  const response = await h.call("/realtime/ticket", {
    token: as?.token ?? token,
    ...(as ? { context: as.context } : {}),
    body: {},
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { ticket: string }).ticket;
}

function connect(t: string): Promise<{ ok: boolean; socket: Socket }> {
  const socket = io(h.baseUrl, {
    path: "/realtime/socket",
    auth: { ticket: t },
    transports: ["websocket"],
    reconnection: false,
  });
  return new Promise((resolve) => {
    socket.on("connect", () => resolve({ ok: true, socket }));
    socket.on("connect_error", () => resolve({ ok: false, socket }));
  });
}

describe("ADR 0008 realtime tickets", () => {
  it("a ticket opens one connection, and only one", async () => {
    const t = await ticket();
    const first = await connect(t);
    expect(first.ok).toBe(true);
    first.socket.close();
    const again = await connect(t);
    expect(again.ok).toBe(false);
    again.socket.close();
  });

  it("an expired ticket or an invented one is refused", async () => {
    const t = await ticket();
    h.clock.set(new Date(h.clock.now().getTime() + 31_000));
    const late = await connect(t);
    expect(late.ok).toBe(false);
    late.socket.close();
    const invented = await connect("not-a-ticket");
    expect(invented.ok).toBe(false);
    invented.socket.close();
  });
});

/** Emits a socket event and waits for its acknowledgement. */
function ask(socket: Socket, event: string, input: unknown = {}): Promise<boolean> {
  return new Promise((resolve) => socket.emit(event, input, (ok: boolean) => resolve(ok)));
}

describe("«Partecipa all'asta» updates by itself (VIS-01: only that something changed)", () => {
  it("the invited agency hears that its list changed, another agency does not, a private cannot follow", async () => {
    const as = async (key: "agenzia-uno-owner" | "agenzia-due-owner", org: string) => ({
      token: await h.tokenFor(key),
      context: membershipId(key, org),
    });
    const uno = (await connect(await ticket(await as("agenzia-uno-owner", "agenzia-uno")))).socket;
    const due = (await connect(await ticket(await as("agenzia-due-owner", "agenzia-due")))).socket;
    const privateSocket = (await connect(await ticket())).socket;
    try {
      expect(await ask(uno, "follow-incoming")).toBe(true);
      expect(await ask(due, "follow-incoming")).toBe(true);
      expect(await ask(privateSocket, "follow-incoming")).toBe(false);

      // A request of Giulia, opened as the worker does, with only Agenzia Uno invited.
      const created = await h.call("/requests", { token, body: {} });
      expect(created.status).toBe(201);
      const request = (await created.json()) as { id: string };
      await openTestAuction(h, request.id, ["agenzia-uno"]);
      const heardByDue: unknown[] = [];
      due.on("changed", (e: unknown) => heardByDue.push(e));
      const heard = new Promise<unknown>((resolve) => uno.once("changed", resolve));
      h.app.get(RealtimeHub).emit({ type: "AUCTION_CHANGED", requestId: request.id });
      expect(await heard).toEqual({ type: "INCOMING_CHANGED" });
      await new Promise((r) => setTimeout(r, 300));
      expect(heardByDue).toEqual([]);
    } finally {
      for (const s of [uno, due, privateSocket]) s.close();
    }
  });
});
