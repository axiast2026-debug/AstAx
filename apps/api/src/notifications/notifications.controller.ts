import type { Clock } from "@astax/adapters/clock";
import { withContext, type DbClient } from "@astax/db";
import { Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import type { AuthContext } from "../auth/auth-context.js";
import { CurrentAuth, NoContext, RequirePermission } from "../auth/decorators.js";
import { ProblemError } from "../http/problem.js";
import { parseInput } from "../http/validation.js";
import { CLOCK, DB } from "../infra/tokens.js";

/** The caller's in-app notifications (spec 01, «Centro notifiche»). */
@ApiTags("notifications")
@ApiBearerAuth()
@Controller("me/notifications")
export class NotificationsController {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

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
