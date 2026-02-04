import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { verifySessionToken, getUserById } from "../selfServeAuth";
import { parse as parseCookieHeader } from "cookie";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

function parseCookies(cookieHeader: string | undefined): Map<string, string> {
  if (!cookieHeader) {
    return new Map<string, string>();
  }
  const parsed = parseCookieHeader(cookieHeader);
  return new Map(Object.entries(parsed));
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let isImpersonating = false;

  // Check for impersonation header (super admin viewing as another tenant)
  const impersonationHeader = opts.req.headers['x-impersonate-user-id'] as string | undefined;

  // First, try self-serve auth (auth_token cookie) - for email/password and Google OAuth users
  try {
    const cookies = parseCookies(opts.req.headers.cookie);
    const authToken = cookies.get('auth_token');
    
    if (authToken) {
      const decoded = verifySessionToken(authToken);
      if (decoded && decoded.userId) {
        const selfServeUser = await getUserById(decoded.userId);
        if (selfServeUser) {
          user = selfServeUser;
        }
      }
    }
  } catch (error) {
    // Self-serve auth failed, will try Manus OAuth next
  }

  // If self-serve auth didn't work, try Manus OAuth (app_session_id cookie)
  if (!user) {
    try {
      user = await sdk.authenticateRequest(opts.req);
    } catch (error) {
      // Authentication is optional for public procedures.
      user = null;
    }
  }

  // Handle impersonation - only super_admin can impersonate
  if (user && user.role === 'super_admin' && impersonationHeader) {
    try {
      const targetUserId = parseInt(impersonationHeader, 10);
      if (!isNaN(targetUserId)) {
        const impersonatedUser = await getUserById(targetUserId);
        if (impersonatedUser) {
          // Store original admin info and switch to impersonated user
          isImpersonating = true;
          user = {
            ...impersonatedUser,
            // Keep a reference to original admin for audit purposes
            // @ts-ignore - adding custom property for impersonation tracking
            _originalAdminId: user.id,
          };
        }
      }
    } catch (error) {
      // Impersonation failed, continue with original user
      console.error('[Impersonation] Failed to impersonate user:', error);
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
