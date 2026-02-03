import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

/**
 * Tenant-scoped procedure - ensures user has a tenant and adds tenantId to context
 * Use this for any queries that should be filtered by tenant
 */
const requireTenant = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  // Get tenant ID from user
  const tenantId = ctx.user.tenantId;
  
  // For now, allow users without tenant (they'll see their own data)
  // In production, you might want to require tenant assignment

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      tenantId: tenantId || null,
    },
  });
});

export const tenantProcedure = t.procedure.use(requireTenant);

/**
 * Platform owner procedure - only allows the platform owner (super admin)
 */
const requirePlatformOwner = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  // Corey's openId - the platform owner
  const PLATFORM_OWNER_OPEN_ID = "U3JEthPNs4UbYRrgRBbShj";
  
  if (ctx.user.openId !== PLATFORM_OWNER_OPEN_ID) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Platform owner access required" });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const platformOwnerProcedure = t.procedure.use(requirePlatformOwner);
