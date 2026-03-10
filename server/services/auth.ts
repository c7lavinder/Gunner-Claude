import * as jose from "jose";
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
  const secret = new TextEncoder().encode(ENV.jwtSecret);
  return new jose.SignJWT({
    userId: payload.userId,
    tenantId: payload.tenantId,
    email: payload.email,
    name: payload.name,
    role: payload.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(JWT_EXPIRY)
    .sign(secret);
}

export async function verifyJwtToken(token: string): Promise<SessionUser | null> {
  try {
    const secret = new TextEncoder().encode(ENV.jwtSecret);
    const { payload } = await jose.jwtVerify(token, secret);
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
  hash: string
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
  redirectUri: string
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

  if (!tokenData.id_token) {
    throw new Error("Google did not return id_token");
  }

  const JWKS = jose.createRemoteJWKSet(
    new URL("https://www.googleapis.com/oauth2/v3/certs")
  );
  const { payload } = await jose.jwtVerify(tokenData.id_token, JWKS, {
    issuer: "https://accounts.google.com",
    audience: ENV.googleClientId,
  });

  const email = payload.email as string;
  const name = (payload.name as string) ?? email.split("@")[0];
  const picture = (payload.picture as string) ?? "";
  const googleId = payload.sub as string;

  return { email, name, picture, googleId };
}
