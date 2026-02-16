import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { verifySessionToken, getUserById } from "../selfServeAuth";
import { parse as parseCookieHeader } from "cookie";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

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

  // Check for impersonation header (admin viewing as another team member)
  const impersonationHeader = opts.req.headers['x-impersonate-user-id'] as string | undefined;

  const cookies = parseCookies(opts.req.headers.cookie);

  // 1. Check for JWT session cookie (used by super admin impersonation)
  const sessionToken = cookies.get('session');
  if (sessionToken) {
    try {
      const decoded = jwt.verify(sessionToken, JWT_SECRET) as any;
      if (decoded && decoded.userId) {
        const dbUser = await getUserById(decoded.userId);
        if (dbUser) {
          if (decoded.type === 'impersonation' && decoded.tenantId) {
            // Super admin impersonation: override the user's tenantId with the impersonated tenant
            user = {
              ...dbUser,
              tenantId: decoded.tenantId,
              // @ts-ignore - custom property for tracking impersonation
              _isImpersonating: true,
              // @ts-ignore
              _impersonatedTenantName: decoded.impersonatedTenantName,
              // @ts-ignore
              _originalTenantId: decoded.originalTenantId,
            };
          } else {
            user = dbUser;
          }
        }
      }
    } catch {
      // Session token invalid or expired, continue to other auth methods
    }
  }

  // 2. Try self-serve auth (auth_token cookie) - for email/password and Google OAuth users
  if (!user) {
    try {
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
    } catch {
      // Self-serve auth failed, will try Manus OAuth next
    }
  }

  // 3. If self-serve auth didn't work, try Manus OAuth (app_session_id cookie)
  if (!user) {
    try {
      user = await sdk.authenticateRequest(opts.req);
    } catch {
      // Authentication is optional for public procedures.
      user = null;
    }
  }

  // Handle admin impersonation header - admin can impersonate users within the same tenant
  if (user && (user.role === 'super_admin' || user.role === 'admin') && impersonationHeader) {
    try {
      const targetUserId = parseInt(impersonationHeader, 10);
      if (!isNaN(targetUserId)) {
        const impersonatedUser = await getUserById(targetUserId);
        if (impersonatedUser) {
          // Admin can only impersonate users within the same tenant
          if (user.role === 'admin' && impersonatedUser.tenantId !== user.tenantId) {
            console.warn(`[Impersonation] Admin ${user.id} tried to impersonate user ${targetUserId} from a different tenant`);
          } else {
            user = {
              ...impersonatedUser,
              // @ts-ignore - adding custom property for impersonation tracking
              _originalAdminId: user.id,
            };
          }
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
