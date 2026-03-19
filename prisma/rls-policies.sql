-- Gunner AI — Supabase Row Level Security Policies
-- Run this in Supabase SQL Editor after running prisma migrate
-- These policies enforce tenant isolation at the database level

-- ─── Enable RLS on all tables ─────────────────────────────────────────────────

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE sellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_sellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_rubrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ─── Helper function: get current user's tenant_id ───────────────────────────
-- This reads from the JWT claim we inject via the service role

CREATE OR REPLACE FUNCTION get_tenant_id()
RETURNS text AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION get_user_id()
RETURNS text AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS text AS $$
  SELECT NULLIF(current_setting('app.user_role', true), '')
$$ LANGUAGE SQL STABLE;

-- ─── TENANTS ─────────────────────────────────────────────────────────────────

-- Users can only see their own tenant
CREATE POLICY "tenant_isolation" ON tenants
  FOR ALL USING (id = get_tenant_id());

-- ─── USERS ────────────────────────────────────────────────────────────────────

-- Users see all users in their tenant (needed for assignments)
CREATE POLICY "users_same_tenant" ON users
  FOR SELECT USING (tenant_id = get_tenant_id());

-- Users can only update their own record
CREATE POLICY "users_update_own" ON users
  FOR UPDATE USING (id = get_user_id() AND tenant_id = get_tenant_id());

-- Admins/Owners can insert users (invite)
CREATE POLICY "users_admin_insert" ON users
  FOR INSERT WITH CHECK (
    tenant_id = get_tenant_id() AND
    get_user_role() IN ('OWNER', 'ADMIN', 'TEAM_LEAD')
  );

-- ─── PROPERTIES ───────────────────────────────────────────────────────────────

CREATE POLICY "properties_tenant_isolation" ON properties
  FOR ALL USING (tenant_id = get_tenant_id());

-- ─── SELLERS ──────────────────────────────────────────────────────────────────

CREATE POLICY "sellers_tenant_isolation" ON sellers
  FOR ALL USING (tenant_id = get_tenant_id());

-- ─── PROPERTY_SELLERS ─────────────────────────────────────────────────────────

CREATE POLICY "property_sellers_tenant" ON property_sellers
  FOR ALL USING (
    property_id IN (
      SELECT id FROM properties WHERE tenant_id = get_tenant_id()
    )
  );

-- ─── CALLS ────────────────────────────────────────────────────────────────────

-- Tenant isolation
CREATE POLICY "calls_tenant_isolation" ON calls
  FOR ALL USING (tenant_id = get_tenant_id());

-- ─── CALL_RUBRICS ─────────────────────────────────────────────────────────────

CREATE POLICY "rubrics_tenant_isolation" ON call_rubrics
  FOR ALL USING (tenant_id = get_tenant_id());

-- ─── TASKS ────────────────────────────────────────────────────────────────────

CREATE POLICY "tasks_tenant_isolation" ON tasks
  FOR ALL USING (tenant_id = get_tenant_id());

-- ─── KPI_SNAPSHOTS ────────────────────────────────────────────────────────────

CREATE POLICY "kpi_snapshots_tenant" ON kpi_snapshots
  FOR ALL USING (tenant_id = get_tenant_id());

-- ─── ROLE_CONFIGS ─────────────────────────────────────────────────────────────

CREATE POLICY "role_configs_tenant" ON role_configs
  FOR ALL USING (tenant_id = get_tenant_id());

-- ─── AUDIT_LOGS ───────────────────────────────────────────────────────────────

CREATE POLICY "audit_logs_tenant" ON audit_logs
  FOR SELECT USING (tenant_id = get_tenant_id());

-- System can always insert audit logs (service role bypasses RLS)

-- ─── Service role bypass ──────────────────────────────────────────────────────
-- The SUPABASE_SERVICE_ROLE_KEY bypasses all RLS policies
-- Use it ONLY for: webhooks, background jobs, migrations
-- Never expose it client-side
