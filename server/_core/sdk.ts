import { TRPCError } from "@trpc/server";
import type { Context } from "./context";

type RoleLevel = "member" | "manager" | "admin";

const HIERARCHY: Record<string, number> = {
  // Legacy values
  user: 0,
  // New values
  member: 0,
  manager: 1,
  admin: 2,
  super_admin: 2,
};

/**
 * Throws FORBIDDEN if the authenticated user's role is below `minimum`.
 * Handles both legacy role values ("user", "super_admin") and new hierarchy ("member", "manager", "admin").
 */
export function requireRole(
  ctx: { user: Context["user"] },
  minimum: RoleLevel
): void {
  const level = HIERARCHY[ctx.user?.role ?? ""] ?? 0;
  if (level < HIERARCHY[minimum]) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Insufficient permissions",
    });
  }
}
