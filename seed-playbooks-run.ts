import { getDb } from "./server/db";
import { tenants, tenantRoles } from "./drizzle/schema";
import { eq } from "drizzle-orm";
import { seedPlaybookForTenant } from "./server/playbooks";

async function main() {
  const db = await getDb();
  if (!db) {
    console.error("Could not connect to database");
    process.exit(1);
  }

  // Get all tenants
  const allTenants = await db.select({ id: tenants.id, name: tenants.name, settings: tenants.settings }).from(tenants);
  console.log(`Found ${allTenants.length} tenants`);

  let seeded = 0;
  let skipped = 0;

  for (const tenant of allTenants) {
    // Check if tenant already has roles seeded
    const existingRoles = await db.select().from(tenantRoles).where(eq(tenantRoles.tenantId, tenant.id));
    
    if (existingRoles.length > 0) {
      console.log(`SKIP: Tenant ${tenant.id} (${tenant.name}) already has ${existingRoles.length} roles`);
      skipped++;
      continue;
    }

    console.log(`SEEDING: Tenant ${tenant.id} (${tenant.name})...`);
    const result = await seedPlaybookForTenant(tenant.id, "real_estate_wholesaling");
    
    if (result.success) {
      console.log(`  SUCCESS: Seeded ${JSON.stringify(result.seeded)}`);
      seeded++;
    } else {
      console.error(`  FAILED: ${result.error}`);
    }
  }

  console.log(`\nDone! Seeded: ${seeded}, Skipped: ${skipped}, Total: ${allTenants.length}`);
  process.exit(0);
}

main().catch(e => {
  console.error("Fatal error:", e);
  process.exit(1);
});
