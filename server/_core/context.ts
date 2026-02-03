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

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
