import { z } from "zod";
import { eq, sql as rawSql, and } from "drizzle-orm";
import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../_core/context";
import { db } from "../_core/db";
import { users, tenants, sessions } from "../../drizzle/schema";
import { ENV } from "../_core/env";
import * as authService from "../services/auth";
import { nanoid } from "nanoid";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function createSession(
  userId: number,
  tenantId: number,
  token: string,
  userAgent: string | undefined,
  ipAddress: string | undefined
): Promise<void> {
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  await db.insert(sessions).values({
    userId,
    tenantId,
    tokenHash: hashToken(token),
    userAgent: userAgent ?? null,
    ipAddress: ipAddress ?? null,
    expiresAt,
  });
}

const COOKIE_OPTS = {
  httpOnly: true,
  secure: ENV.isProduction,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

function setAuthCookie(res: { cookie: (n: string, v: string, o: object) => void }, token: string) {
  res.cookie("auth_token", token, COOKIE_OPTS);
}

function slugFromName(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 50);
  return base || "tenant";
}

export const authRouter = router({
  login: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, input.email));

      if (!user?.passwordHash) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
      }

      // Check if account is locked
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Account locked due to too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}.`,
        });
      }

      const valid = await authService.verifyPassword(input.password, user.passwordHash);
      if (!valid) {
        // Increment failed attempts; lock after 10
        const newCount = (user.failedLoginAttempts ?? 0) + 1;
        const lockout = newCount >= 10 ? new Date(Date.now() + 30 * 60_000) : null;
        await db
          .update(users)
          .set({ failedLoginAttempts: newCount, lockedUntil: lockout ?? undefined })
          .where(eq(users.id, user.id));
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
      }

      // Successful login: reset lockout counters
      await db
        .update(users)
        .set({ failedLoginAttempts: 0, lockedUntil: rawSql`NULL`, lastSignedIn: new Date() })
        .where(eq(users.id, user.id));

      const tenantId = user.tenantId ?? 0;
      const token = await authService.createJwtToken({
        userId: user.id,
        tenantId,
        email: user.email ?? "",
        name: user.name ?? "",
        role: user.role,
      });

      setAuthCookie(ctx.res, token);
      void createSession(user.id, tenantId, token, ctx.req.headers["user-agent"], ctx.req.ip);

      return {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          tenantId: user.tenantId,
        },
      };
    }),

  signup: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
        email: z.string().email(),
        password: z.string().min(8),
        companyName: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [existing] = await db
        .select()
        .from(users)
        .where(eq(users.email, input.email));

      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Email already registered" });
      }

      const slug = `${slugFromName(input.companyName)}-${nanoid(8)}`;
      const [tenant] = await db
        .insert(tenants)
        .values({
          name: input.companyName,
          slug,
        })
        .returning();

      if (!tenant) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create tenant" });
      }

      const passwordHash = await authService.hashPassword(input.password);
      const openId = `email:${input.email}`;

      const [user] = await db
        .insert(users)
        .values({
          tenantId: tenant.id,
          openId,
          name: input.name,
          email: input.email,
          passwordHash,
          loginMethod: "email_password",
          role: "admin",
          isTenantAdmin: "true",
        })
        .returning();

      if (!user) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create user" });
      }

      const token = await authService.createJwtToken({
        userId: user.id,
        tenantId: tenant.id,
        email: user.email ?? "",
        name: user.name ?? "",
        role: user.role,
      });

      setAuthCookie(ctx.res, token);
      void createSession(user.id, tenant.id, token, ctx.req.headers["user-agent"], ctx.req.ip);

      return {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          tenantId: user.tenantId,
        },
      };
    }),

  me: protectedProcedure.query(({ ctx }) => ({
    id: ctx.user!.userId,
    name: ctx.user!.name,
    email: ctx.user!.email,
    role: ctx.user!.role,
    tenantId: ctx.user!.tenantId,
  })),

  googleAuthUrl: publicProcedure
    .input(z.object({ redirectUri: z.string().url() }))
    .query(({ input }) => {
      if (!ENV.googleClientId || !ENV.googleClientSecret) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Google OAuth is not configured on this server." });
      }
      const params = new URLSearchParams({
        client_id: ENV.googleClientId,
        redirect_uri: input.redirectUri,
        response_type: "code",
        scope: "openid email profile",
        access_type: "offline",
        prompt: "consent",
      });
      return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
    }),

  googleCallback: publicProcedure
    .input(z.object({ code: z.string().min(1), redirectUri: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      // #region agent log
      console.error('[DEBUG-dfb296] googleCallback called', JSON.stringify({redirectUri:input.redirectUri,isProduction:ENV.isProduction}));
      // #endregion
      if (!ENV.googleClientId || !ENV.googleClientSecret) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Google OAuth is not configured on this server." });
      }
      const { email, name, picture, googleId } = await authService.exchangeGoogleCode(
        input.code,
        input.redirectUri
      );

      const openId = `google:${googleId}`;
      const [existing] = await db
        .select()
        .from(users)
        .where(eq(users.openId, openId));

      let user: typeof users.$inferSelect;
      let isNewUser = false;

      if (existing) {
        user = existing;
        await db
          .update(users)
          .set({
            lastSignedIn: new Date(),
            name: name || existing.name,
            email: email || existing.email,
            profilePicture: picture || existing.profilePicture,
          })
          .where(eq(users.id, existing.id));
      } else {
        const [inserted] = await db
          .insert(users)
          .values({
            openId,
            name,
            email,
            profilePicture: picture,
            loginMethod: "google",
            emailVerified: "true",
            tenantId: null,
          })
          .returning();
        if (!inserted) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create user" });
        }
        user = inserted;
        isNewUser = true;
      }

      const tenantId = user.tenantId ?? 0;
      const token = await authService.createJwtToken({
        userId: user.id,
        tenantId,
        email: user.email ?? "",
        name: user.name ?? "",
        role: user.role,
      });

      // #region agent log
      console.error('[DEBUG-dfb296] pre-cookie', JSON.stringify({userId:user.id,tenantId,isNewUser,cookieSecure:ENV.isProduction}));
      // #endregion
      setAuthCookie(ctx.res, token);
      void createSession(user.id, tenantId, token, ctx.req.headers["user-agent"], ctx.req.ip);
      // #region agent log
      console.error('[DEBUG-dfb296] post-cookie, returning', JSON.stringify({isNewUser,tokenLen:token.length}));
      // #endregion

      return {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          tenantId: user.tenantId,
        },
        isNewUser,
      };
    }),

  updateProfile: protectedProcedure
    .input(z.object({ name: z.string().min(1).optional() }))
    .mutation(async ({ ctx, input }) => {
      const updates: Partial<Record<string, unknown>> = {};
      if (input.name) updates.name = input.name;
      if (Object.keys(updates).length === 0) return { success: true };
      await db
        .update(users)
        .set(updates as typeof users.$inferInsert)
        .where(eq(users.id, ctx.user!.userId));
      return { success: true };
    }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    const token = ctx.req.cookies?.auth_token;
    if (token) {
      const hash = hashToken(token);
      await db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(sessions.tokenHash, hash)));
    }
    ctx.res.clearCookie("auth_token", { path: "/" });
    return { success: true };
  }),

  listSessions: protectedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    return db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.userId, ctx.user.userId),
          rawSql`${sessions.revokedAt} IS NULL`,
          rawSql`${sessions.expiresAt} > ${now}`
        )
      );
  }),

  revokeSession: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(sessions.id, input.sessionId),
            eq(sessions.userId, ctx.user.userId)
          )
        );
      return { success: true };
    }),

  revokeAllSessions: protectedProcedure.mutation(async ({ ctx }) => {
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.userId, ctx.user.userId));
    ctx.res.clearCookie("auth_token", { path: "/" });
    return { success: true };
  }),
});
