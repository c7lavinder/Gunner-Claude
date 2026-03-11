import { desc, eq } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/context";
import { requireRole } from "../_core/sdk";
import { db } from "../_core/db";
import { auditLog, users } from "../../drizzle/schema";

export const auditLogRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    requireRole(ctx, "admin");
    const rows = await db
      .select({
        id: auditLog.id,
        action: auditLog.action,
        entityType: auditLog.entityType,
        entityId: auditLog.entityId,
        before: auditLog.before,
        after: auditLog.after,
        ipAddress: auditLog.ipAddress,
        createdAt: auditLog.createdAt,
        userId: auditLog.userId,
        userName: users.name,
      })
      .from(auditLog)
      .leftJoin(users, eq(auditLog.userId, users.id))
      .where(eq(auditLog.tenantId, ctx.user.tenantId))
      .orderBy(desc(auditLog.createdAt))
      .limit(100);
    return rows;
  }),
});
