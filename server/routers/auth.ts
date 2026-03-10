import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../_core/context";
import { db } from "../_core/db";
import { users, tenants } from "../../drizzle/schema";
import { ENV } from "../_core/env";
import * as authService from "../services/auth";
import { nanoid } from "nanoid";

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

      const valid = await authService.verifyPassword(input.password, user.passwordHash);
      if (!valid) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
      }

      const tenantId = user.tenantId ?? 0;
      const token = await authService.createJwtToken({
        userId: user.id,
        tenantId,
        email: user.email ?? "",
        name: user.name ?? "",
        role: user.role,
      });

      setAuthCookie(ctx.res, token);

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

      setAuthCookie(ctx.res, token);

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

  logout: publicProcedure.mutation(({ ctx }) => {
    ctx.res.clearCookie("auth_token", { path: "/" });
    return { success: true };
  }),
});
