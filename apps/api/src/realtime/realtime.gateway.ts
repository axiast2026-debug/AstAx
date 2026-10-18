import { createHash, randomBytes } from "node:crypto";
import type { Server as HttpServer } from "node:http";
import type { Clock } from "@astax/adapters/clock";
import { withContext, type DbClient, type DbContext } from "@astax/db";
import { errorForLog, type Logger } from "@astax/shared/logging";
import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import { Server, type Socket } from "socket.io";
import type { AuthContext } from "../auth/auth-context.js";
import type { ApiConfig } from "../config/config.js";
import { CLOCK, CONFIG, DB, LOGGER } from "../infra/tokens.js";
import { RealtimeHub, type RealtimeEvent } from "./realtime-hub.js";

/** The channel the worker publishes its changes on (apps/worker, ADR 0008). */
export const REALTIME_CHANNEL = "astax:realtime";
const TICKET_TTL_MS = 30_000;

interface Ticket {
  userId: string;
  db: DbContext;
  isStaff: boolean;
  expiresAt: number;
}

/**
 * Socket.IO for counters and changes of state (ADR 0008). The browser never
 * holds an API token (ADR 0004): the web app's server asks for a ticket valid
 * 30 seconds and usable once; the connection then joins only the rooms its
 * user may follow, checked with row level security. Messages say what
 * changed, never the data.
 */
@Injectable()
export class RealtimeGateway implements OnApplicationBootstrap, OnApplicationShutdown {
  #io: Server | null = null;
  /** The Redis connections to close at shutdown. */
  #redis: { quit(): Promise<unknown> }[] = [];
  /** Without Redis (tests): the tickets of this process. */
  readonly #tickets = new Map<string, Ticket>();
  /** Phase 8: with Redis the tickets are shared, so any instance may redeem them. */
  #ticketStore: {
    set(key: string, value: string, options: { PX: number }): Promise<unknown>;
    getDel(key: string): Promise<string | null>;
  } | null = null;
  #stopListening: (() => void) | null = null;

  constructor(
    @Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost,
    @Inject(CONFIG) private readonly config: ApiConfig,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(DB) private readonly db: DbClient,
    @Inject(LOGGER) private readonly logger: Logger,
    @Inject(RealtimeHub) private readonly hub: RealtimeHub,
  ) {}

  /** The Redis key of a ticket: its hash, so a copy of Redis holds no usable ticket. */
  private static ticketKey(ticket: string): string {
    return `astax:rt-ticket:${createHash("sha256").update(ticket).digest("base64url")}`;
  }

  /** A one-time ticket for the browser of this user. */
  async issueTicket(auth: AuthContext): Promise<{ ticket: string; expiresInMs: number }> {
    const now = this.clock.now().getTime();
    const ticket = randomBytes(24).toString("base64url");
    const value: Ticket = {
      userId: auth.userId,
      db: auth.db,
      isStaff: auth.membership?.organizationType === "ASTAX",
      expiresAt: now + TICKET_TTL_MS,
    };
    if (this.#ticketStore) {
      await this.#ticketStore.set(RealtimeGateway.ticketKey(ticket), JSON.stringify(value), {
        PX: TICKET_TTL_MS,
      });
    } else {
      for (const [key, t] of this.#tickets) if (t.expiresAt <= now) this.#tickets.delete(key);
      this.#tickets.set(ticket, value);
    }
    return { ticket, expiresInMs: TICKET_TTL_MS };
  }

  private async redeem(ticket: unknown, now: number): Promise<Ticket | null> {
    if (typeof ticket !== "string") return null;
    let found: Ticket | undefined;
    if (this.#ticketStore) {
      const raw = await this.#ticketStore.getDel(RealtimeGateway.ticketKey(ticket));
      found = raw ? (JSON.parse(raw) as Ticket) : undefined;
    } else {
      found = this.#tickets.get(ticket);
      this.#tickets.delete(ticket);
    }
    return found && found.expiresAt > now ? found : null;
  }

  async onApplicationBootstrap(): Promise<void> {
    const httpServer = this.adapterHost.httpAdapter?.getHttpServer() as HttpServer | undefined;
    if (!httpServer) return;
    const io = new Server(httpServer, {
      path: "/realtime/socket",
      serveClient: false,
      cors: { origin: [this.config.WEB_URL, this.config.ADMIN_URL] },
    });
    this.#io = io;

    if (this.config.REDIS_URL) {
      try {
        const pub = createClient({ url: this.config.REDIS_URL });
        const sub = pub.duplicate();
        const events = pub.duplicate();
        for (const c of [pub, sub, events]) {
          c.on("error", (error: unknown) =>
            this.logger.warn({ err: errorForLog(error) }, "redis error"),
          );
        }
        await Promise.all([pub.connect(), sub.connect(), events.connect()]);
        io.adapter(createAdapter(pub, sub));
        await events.subscribe(REALTIME_CHANNEL, (message: string) => {
          try {
            this.hub.emit(JSON.parse(message) as RealtimeEvent);
          } catch {
            this.logger.warn("malformed realtime event");
          }
        });
        this.#redis = [pub, sub, events];
        this.#ticketStore = pub;
      } catch (error) {
        this.logger.warn({ err: errorForLog(error) }, "realtime without Redis");
      }
    }

    io.use((socket, next) => {
      this.redeem(socket.handshake.auth?.ticket, this.clock.now().getTime())
        .then((ticket) => {
          if (!ticket) {
            next(new Error("UNAUTHENTICATED"));
            return;
          }
          socket.data.ticket = ticket;
          next();
        })
        .catch(() => next(new Error("UNAUTHENTICATED")));
    });
    io.on("connection", (socket) => this.onConnection(socket));
    this.#stopListening = this.hub.listen((event) => {
      io.to(`request:${event.requestId}`).to("auctions").emit("changed", event);
    });
  }

  private onConnection(socket: Socket): void {
    const ticket = socket.data.ticket as Ticket;
    socket.on("follow", async (input: unknown, ack?: (ok: boolean) => void) => {
      const requestId = (input as { requestId?: unknown } | null)?.requestId;
      let ok = false;
      if (typeof requestId === "string" && /^[0-9a-f-]{36}$/i.test(requestId)) {
        // Row level security decides: the requester's own, the organization's, staff.
        const visible = await withContext(this.db, ticket.db, (tx) =>
          tx.quoteRequest.count({ where: { id: requestId } }),
        ).catch(() => 0);
        if (visible > 0) {
          await socket.join(`request:${requestId}`);
          ok = true;
        }
      }
      ack?.(ok);
    });
    socket.on("follow-auctions", async (_input: unknown, ack?: (ok: boolean) => void) => {
      if (ticket.isStaff) await socket.join("auctions");
      ack?.(ticket.isStaff);
    });
  }

  async onApplicationShutdown(): Promise<void> {
    this.#stopListening?.();
    await this.#io?.close().catch(() => undefined);
    await Promise.all(this.#redis.map((c) => c.quit().catch(() => undefined)));
  }
}
