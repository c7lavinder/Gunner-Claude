/**
 * delete-test-tenants.mjs
 *
 * Permanently deletes all test tenants and their associated data from
 * the Supabase PostgreSQL database.
 *
 * KEEPS:
 *   - ID 1       → New Again Houses (production)
 *   - ID 450029  → NAH Kitty Hawk (production)
 *   - slug 'demo-apex' → Apex Property Solutions (live sales demo)
 *
 * Usage (dry run — shows what would be deleted):
 *   DATABASE_URL=<pg-url> node scripts/delete-test-tenants.mjs
 *
 * Usage (actually delete):
 *   DATABASE_URL=<pg-url> node scripts/delete-test-tenants.mjs --confirm
 *
 * If DATABASE_URL is not in your environment, put it in .env at the project root.
 */

// Load pg and dotenv from helper install if not available locally
import { createRequire } from 'module';
const req = createRequire('/tmp/gunner-pg-helper/package.json');
const { Client } = req('pg');
const dotenv = req('dotenv');

// Try loading .env from project root
dotenv.config({ path: new URL('../.env', import.meta.url).pathname });

const KEEP_TENANT_IDS = [1, 450029];
const KEEP_TENANT_SLUGS = ['demo-apex'];

const DRY_RUN = !process.argv.includes('--confirm');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL environment variable is required.');
    console.error('  Set it in your environment or in .env at the project root.');
    process.exit(1);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log('Connected to PostgreSQL.\n');

  try {
    // ── 1. Identify test tenants ──────────────────────────────────────────────
    const { rows: allTenants } = await client.query(
      'SELECT id, name, slug, "subscriptionTier", "createdAt" FROM tenants ORDER BY id'
    );

    const realTenants = allTenants.filter(
      t => KEEP_TENANT_IDS.includes(t.id) || KEEP_TENANT_SLUGS.includes(t.slug)
    );
    const testTenants = allTenants.filter(
      t => !KEEP_TENANT_IDS.includes(t.id) && !KEEP_TENANT_SLUGS.includes(t.slug)
    );

    if (testTenants.length === 0) {
      console.log('No test tenants found — nothing to delete.');
      await client.end();
      return;
    }

    console.log(`Found ${allTenants.length} total tenant(s). Keeping (${realTenants.length}):`);
    realTenants.forEach(t =>
      console.log(`  ✓ ID ${t.id}: ${t.name} (slug: ${t.slug})`)
    );

    console.log(`\nTest tenants to DELETE (${testTenants.length}):`);
    testTenants.forEach(t =>
      console.log(`  ✗ ID ${t.id}: ${t.name} (slug: ${t.slug}, tier: ${t.subscriptionTier})`)
    );

    if (DRY_RUN) {
      console.log('\n⚠️  DRY RUN — no changes made.');
      console.log('   Run with --confirm to actually delete:\n');
      console.log(`   DATABASE_URL=... node scripts/delete-test-tenants.mjs --confirm\n`);
      await client.end();
      return;
    }

    // ── 2. Build placeholders ─────────────────────────────────────────────────
    const testIds = testTenants.map(t => t.id);
    const ph = (ids) => ids.map((_, i) => `$${i + 1}`).join(', ');

    console.log('\n🗑  Starting deletion...\n');

    async function del(table, col = '"tenantId"', ids = testIds) {
      if (ids.length === 0) return;
      const res = await client.query(
        `DELETE FROM ${table} WHERE ${col} IN (${ph(ids)})`,
        ids
      );
      if (res.rowCount > 0) {
        console.log(`  ${table}: ${res.rowCount} rows deleted`);
      }
    }

    // ── 3. Collect user IDs in test tenants ───────────────────────────────────
    const { rows: testUserRows } = await client.query(
      `SELECT id FROM users WHERE "tenantId" IN (${ph(testIds)})`,
      testIds
    );
    const testUserIds = testUserRows.map(u => u.id);
    console.log(`  Found ${testUserIds.length} users in test tenants.\n`);

    // ── 4. Cascade delete (leaf → parent order) ───────────────────────────────

    // Property pipeline sub-tables
    await del('deal_content_edits');
    await del('deal_distributions');
    await del('property_activity_log');
    await del('property_buyer_activity');
    await del('dispo_property_showings');
    await del('dispo_property_offers');
    await del('dispo_property_sends');
    await del('property_stage_history');
    await del('dispo_daily_kpis');
    await del('dispo_properties');

    // Coach sub-tables
    await del('coach_action_edits');
    await del('coach_action_log');
    await del('coach_messages');
    await del('ai_coach_preferences');

    // Call sub-tables
    await del('call_next_steps');
    await del('webhook_retry_queue');
    await del('reward_views');
    await del('deals');
    await del('xp_transactions');
    await del('user_badges');
    await del('badge_progress');
    await del('user_streaks');
    await del('user_xp');
    await del('opportunities');
    await del('ai_feedback');
    await del('call_grades');
    await del('calls');
    await del('daily_kpi_entries');
    await del('webhook_events');

    // Team sub-tables
    await del('team_training_items');
    await del('team_assignments');
    await del('performance_metrics');

    // KPI sub-tables
    await del('kpi_goals');
    await del('team_member_kpis');
    await del('team_members');
    await del('kpi_spend');
    await del('kpi_volume');
    await del('kpi_sources');
    await del('kpi_markets');
    await del('kpi_channels');
    await del('kpi_deals');
    await del('campaign_kpis');
    await del('kpi_periods');
    await del('lead_gen_staff');

    // Contact cache & GHL tokens
    await del('contact_cache');
    await del('ghl_oauth_tokens');

    // Content / branding
    await del('content_ideas');
    await del('social_posts');
    await del('brand_assets');
    await del('brand_profile');

    // Training / rubrics
    await del('training_materials');
    await del('grading_rules');
    await del('tenant_roles');
    await del('tenant_call_types');
    await del('tenant_rubrics');

    // Misc tenant-scoped
    await del('pending_invitations');
    await del('outreach_history');
    await del('api_usage');
    await del('sync_log');

    // User-level tables (keyed by userId, not tenantId)
    if (testUserIds.length > 0) {
      await del('emails_sent', '"userId"', testUserIds);
      await del('password_reset_tokens', '"userId"', testUserIds);
      await del('email_verification_tokens', '"userId"', testUserIds);
      await del('user_instructions', '"userId"', testUserIds);
    }

    // Users
    await del('users');

    // Finally: tenants themselves
    const res = await client.query(
      `DELETE FROM tenants WHERE id IN (${ph(testIds)})`,
      testIds
    );
    console.log(`\n  tenants: ${res.rowCount} rows deleted`);

    console.log(`\n✅  Done. Deleted ${testTenants.length} test tenant(s) and all related data.`);

    // ── 5. Verify ─────────────────────────────────────────────────────────────
    const { rows: remaining } = await client.query(
      'SELECT id, name, slug FROM tenants ORDER BY id'
    );
    console.log(`\nRemaining tenants (${remaining.length}):`);
    remaining.forEach(t => console.log(`  ✓ ID ${t.id}: ${t.name} (${t.slug})`));

  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('\nFATAL ERROR:', err.message);
  console.error(err.detail || '');
  process.exit(1);
});
