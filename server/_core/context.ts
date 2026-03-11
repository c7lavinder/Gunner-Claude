import { initTRPC, TRPCError } from "@trpc/server";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import jwt from "jsonwebtoken";
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

  if (token) {
    try {
      const payload = jwt.verify(token, ENV.jwtSecret) as jwt.JwtPayload;
      user = {
        userId: payload.userId as number,
        tenantId: payload.tenantId as number,
        email: payload.email as string,
        name: payload.name as string,
        role: payload.role as string,
      };
    } catch {
      // Invalid or expired JWT — treat as unauthenticated
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
