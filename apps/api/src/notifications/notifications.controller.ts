import type { Clock } from "@astax/adapters/clock";
import { withContext, type DbClient } from "@astax/db";
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import type { AuthContext } from "../auth/auth-context.js";
import { CurrentAuth, NoContext, RequirePermission } from "../auth/decorators.js";
import { ProblemError } from "../http/problem.js";
import { parseInput } from "../http/validation.js";
import { CLOCK, DB } from "../infra/tokens.js";
import { PreferencesService } from "./preferences.service.js";

/** The caller's in-app notifications (spec 01, «Centro notifiche»). */
@ApiTags("notifications")
@ApiBearerAuth()
@Controller("me/notifications")
export class NotificationsController {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(PreferencesService) private readonly preferences: PreferencesService,
  ) {}

  /** The notification centre: everything read at once. */
  @Post("read-all")
  @HttpCode(204)
  @RequirePermission("notification.viewOwn")
  @NoContext()
  async readAll(@CurrentAuth() auth: AuthContext): Promise<void> {
    await withContext(this.db, auth.db, (tx) =>
      tx.notification.updateMany({
        where: { userId: auth.userId, status: "UNREAD" },
        data: { status: "READ", readAt: this.clock.now() },
      }),
    );
  }

  // Spec 01 «Notifiche»: the choices per event and channel.
  @Get("preferences")
  @RequirePermission("notification.viewOwn")
  @NoContext()
  listPreferences(@CurrentAuth() auth: AuthContext) {
    return this.preferences.list(auth);
  }

  @Put("preferences")
  @RequirePermission("notification.viewOwn")
  @NoContext()
  setPreference(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    return this.preferences.set(
      auth,
      parseInput(
        z.strictObject({
          eventKey: z.string().regex(/^[a-z_.]+$/),
          channel: z.enum(["EMAIL", "SMS", "PUSH"]),
          enabled: z.boolean(),
        }),
        body,
      ),
    );
  }

  @Post("push-subscriptions")
  @HttpCode(201)
  @RequirePermission("notification.viewOwn")
  @NoContext()
  subscribe(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    return this.preferences.subscribe(
      auth,
      parseInput(
        z.strictObject({
          endpoint: z.url().max(2000),
          keys: z.strictObject({
            p256dh: z.string().min(10).max(200),
            auth: z.string().min(8).max(100),
          }),
        }),
        body,
      ),
    );
  }

  @Post("push-subscriptions/revoke")
  @HttpCode(200)
  @RequirePermission("notification.viewOwn")
  @NoContext()
  unsubscribe(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    return this.preferences.unsubscribe(
      auth,
      parseInput(z.strictObject({ endpoint: z.url().max(2000) }), body).endpoint,
    );
  }

  @Get()
  @RequirePermission("notification.viewOwn")
  @NoContext()
  async list(@CurrentAuth() auth: AuthContext) {
    return withContext(this.db, auth.db, async (tx) => {
      const rows = await tx.notification.findMany({
        where: { userId: auth.userId },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      const unread = await tx.notification.count({
        where: { userId: auth.userId, status: "UNREAD" },
      });
      return {
        unread,
        items: rows.map((n) => ({
          id: n.id,
          eventKey: n.eventKey,
          title: n.title,
          body: n.body,
          link: n.link,
          read: n.status === "READ",
          createdAt: n.createdAt.toISOString(),
        })),
      };
    });
  }

  @Post(":id/read")
  @HttpCode(204)
  @RequirePermission("notification.viewOwn")
  @NoContext()
  async markRead(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<void> {
    const notificationId = parseInput(z.uuid(), id);
    const changed = await withContext(this.db, auth.db, (tx) =>
      tx.notification.updateMany({
        where: { id: notificationId, userId: auth.userId },
        data: { status: "READ", readAt: this.clock.now() },
      }),
    );
    if (changed.count === 0) throw new ProblemError("NOT_FOUND");
  }
}
