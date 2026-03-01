/**
 * Playbook Management Functions
 * 
 * Handles seeding industry playbooks into tenant-specific tables,
 * and CRUD operations for tenant playbook customization (Layer 3).
 */

import { eq, and } from "drizzle-orm";
import { getDb } from "./db";
import { 
  tenants, tenantRoles, tenantRubrics, tenantCallTypes 
} from "../drizzle/schema";
import { 
  getPlaybookByCode, 
  parseTenantSettings, 
  type IndustryPlaybook, 
  type TenantPlaybookSettings,
  type PlaybookTerminology,
  getEffectiveTerminology,
} from "../shared/playbooks";

// ============ PLAYBOOK SEEDING ============

/**
 * Seed an industry playbook into a tenant's configuration tables.
 * This is called during onboarding when a tenant selects their industry.
 * 
 * Seeds: tenant_roles, tenant_rubrics, tenant_call_types
 * Updates: tenants.settings with industry playbook reference + terminology
 */
export async function seedPlaybookForTenant(
  tenantId: number, 
  playbookCode: string
): Promise<{ success: boolean; error?: string; seeded?: { roles: number; rubrics: number; callTypes: number } }> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };

  const playbook = getPlaybookByCode(playbookCode);
  if (!playbook) return { success: false, error: `Playbook "${playbookCode}" not found` };

  try {
    // Check if tenant already has playbook data (avoid double-seeding)
    const existingRoles = await db.select().from(tenantRoles)
      .where(eq(tenantRoles.tenantId, tenantId));
    
    if (existingRoles.length > 0) {
      console.log(`[Playbook] Tenant ${tenantId} already has ${existingRoles.length} roles, skipping seed`);
      return { success: true, seeded: { roles: 0, rubrics: 0, callTypes: 0 } };
    }

    // 1. Seed rubrics first (roles and call types reference them)
    const rubricIdMap: Record<string, number> = {};
    for (let i = 0; i < playbook.rubrics.length; i++) {
      const rubric = playbook.rubrics[i];
      const [result] = await db.insert(tenantRubrics).values({
        tenantId,
        name: rubric.name,
        description: rubric.description,
        callType: rubric.callType,
        criteria: JSON.stringify(rubric.criteria),
        redFlags: JSON.stringify(rubric.redFlags),
        isActive: "true",
      }).$returningId();
      rubricIdMap[rubric.callType] = result.id;
    }

    // 2. Seed roles
    for (let i = 0; i < playbook.roles.length; i++) {
      const role = playbook.roles[i];
      // Find the primary rubric for this role
      let rubricId: number | undefined;
      if (role.code === "lead_generator") rubricId = rubricIdMap["cold_call"];
      else if (role.code === "lead_manager") rubricId = rubricIdMap["qualification"];
      else if (role.code === "acquisition_manager") rubricId = rubricIdMap["offer"];

      await db.insert(tenantRoles).values({
        tenantId,
        name: role.name,
        code: role.code,
        description: role.description,
        rubricId: rubricId || null,
        isActive: "true",
        sortOrder: i,
      });
    }

    // 3. Seed call types
    for (let i = 0; i < playbook.callTypes.length; i++) {
      const ct = playbook.callTypes[i];
      const rubricId = rubricIdMap[ct.rubricCallType];

      await db.insert(tenantCallTypes).values({
        tenantId,
        name: ct.name,
        code: ct.code,
        description: ct.description,
        rubricId: rubricId || null,
        isActive: "true",
        sortOrder: i,
      });
    }

    // 4. Update tenant settings with playbook reference
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
    const existingSettings = parseTenantSettings(tenant?.settings || null);
    const updatedSettings: TenantPlaybookSettings = {
      ...existingSettings,
      industryPlaybook: playbookCode,
      terminology: playbook.terminology,
    };

    await db.update(tenants)
      .set({ settings: JSON.stringify(updatedSettings) })
      .where(eq(tenants.id, tenantId));

    console.log(`[Playbook] Seeded "${playbookCode}" for tenant ${tenantId}: ${playbook.rubrics.length} rubrics, ${playbook.roles.length} roles, ${playbook.callTypes.length} call types`);

    return { 
      success: true, 
      seeded: { 
        roles: playbook.roles.length, 
        rubrics: playbook.rubrics.length, 
        callTypes: playbook.callTypes.length,
      } 
    };
  } catch (error) {
    console.error(`[Playbook] Error seeding playbook for tenant ${tenantId}:`, error);
    return { success: false, error: String(error) };
  }
}

// ============ TENANT PLAYBOOK QUERIES ============

/**
 * Get the full playbook configuration for a tenant.
 * Returns roles, rubrics, call types, and terminology.
 */
