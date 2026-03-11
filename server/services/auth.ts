import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { ENV } from "../_core/env";

const SALT_ROUNDS = 12;
const JWT_EXPIRY = "30d";

export interface SessionUser {
  userId: number;
  tenantId: number;
  email: string;
  name: string;
  role: string;
}

export async function createJwtToken(payload: {
  userId: number;
  tenantId: number;
  email: string;
  name: string;
  role: string;
}): Promise<string> {
  return jwt.sign(
    {
      userId: payload.userId,
      tenantId: payload.tenantId,
      email: payload.email,
      name: payload.name,
      role: payload.role,
    },
    ENV.jwtSecret,
    { algorithm: "HS256", expiresIn: JWT_EXPIRY },
  );
}

export async function verifyJwtToken(token: string): Promise<SessionUser | null> {
  try {
    const payload = jwt.verify(token, ENV.jwtSecret) as jwt.JwtPayload;
    return {
      userId: payload.userId as number,
      tenantId: payload.tenantId as number,
      email: payload.email as string,
      name: payload.name as string,
      role: payload.role as string,
    };
  } catch {
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export interface GoogleUserInfo {
  email: string;
  name: string;
  picture: string;
  googleId: string;
}

export async function exchangeGoogleCode(
  code: string,
  redirectUri: string,
): Promise<GoogleUserInfo> {
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: ENV.googleClientId,
      client_secret: ENV.googleClientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Google token exchange failed: ${err}`);
  }

  const tokenData = (await tokenRes.json()) as {
    id_token?: string;
    access_token?: string;
  };

  if (!tokenData.access_token) {
    throw new Error("Google did not return access_token");
  }

  // Use Google's userinfo endpoint instead of JWKS id_token verification
  const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!userInfoRes.ok) {
    throw new Error("Failed to fetch Google user info");
  }

  const userInfo = (await userInfoRes.json()) as {
    id: string;
    email: string;
    name?: string;
    picture?: string;
  };

  return {
    email: userInfo.email,
    name: userInfo.name ?? userInfo.email.split("@")[0],
    picture: userInfo.picture ?? "",
    googleId: userInfo.id,
  };
}
