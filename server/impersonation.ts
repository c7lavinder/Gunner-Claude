/**
 * Tenant Impersonation Service
 * Allows super admins to view the platform as any tenant for support purposes
 */

import { getDb } from "./db";
import { users, tenants } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

/**
 * Start impersonating a tenant
 * Only super_admin users can impersonate
 */
export async function startImpersonation(
  userId: number,
  targetTenantId: number
): Promise<{ success: boolean; token?: string; error?: string }> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };

  // Verify user is super_admin
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user || user.role !== "super_admin") {
    return { success: false, error: "Only super admins can impersonate tenants" };
  }

  // Get target tenant
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, targetTenantId));
  if (!tenant) {
    return { success: false, error: "Tenant not found" };
  }

  // Create a special impersonation token
  const token = jwt.sign(
    {
      userId,
      tenantId: targetTenantId,
      type: "impersonation",
      originalTenantId: user.tenantId,
      impersonatedTenantName: tenant.name,
    },
    JWT_SECRET,
    { expiresIn: "2h" } // Impersonation sessions expire after 2 hours
  );

  console.log(`[Impersonation] User ${userId} started impersonating tenant ${targetTenantId} (${tenant.name})`);

  return { success: true, token };
}

/**
 * Stop impersonating and return to original identity
 * Reads the user's actual tenantId from the database (resilient to server restarts)
 */
export async function stopImpersonation(
  userId: number
): Promise<{ success: boolean; token?: string; error?: string }> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };

  // Get the user's actual tenantId from the database (not from in-memory state)
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) {
    return { success: false, error: "User not found" };
  }

  // Create a regular session token with the user's real tenantId
  const token = jwt.sign(
    {
      userId,
      tenantId: user.tenantId,
      type: "session",
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  console.log(`[Impersonation] User ${userId} stopped impersonating`);

  return { success: true, token };
}

/**
 * Check if a token is an impersonation token
 */
export function isImpersonationToken(decoded: any): boolean {
  return decoded?.type === "impersonation";
}

/**
 * Get impersonation info from token
 */
export function getImpersonationInfo(decoded: any): {
  isImpersonating: boolean;
  impersonatedTenantId?: number;
  impersonatedTenantName?: string;
  originalTenantId?: number | null;
} {
  if (!isImpersonationToken(decoded)) {
    return { isImpersonating: false };
  }

  return {
    isImpersonating: true,
    impersonatedTenantId: decoded.tenantId,
    impersonatedTenantName: decoded.impersonatedTenantName,
    originalTenantId: decoded.originalTenantId,
  };
}

/**
 * Get all tenants that can be impersonated (for super admin UI)
 */
export async function getImpersonatableTenants() {
  const db = await getDb();
  if (!db) return [];

  const allTenants = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      slug: tenants.slug,
      subscriptionTier: tenants.subscriptionTier,
      subscriptionStatus: tenants.subscriptionStatus,
    })
    .from(tenants)
    .orderBy(tenants.name);

  return allTenants;
}
