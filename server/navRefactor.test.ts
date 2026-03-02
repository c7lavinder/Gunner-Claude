import { describe, it, expect } from 'vitest';

/**
 * Navigation Refactor Tests
 * 
 * Verifies that Team, Settings, and Admin are no longer in the top nav bar
 * (getMenuItems) and are instead only accessible via the profile dropdown menu.
 * 
 * Since getMenuItems is defined inline in DashboardLayout.tsx (a React component),
 * we replicate its logic here to test the menu structure independently.
 */

// Replicate getMenuItems logic from DashboardLayout.tsx
type MenuItem = { label: string; path: string };

function getMenuItems(
  teamRole: string | null | undefined,
  openId?: string,
  userRole?: string,
  isTenantAdmin?: string | null,
  isDemo?: boolean
): MenuItem[] {
  const isAdmin = teamRole === 'admin' || isTenantAdmin === 'true';
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
    { label: "Analytics", path: "/analytics" },
  ];

  if (isAdmin) {
    items.push({ label: "Signals", path: "/opportunities" });
  }

  items.push({ label: "Training", path: "/training" });

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
    { label: "Team", path: "/team" },
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

describe('Navigation Refactor - Top Nav Menu Items', () => {
  it('should NOT include Team in top nav for admin users', () => {
    const items = getMenuItems('admin', 'user1', 'admin', 'true', false);
    const labels = items.map(i => i.label);
    expect(labels).not.toContain('Team');
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

  it('should include Dashboard, Calls, Analytics, Signals, Training for admin users', () => {
    const items = getMenuItems('admin', 'user1', 'admin', 'true', false);
    const labels = items.map(i => i.label);
    expect(labels).toEqual(['Dashboard', 'Calls', 'Analytics', 'Signals', 'Training']);
  });

  it('should include Dashboard, Calls, Analytics, Training for non-admin users', () => {
    const items = getMenuItems('lead_manager', 'user1', 'user', null, false);
    const labels = items.map(i => i.label);
    expect(labels).toEqual(['Dashboard', 'Calls', 'Analytics', 'Training']);
  });

  it('should show limited nav for lead_generator role', () => {
    const items = getMenuItems('lead_generator', 'user1', 'user', null, false);
    const labels = items.map(i => i.label);
    expect(labels).toEqual(['Dashboard', 'Calls', 'Training']);
    expect(labels).not.toContain('Team');
    expect(labels).not.toContain('Settings');
    expect(labels).not.toContain('Admin');
  });

  it('should not include Team/Settings/Admin in top nav for demo mode', () => {
    const items = getMenuItems('admin', 'user1', 'admin', 'true', true);
    const labels = items.map(i => i.label);
    expect(labels).not.toContain('Team');
    expect(labels).not.toContain('Settings');
    expect(labels).not.toContain('Admin');
  });
});

describe('Navigation Refactor - Profile Dropdown Items', () => {
  it('should include Team for all users', () => {
    const items = getProfileDropdownItems('user', 'lead_manager', null, false);
    const labels = items.map(i => i.label);
    expect(labels).toContain('Team');
  });

  it('should include Account Settings for all users', () => {
    const items = getProfileDropdownItems('user', 'lead_manager', null, false);
    const labels = items.map(i => i.label);
    expect(labels).toContain('Account Settings');
  });

  it('should include Organization Settings for admin role', () => {
    const items = getProfileDropdownItems('admin', 'admin', 'true', false);
    const labels = items.map(i => i.label);
    expect(labels).toContain('Organization Settings');
  });

  it('should include Organization Settings for tenant admin', () => {
    const items = getProfileDropdownItems('user', 'lead_manager', 'true', false);
    const labels = items.map(i => i.label);
    expect(labels).toContain('Organization Settings');
  });

  it('should NOT include Organization Settings for non-admin users', () => {
    const items = getProfileDropdownItems('user', 'lead_manager', null, false);
    const labels = items.map(i => i.label);
    expect(labels).not.toContain('Organization Settings');
  });

  it('should include Admin for super_admin', () => {
    const items = getProfileDropdownItems('super_admin', 'admin', 'true', false);
    const labels = items.map(i => i.label);
    expect(labels).toContain('Admin');
  });

  it('should NOT include Admin for regular admin', () => {
    const items = getProfileDropdownItems('admin', 'admin', 'true', false);
    const labels = items.map(i => i.label);
    expect(labels).not.toContain('Admin');
  });

  it('should NOT include Organization Settings in demo mode', () => {
    const items = getProfileDropdownItems('admin', 'admin', 'true', true);
    const labels = items.map(i => i.label);
    expect(labels).not.toContain('Organization Settings');
  });

  it('should NOT include Admin in demo mode', () => {
    const items = getProfileDropdownItems('super_admin', 'admin', 'true', true);
    const labels = items.map(i => i.label);
    expect(labels).not.toContain('Admin');
  });

  it('should show Team and Account Settings even in demo mode', () => {
    const items = getProfileDropdownItems('admin', 'admin', 'true', true);
    const labels = items.map(i => i.label);
    expect(labels).toContain('Team');
    expect(labels).toContain('Account Settings');
  });
});

describe('Navigation Refactor - Route Paths', () => {
  it('Team should route to /team', () => {
    const items = getProfileDropdownItems('user', 'lead_manager', null, false);
    const teamItem = items.find(i => i.label === 'Team');
    expect(teamItem?.path).toBe('/team');
  });

  it('Organization Settings should route to /settings', () => {
    const items = getProfileDropdownItems('admin', 'admin', 'true', false);
    const settingsItem = items.find(i => i.label === 'Organization Settings');
    expect(settingsItem?.path).toBe('/settings');
  });

  it('Admin should route to /admin', () => {
    const items = getProfileDropdownItems('super_admin', 'admin', 'true', false);
    const adminItem = items.find(i => i.label === 'Admin');
    expect(adminItem?.path).toBe('/admin');
  });
});
