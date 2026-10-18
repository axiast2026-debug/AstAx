import { io, type Socket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { acceptAllLegal, startHarness, type Harness } from "./fixtures.js";

// ADR 0008 and phase 8: the browser connects with a ticket asked by the web
// app's server, valid 30 seconds and usable once (in Redis when there is one).
let h: Harness;
let token: string;

beforeAll(async () => {
  h = await startHarness();
  token = await h.tokenFor("private-giulia-neri");
  await acceptAllLegal(h, "private-giulia-neri");
});

afterAll(async () => {
  await h.close();
});

async function ticket(): Promise<string> {
  const response = await h.call("/realtime/ticket", { token, body: {} });
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
