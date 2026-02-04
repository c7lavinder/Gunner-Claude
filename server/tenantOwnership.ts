/**
 * Tenant Ownership Verification
 * 
 * Helper functions to verify that a user has permission to access/modify
 * resources that belong to their tenant.
 */

import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { eq, and } from "drizzle-orm";
import {
  trainingMaterials,
  aiFeedback,
  gradingRules,
  teamTrainingItems,
  brandAssets,
  socialPosts,
  contentIdeas,
  calls,
  teamMembers,
} from "../drizzle/schema";

type ResourceType = 
  | "trainingMaterial"
  | "aiFeedback"
  | "gradingRule"
  | "teamTrainingItem"
  | "brandAsset"
  | "socialPost"
  | "contentIdea"
  | "call"
  | "teamMember";

const tableMap = {
  trainingMaterial: trainingMaterials,
  aiFeedback: aiFeedback,
  gradingRule: gradingRules,
  teamTrainingItem: teamTrainingItems,
  brandAsset: brandAssets,
  socialPost: socialPosts,
  contentIdea: contentIdeas,
  call: calls,
  teamMember: teamMembers,
};

/**
 * Verify that a resource belongs to the specified tenant
 * Throws TRPCError if the resource doesn't exist or doesn't belong to the tenant
 */
export async function verifyTenantOwnership(
  resourceType: ResourceType,
  resourceId: number,
  tenantId: number | null | undefined
): Promise<void> {
  if (!tenantId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "User must be associated with a tenant",
    });
  }

  const db = await getDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database not available",
    });
  }

  const table = tableMap[resourceType];
  
  // Query the resource to check if it exists and belongs to the tenant
  const result = await db
    .select({ id: (table as any).id, tenantId: (table as any).tenantId })
    .from(table)
    .where(eq((table as any).id, resourceId))
    .limit(1);

  if (result.length === 0) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `${resourceType} not found`,
    });
  }

  const resource = result[0];
  
  // Check if the resource belongs to the user's tenant
  if (resource.tenantId !== tenantId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `You don't have permission to access this ${resourceType}`,
    });
  }
}

/**
 * Verify ownership and return the resource if valid
 * Useful when you need the resource data after verification
 */
export async function verifyAndGetResource<T>(
  resourceType: ResourceType,
  resourceId: number,
  tenantId: number | undefined,
  getResourceFn: (id: number) => Promise<T | null>
): Promise<T> {
  await verifyTenantOwnership(resourceType, resourceId, tenantId);
  
  const resource = await getResourceFn(resourceId);
  if (!resource) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `${resourceType} not found`,
    });
  }
  
  return resource;
}