export async function getTenantPlaybook(tenantId: number) {
  const db = await getDb();
  if (!db) return null;

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  if (!tenant) return null;

  const roles = await db.select().from(tenantRoles)
    .where(and(eq(tenantRoles.tenantId, tenantId), eq(tenantRoles.isActive, "true")));

  const rubrics = await db.select().from(tenantRubrics)
    .where(and(eq(tenantRubrics.tenantId, tenantId), eq(tenantRubrics.isActive, "true")));

  const callTypes = await db.select().from(tenantCallTypes)
    .where(and(eq(tenantCallTypes.tenantId, tenantId), eq(tenantCallTypes.isActive, "true")));

  const settings = parseTenantSettings(tenant.settings);
  const terminology = getEffectiveTerminology(settings);

  return {
    industryPlaybook: settings.industryPlaybook || null,
    roles: roles.map(r => ({
      id: r.id,
      name: r.name,
      code: r.code,
      description: r.description,
      rubricId: r.rubricId,
      sortOrder: r.sortOrder,
    })),
    rubrics: rubrics.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      callType: r.callType,
      criteria: r.criteria,
      redFlags: r.redFlags,
    })),
    callTypes: callTypes.map(ct => ({
      id: ct.id,
      name: ct.name,
      code: ct.code,
      description: ct.description,
      rubricId: ct.rubricId,
      sortOrder: ct.sortOrder,
    })),
    terminology,
  };
}

/**
 * Get tenant terminology (lightweight version for frontend)
 */
export async function getTenantTerminology(tenantId: number): Promise<PlaybookTerminology | null> {
  const db = await getDb();
  if (!db) return null;

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  if (!tenant) return null;

  const settings = parseTenantSettings(tenant.settings);
  return getEffectiveTerminology(settings);
}

// ============ TENANT PLAYBOOK MUTATIONS ============

/**
 * Update a tenant role
 */
export async function updateTenantRole(
  tenantId: number,
  roleId: number,
  updates: { name?: string; description?: string; rubricId?: number | null }
) {
  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };

  // Verify role belongs to tenant
  const [role] = await db.select().from(tenantRoles)
    .where(and(eq(tenantRoles.id, roleId), eq(tenantRoles.tenantId, tenantId)));
  if (!role) return { success: false, error: "Role not found" };

  const updateData: Record<string, unknown> = {};
  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.description !== undefined) updateData.description = updates.description;
  if (updates.rubricId !== undefined) updateData.rubricId = updates.rubricId;

  if (Object.keys(updateData).length > 0) {
    await db.update(tenantRoles).set(updateData).where(eq(tenantRoles.id, roleId));
  }

  return { success: true };
}

/**
 * Update a tenant rubric
 */
export async function updateTenantRubric(
  tenantId: number,
  rubricId: number,
  updates: { 
    name?: string; 
    description?: string; 
    criteria?: string; 
    redFlags?: string;
  }
) {
  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };

  // Verify rubric belongs to tenant
  const [rubric] = await db.select().from(tenantRubrics)
    .where(and(eq(tenantRubrics.id, rubricId), eq(tenantRubrics.tenantId, tenantId)));
  if (!rubric) return { success: false, error: "Rubric not found" };

  const updateData: Record<string, unknown> = {};
  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.description !== undefined) updateData.description = updates.description;
  if (updates.criteria !== undefined) updateData.criteria = updates.criteria;
  if (updates.redFlags !== undefined) updateData.redFlags = updates.redFlags;

  if (Object.keys(updateData).length > 0) {
    await db.update(tenantRubrics).set(updateData).where(eq(tenantRubrics.id, rubricId));
  }

  return { success: true };
}

/**
 * Update a tenant call type
 */
export async function updateTenantCallType(
  tenantId: number,
  callTypeId: number,
  updates: { name?: string; description?: string; rubricId?: number | null }
) {
  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };

  // Verify call type belongs to tenant
  const [ct] = await db.select().from(tenantCallTypes)
    .where(and(eq(tenantCallTypes.id, callTypeId), eq(tenantCallTypes.tenantId, tenantId)));
  if (!ct) return { success: false, error: "Call type not found" };

  const updateData: Record<string, unknown> = {};
  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.description !== undefined) updateData.description = updates.description;
  if (updates.rubricId !== undefined) updateData.rubricId = updates.rubricId;

  if (Object.keys(updateData).length > 0) {
    await db.update(tenantCallTypes).set(updateData).where(eq(tenantCallTypes.id, callTypeId));
  }

  return { success: true };
}

/**
 * Update tenant terminology (stored in tenants.settings)
 */
export async function updateTenantTerminology(
  tenantId: number,
  terminology: Partial<PlaybookTerminology>
) {
  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  if (!tenant) return { success: false, error: "Tenant not found" };

  const settings = parseTenantSettings(tenant.settings);
  const updatedSettings: TenantPlaybookSettings = {
    ...settings,
    terminology: {
      ...settings.terminology,
      ...terminology,
      roleLabels: { ...settings.terminology?.roleLabels, ...terminology.roleLabels },
      callTypeLabels: { ...settings.terminology?.callTypeLabels, ...terminology.callTypeLabels },
      outcomeLabels: { ...settings.terminology?.outcomeLabels, ...terminology.outcomeLabels },
      kpiLabels: { ...settings.terminology?.kpiLabels, ...terminology.kpiLabels },
    },
  };

  await db.update(tenants)
    .set({ settings: JSON.stringify(updatedSettings) })
    .where(eq(tenants.id, tenantId));

  return { success: true };
}

