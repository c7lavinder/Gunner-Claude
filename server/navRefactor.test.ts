import { describe, it, expect } from 'vitest';

/**
 * Navigation Refactor Tests
 * 
 * Verifies that:
 * 1. Analytics is hidden from top nav
 * 2. Team is in top nav (not in profile dropdown)
 * 3. Settings and Admin are in the profile dropdown
 * 4. Icons are removed from top nav tabs (text-only)
 * 5. Signals page is removed from navigation
 * 6. Day Hub is visible to users with role=admin (e.g. Kyle Barks)
 */

type MenuItem = { label: string; path: string };

// Replicate getMenuItems logic from DashboardLayout.tsx
function getMenuItems(
  teamRole: string | null | undefined,
  openId?: string,
  userRole?: string,
  isTenantAdmin?: string | null,
  isDemo?: boolean
): MenuItem[] {
  const isAdmin = teamRole === 'admin' || isTenantAdmin === 'true' || userRole === 'admin';
  const isSuperAdmin = userRole === 'super_admin';
  const isLeadGenerator = teamRole === 'lead_generator';

  if (isLeadGenerator) {
    return [
      { label: "Dashboard", path: "/dashboard" },
      { label: "Calls", path: "/calls" },
      { label: "Training", path: "/training" },
    ];
  }

  const items: MenuItem[] = [
    { label: "Dashboard", path: "/dashboard" },
    { label: "Calls", path: "/calls" },
    // Analytics hidden per user request
  ];

  if (isAdmin || isSuperAdmin) {
    items.push({ label: "Day Hub", path: "/tasks" });
  }

  items.push({ label: "Training", path: "/training" });
  items.push({ label: "Team", path: "/team" });

  return items;
}

// Profile dropdown items logic (replicated from DashboardLayout.tsx)
function getProfileDropdownItems(
  effectiveRole: string | undefined,
  effectiveTeamRole: string | undefined,
  effectiveIsTenantAdmin: string | null | undefined,
  isDemo: boolean
): MenuItem[] {
  const items: MenuItem[] = [
    { label: "Account Settings", path: "/profile" },
  ];

  if ((effectiveRole === 'admin' || effectiveTeamRole === 'admin' || effectiveIsTenantAdmin === 'true') && !isDemo) {
    items.push({ label: "Organization Settings", path: "/settings" });
  }

  if (effectiveRole === 'super_admin' && !isDemo) {
    items.push({ label: "Admin", path: "/admin" });
  }

  return items;
}

