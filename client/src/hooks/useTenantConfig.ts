/**
 * useTenantConfig Hook
 * 
 * Provides tenant-specific terminology and playbook configuration
 * throughout the frontend. This is the single source of truth for
 * dynamic labels — no more hardcoded role names, call types, or outcomes.
 * 
 * Usage:
 *   const { t, roles, callTypes } = useTenantConfig();
 *   <span>{t.contactLabel}</span>  // "Seller" for wholesaling, "Investor" for funds
 *   <span>{t.role("lead_manager")}</span>  // "Lead Manager" or whatever the tenant calls it
 */

import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useMemo } from "react";

// ============ DEFAULT TERMINOLOGY ============
// These are the wholesaling defaults — used when no tenant config is loaded

const DEFAULT_TERMINOLOGY = {
  contactLabel: "Seller",
  contactLabelPlural: "Sellers",
  dealLabel: "Deal",
  dealLabelPlural: "Deals",
  assetLabel: "Property",
  assetLabelPlural: "Properties",
  roleLabels: {
    admin: "Admin",
    lead_generator: "Lead Generator",
    lead_manager: "Lead Manager",
    acquisition_manager: "Acquisition Manager",
    dispo_manager: "Disposition Manager",
  } as Record<string, string>,
  callTypeLabels: {
    cold_call: "Cold Call",
    qualification: "Qualification",
    offer: "Offer",
    follow_up: "Follow-Up",
    seller_callback: "Seller Callback",
    admin_callback: "Admin Callback",
  } as Record<string, string>,
  outcomeLabels: {
    appointment_set: "Appointment Set",
    offer_made: "Offer Made",
    offer_accepted: "Offer Accepted",
    follow_up_scheduled: "Follow-Up Scheduled",
    not_interested: "Not Interested",
    no_answer: "No Answer",
    wrong_number: "Wrong Number",
    dnc: "DNC",
  } as Record<string, string>,
  kpiLabels: {
    appointments_set: "Appointments Set",
    offers_made: "Offers Made",
    offers_accepted: "Offers Accepted",
    calls_made: "Calls Made",
  } as Record<string, string>,
};

export type TenantTerminology = typeof DEFAULT_TERMINOLOGY;

// ============ HOOK ============

export function useTenantConfig() {
  const { user } = useAuth();
  
  const { data: terminology, isLoading } = trpc.playbook.terminology.useQuery(undefined, {
    enabled: !!user?.tenantId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchOnWindowFocus: false,
  });

  const { data: playbook } = trpc.playbook.get.useQuery(undefined, {
    enabled: !!user?.tenantId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const t = useMemo(() => {
    const merged = {
      ...DEFAULT_TERMINOLOGY,
      ...terminology,
      roleLabels: { ...DEFAULT_TERMINOLOGY.roleLabels, ...terminology?.roleLabels },
      callTypeLabels: { ...DEFAULT_TERMINOLOGY.callTypeLabels, ...terminology?.callTypeLabels },
      outcomeLabels: { ...DEFAULT_TERMINOLOGY.outcomeLabels, ...terminology?.outcomeLabels },
      kpiLabels: { ...DEFAULT_TERMINOLOGY.kpiLabels, ...terminology?.kpiLabels },
    };

    return {
      ...merged,

      // Helper: get display name for a role code
      role: (code: string | null | undefined): string => {
        if (!code) return "Unknown";
        // First check if there's a tenant role with this code
        if (playbook?.roles) {
          const tenantRole = playbook.roles.find(r => r.code === code);
          if (tenantRole) return tenantRole.name;
        }
        // Then check terminology overrides
        if (merged.roleLabels[code]) return merged.roleLabels[code];
        // Fallback: format the code nicely
        return code.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
      },

      // Helper: get display name for a call type code
      callType: (code: string | null | undefined): string => {
        if (!code) return "Unknown";
        // First check tenant call types
        if (playbook?.callTypes) {
          const tenantCT = playbook.callTypes.find(ct => ct.code === code);
          if (tenantCT) return tenantCT.name;
        }
        // Then check terminology overrides
        if (merged.callTypeLabels[code]) return merged.callTypeLabels[code];
        // Fallback
        return code.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
      },

      // Helper: get display name for an outcome code
      outcome: (code: string | null | undefined): string => {
        if (!code) return "Unknown";
        if (merged.outcomeLabels[code]) return merged.outcomeLabels[code];
        return code.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
      },

      // Helper: get display name for a KPI code
      kpi: (code: string | null | undefined): string => {
        if (!code) return "Unknown";
        if (merged.kpiLabels[code]) return merged.kpiLabels[code];
        return code.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
      },
    };
  }, [terminology, playbook]);

  // Get tenant roles list (for dropdowns, filters, etc.)
  const roles = useMemo(() => {
    if (playbook?.roles && playbook.roles.length > 0) {
      return playbook.roles.map(r => ({
        code: r.code,
        name: r.name,
        description: r.description,
      }));
    }
    // Fallback to default wholesaling roles
    return [
      { code: "lead_generator", name: t.role("lead_generator"), description: "Makes cold calls to generate leads" },
      { code: "lead_manager", name: t.role("lead_manager"), description: "Qualifies leads and sets appointments" },
      { code: "acquisition_manager", name: t.role("acquisition_manager"), description: "Closes deals and makes offers" },
      { code: "dispo_manager", name: t.role("dispo_manager"), description: "Manages properties, showings & buyer offers" },
    ];
  }, [playbook, t]);

  // Get tenant call types list
  const callTypes = useMemo(() => {
    if (playbook?.callTypes && playbook.callTypes.length > 0) {
      return playbook.callTypes.map(ct => ({
        code: ct.code,
        name: ct.name,
        description: ct.description,
      }));
    }
    // Fallback to default wholesaling call types
    return [
      { code: "cold_call", name: t.callType("cold_call"), description: null },
      { code: "qualification", name: t.callType("qualification"), description: null },
      { code: "offer", name: t.callType("offer"), description: null },
      { code: "follow_up", name: t.callType("follow_up"), description: null },
      { code: "seller_callback", name: t.callType("seller_callback"), description: null },
      { code: "admin_callback", name: t.callType("admin_callback"), description: null },
    ];
  }, [playbook, t]);

  return {
    t,
    roles,
    callTypes,
    isLoading,
    playbook,
  };
}
