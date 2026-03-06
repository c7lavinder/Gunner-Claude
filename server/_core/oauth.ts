import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { checkAndAcceptPendingInvitation, autoMatchTeamMember } from "../tenant";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

// ─── RATE LIMITING ───
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS_PER_IP = 3;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count++;
  if (entry.count > MAX_ATTEMPTS_PER_IP) {
    return true;
  }
  return false;
}

// Clean up stale entries every 30 minutes
setInterval(() => {
  const now = Date.now();
  const keys = Array.from(loginAttempts.keys());
  for (const ip of keys) {
    const entry = loginAttempts.get(ip);
    if (entry && now > entry.resetAt) loginAttempts.delete(ip);
  }
}, 30 * 60 * 1000);

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    // Rate limit by IP
    const clientIp = req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() || req.ip || "unknown";
    if (isRateLimited(clientIp)) {
      console.warn(`[OAuth] Rate limited IP: ${clientIp}`);
      res.status(429).json({ error: "Too many login attempts. Please try again later." });
      return;
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      // ─── SIGNUP LOCKDOWN: Only allow existing users to log in ───
      const existingUser = await db.getUserByOpenId(userInfo.openId);
      if (!existingUser) {
        // NEW USER — block signup entirely
        console.warn(`[OAuth] BLOCKED new signup attempt: ${userInfo.email || userInfo.openId} from IP ${clientIp}`);
        res.redirect(302, "/?error=signups_disabled");
        return;
      }
      // ─── END SIGNUP LOCKDOWN ───

      const user = await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      // Check for pending invitation and auto-assign to tenant
      if (user && userInfo.email) {
        const inviteResult = await checkAndAcceptPendingInvitation(user.id, userInfo.email);
        if (inviteResult) {
          console.log(`[OAuth] User ${userInfo.email} auto-joined tenant ${inviteResult.tenantName} via pending invitation`);
        } else {
          // No pending invitation — try to auto-match by name to an existing team member
          const matchResult = await autoMatchTeamMember(user.id, userInfo.name || null, userInfo.email);
          if (matchResult) {
            console.log(`[OAuth] User ${userInfo.email} auto-matched to team member "${matchResult.teamMemberName}" in tenant ${matchResult.tenantName}`);
          }
        }
      }

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