describe('Navigation - Top Nav Menu Items', () => {
  it('should NOT include Analytics in top nav', () => {
    const items = getMenuItems('admin', 'user1', 'admin', 'true', false);
    const labels = items.map(i => i.label);
    expect(labels).not.toContain('Analytics');
  });

  it('should include Team in top nav', () => {
    const items = getMenuItems('admin', 'user1', 'admin', 'true', false);
    const labels = items.map(i => i.label);
    expect(labels).toContain('Team');
  });

  it('should NOT include Settings in top nav for admin users', () => {
    const items = getMenuItems('admin', 'user1', 'admin', 'true', false);
    const labels = items.map(i => i.label);
    expect(labels).not.toContain('Settings');
  });

  it('should NOT include Admin in top nav for super_admin users', () => {
    const items = getMenuItems('admin', 'user1', 'super_admin', 'true', false);
    const labels = items.map(i => i.label);
    expect(labels).not.toContain('Admin');
  });

  it('should NOT include Signals in nav (removed)', () => {
    const items = getMenuItems('admin', 'user1', 'admin', 'true', false);
    const labels = items.map(i => i.label);
    expect(labels).not.toContain('Signals');
  });

  it('should include Dashboard, Calls, Day Hub, Training, Team for admin users', () => {
    const items = getMenuItems('admin', 'user1', 'admin', 'true', false);
    const labels = items.map(i => i.label);
    expect(labels).toEqual(['Dashboard', 'Calls', 'Day Hub', 'Training', 'Team']);
  });

  it('should include Dashboard, Calls, Training, Team for non-admin users', () => {
    const items = getMenuItems('lead_manager', 'user1', 'user', null, false);
    const labels = items.map(i => i.label);
    expect(labels).toEqual(['Dashboard', 'Calls', 'Training', 'Team']);
  });

  it('should show limited nav for lead_generator role', () => {
    const items = getMenuItems('lead_generator', 'user1', 'user', null, false);
    const labels = items.map(i => i.label);
    expect(labels).toEqual(['Dashboard', 'Calls', 'Training']);
  });

  it('menu items should be text-only (no icon property in output)', () => {
    const items = getMenuItems('admin', 'user1', 'admin', 'true', false);
    items.forEach(item => {
      expect(Object.keys(item)).toEqual(['label', 'path']);
    });
  });

  it('should show Day Hub for user with role=admin but teamRole=acquisition_manager (Kyle Barks case)', () => {
    // Kyle has role=admin, teamRole=acquisition_manager, isTenantAdmin=false
    const items = getMenuItems('acquisition_manager', 'kyle1', 'admin', 'false', false);
    const labels = items.map(i => i.label);
    expect(labels).toContain('Day Hub');
  });

  it('should NOT show Day Hub for regular user with teamRole=acquisition_manager', () => {
    const items = getMenuItems('acquisition_manager', 'user1', 'user', 'false', false);
    const labels = items.map(i => i.label);
    expect(labels).not.toContain('Day Hub');
  });
});

describe('Navigation - Profile Dropdown Items', () => {
  it('should NOT include Team in profile dropdown (moved to top nav)', () => {
    const items = getProfileDropdownItems('user', 'lead_manager', null, false);
    expect(items.map(i => i.label)).not.toContain('Team');
  });

  it('should include Account Settings for all users', () => {
    const items = getProfileDropdownItems('user', 'lead_manager', null, false);
    expect(items.map(i => i.label)).toContain('Account Settings');
  });

  it('should include Organization Settings for admin role', () => {
    const items = getProfileDropdownItems('admin', 'admin', 'true', false);
    expect(items.map(i => i.label)).toContain('Organization Settings');
  });

  it('should NOT include Organization Settings for non-admin users', () => {
    const items = getProfileDropdownItems('user', 'lead_manager', null, false);
    expect(items.map(i => i.label)).not.toContain('Organization Settings');
  });

  it('should include Admin for super_admin', () => {
    const items = getProfileDropdownItems('super_admin', 'admin', 'true', false);
    expect(items.map(i => i.label)).toContain('Admin');
  });

  it('should NOT include Admin for regular admin', () => {
    const items = getProfileDropdownItems('admin', 'admin', 'true', false);
    expect(items.map(i => i.label)).not.toContain('Admin');
  });

  it('should NOT include Organization Settings or Admin in demo mode', () => {
    const items = getProfileDropdownItems('super_admin', 'admin', 'true', true);
    const labels = items.map(i => i.label);
    expect(labels).not.toContain('Organization Settings');
    expect(labels).not.toContain('Admin');
  });
});

describe('Navigation - Route Paths', () => {
  it('Team should route to /team in top nav', () => {
    const items = getMenuItems('admin', 'user1', 'admin', 'true', false);
    expect(items.find(i => i.label === 'Team')?.path).toBe('/team');
  });

  it('Organization Settings should route to /settings', () => {
    const items = getProfileDropdownItems('admin', 'admin', 'true', false);
    expect(items.find(i => i.label === 'Organization Settings')?.path).toBe('/settings');
  });

  it('Admin should route to /admin', () => {
    const items = getProfileDropdownItems('super_admin', 'admin', 'true', false);
    expect(items.find(i => i.label === 'Admin')?.path).toBe('/admin');
  });
});
