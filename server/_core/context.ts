import { initTRPC, TRPCError } from "@trpc/server";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import * as jose from "jose";
import superjson from "superjson";
import { ENV } from "./env";
import { db } from "./db";

export interface SessionUser {
  userId: number;
  tenantId: number;
  email: string;
  name: string;
  role: string;
}

export async function createContext({ req, res }: CreateExpressContextOptions) {
  const token =
    req.cookies?.auth_token ??
    req.headers.authorization?.replace("Bearer ", "");

  let user: SessionUser | null = null;

  // #region agent log
  const isAuthMe = req.url?.includes('auth.me');
  if (isAuthMe) {
    console.error('[DEBUG-dfb296] auth.me context', JSON.stringify({hasToken:!!token,hasCookie:!!req.cookies?.auth_token,cookieKeys:Object.keys(req.cookies??{}),protocol:req.protocol,secure:req.secure,xFwdProto:req.headers['x-forwarded-proto']}));
  }
  // #endregion

  if (token) {
    try {
      const secret = new TextEncoder().encode(ENV.jwtSecret);
      const { payload } = await jose.jwtVerify(token, secret);
      user = {
        userId: payload.userId as number,
        tenantId: payload.tenantId as number,
        email: payload.email as string,
        name: payload.name as string,
        role: payload.role as string,
      };
      // #region agent log
      if (isAuthMe) { console.error('[DEBUG-dfb296] JWT verified OK', JSON.stringify({userId:user.userId,tenantId:user.tenantId})); }
      // #endregion
    } catch (err) {
      // #region agent log
      if (isAuthMe) { console.error('[DEBUG-dfb296] JWT FAILED', String(err)); }
      // #endregion
    }
  }

  return { db, user, req, res };
}

export type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;

const isAuthed = middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const protectedProcedure = t.procedure.use(isAuthed);