/**
 * Add a new custom role to a tenant
 */
export async function addTenantRole(
  tenantId: number,
  role: { name: string; code: string; description?: string; rubricId?: number }
) {
  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };

  // Get current max sort order
  const existingRoles = await db.select().from(tenantRoles)
    .where(eq(tenantRoles.tenantId, tenantId));
  const maxSort = existingRoles.reduce((max, r) => Math.max(max, r.sortOrder || 0), 0);

  const [result] = await db.insert(tenantRoles).values({
    tenantId,
    name: role.name,
    code: role.code,
    description: role.description || null,
    rubricId: role.rubricId || null,
    isActive: "true",
    sortOrder: maxSort + 1,
  }).$returningId();

  return { success: true, roleId: result.id };
}

/**
 * Add a new custom rubric to a tenant
 */
export async function addTenantRubric(
  tenantId: number,
  rubric: { name: string; description?: string; callType?: string; criteria: string; redFlags?: string }
) {
  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };

  const [result] = await db.insert(tenantRubrics).values({
    tenantId,
    name: rubric.name,
    description: rubric.description || null,
    callType: rubric.callType || null,
    criteria: rubric.criteria,
    redFlags: rubric.redFlags || null,
    isActive: "true",
  }).$returningId();

  return { success: true, rubricId: result.id };
}

/**
 * Add a new custom call type to a tenant
 */
export async function addTenantCallType(
  tenantId: number,
  callType: { name: string; code: string; description?: string; rubricId?: number }
) {
  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };

  const existingTypes = await db.select().from(tenantCallTypes)
    .where(eq(tenantCallTypes.tenantId, tenantId));
  const maxSort = existingTypes.reduce((max, ct) => Math.max(max, ct.sortOrder || 0), 0);

  const [result] = await db.insert(tenantCallTypes).values({
    tenantId,
    name: callType.name,
    code: callType.code,
    description: callType.description || null,
    rubricId: callType.rubricId || null,
    isActive: "true",
    sortOrder: maxSort + 1,
  }).$returningId();

  return { success: true, callTypeId: result.id };
}

/**
 * Delete (deactivate) a tenant role
 */
export async function deactivateTenantRole(tenantId: number, roleId: number) {
  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };

  await db.update(tenantRoles)
    .set({ isActive: "false" })
    .where(and(eq(tenantRoles.id, roleId), eq(tenantRoles.tenantId, tenantId)));

  return { success: true };
}

/**
 * Delete (deactivate) a tenant rubric
 */
export async function deactivateTenantRubric(tenantId: number, rubricId: number) {
  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };

  await db.update(tenantRubrics)
    .set({ isActive: "false" })
    .where(and(eq(tenantRubrics.id, rubricId), eq(tenantRubrics.tenantId, tenantId)));

  return { success: true };
}

/**
 * Delete (deactivate) a tenant call type
 */
export async function deactivateTenantCallType(tenantId: number, callTypeId: number) {
  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };

  await db.update(tenantCallTypes)
    .set({ isActive: "false" })
    .where(and(eq(tenantCallTypes.id, callTypeId), eq(tenantCallTypes.tenantId, tenantId)));

  return { success: true };
}

/**
 * Get rubric by tenant call type.
 * Used by the grading engine to find the right rubric for a detected call type.
 */
export async function getRubricForCallType(
  tenantId: number, 
  callTypeCode: string
): Promise<{ id: number; name: string; criteria: string; redFlags: string | null; callType: string | null } | null> {
  const db = await getDb();
  if (!db) return null;

  // First try to find by call type code → rubric mapping
  const [ct] = await db.select().from(tenantCallTypes)
    .where(and(
      eq(tenantCallTypes.tenantId, tenantId),
      eq(tenantCallTypes.code, callTypeCode),
      eq(tenantCallTypes.isActive, "true")
    ));

  if (ct?.rubricId) {
    const [rubric] = await db.select().from(tenantRubrics)
      .where(and(
        eq(tenantRubrics.id, ct.rubricId),
        eq(tenantRubrics.isActive, "true")
      ));
    if (rubric) return rubric;
  }

  // Fallback: find rubric by callType field matching
  const [rubric] = await db.select().from(tenantRubrics)
    .where(and(
      eq(tenantRubrics.tenantId, tenantId),
      eq(tenantRubrics.callType, callTypeCode),
      eq(tenantRubrics.isActive, "true")
    ));

  return rubric || null;
}
