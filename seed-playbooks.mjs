/**
 * One-time migration script: Seed all existing tenants with the wholesaling playbook.
 * 
 * This script:
 * 1. Finds all tenants that don't have playbook data yet (no tenant_roles)
 * 2. Seeds them with the Real Estate Wholesaling playbook
 * 3. Updates their settings with the playbook reference and terminology
 * 
 * Run: node seed-playbooks.mjs
 */

import { createRequire } from 'module';

// We need to use tsx to run TypeScript imports
import { execSync } from 'child_process';

// Run via tsx so we can import the TypeScript modules
const code = `
import { getDb } from "./server/db.ts";
import { tenants, tenantRoles } from "./drizzle/schema.ts";
import { eq } from "drizzle-orm";
import { seedPlaybookForTenant } from "./server/playbooks.ts";

async function main() {
  const db = await getDb();
  if (!db) {
    console.error("Could not connect to database");
    process.exit(1);
  }

  // Get all tenants
  const allTenants = await db.select({ id: tenants.id, name: tenants.name, settings: tenants.settings }).from(tenants);
  console.log("Found " + allTenants.length + " tenants");

  let seeded = 0;
  let skipped = 0;

  for (const tenant of allTenants) {
    // Check if tenant already has roles seeded
    const existingRoles = await db.select().from(tenantRoles).where(eq(tenantRoles.tenantId, tenant.id));
    
    if (existingRoles.length > 0) {
      console.log("SKIP: Tenant " + tenant.id + " (" + tenant.name + ") already has " + existingRoles.length + " roles");
      skipped++;
      continue;
    }

    console.log("SEEDING: Tenant " + tenant.id + " (" + tenant.name + ")...");
    const result = await seedPlaybookForTenant(tenant.id, "real_estate_wholesaling");
    
    if (result.success) {
      console.log("  SUCCESS: Seeded " + JSON.stringify(result.seeded));
      seeded++;
    } else {
      console.error("  FAILED: " + result.error);
    }
  }

  console.log("\\nDone! Seeded: " + seeded + ", Skipped: " + skipped + ", Total: " + allTenants.length);
  process.exit(0);
}

main().catch(e => {
  console.error("Fatal error:", e);
  process.exit(1);
});
`;

// Write the TS code to a temp file and run with tsx
import { writeFileSync, unlinkSync } from 'fs';
const tmpFile = '/tmp/seed-playbooks-runner.ts';
writeFileSync(tmpFile, code);

try {
  execSync(`cd /home/ubuntu/gunner && npx tsx ${tmpFile}`, { stdio: 'inherit', timeout: 60000 });
} catch (e) {
  console.error("Script failed:", e.message);
  process.exit(1);
} finally {
  try { unlinkSync(tmpFile); } catch {}
}
