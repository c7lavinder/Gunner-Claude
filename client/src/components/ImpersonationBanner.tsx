import { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { UserCheck, LogOut, Eye } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

// Admin impersonation data (viewing as another team member within same tenant)
interface AdminImpersonationData {
  userId: string;
  userName: string;
}

type ImpersonationType = 'super_admin' | 'admin' | null;

// Utility to clear all impersonation data from localStorage
function clearAllImpersonationData() {
  try {
    localStorage.removeItem('impersonateUserId');
    localStorage.removeItem('impersonateUserName');
    localStorage.removeItem('gunner_impersonation');
  } catch {
    // Ignore errors
  }
}

export function ImpersonationBanner() {
  const { user } = useAuth();
  const [adminData, setAdminData] = useState<AdminImpersonationData | null>(null);

  // Backend mutation to clear the session cookie when ending super_admin impersonation
  const stopImpersonationMutation = trpc.admin.stopImpersonation.useMutation({
    onSuccess: () => {
      clearAllImpersonationData();
      window.location.href = '/admin-dashboard';
    },
    onError: () => {
      // Even if backend fails, clear localStorage and redirect
      clearAllImpersonationData();
      window.location.href = '/admin-dashboard';
    },
  });

  // Check for admin impersonation (team member viewing) via localStorage
  useEffect(() => {
    const checkAdminImpersonation = () => {
      try {
        const userId = localStorage.getItem('impersonateUserId');
        const userName = localStorage.getItem('impersonateUserName');
        if (userId) {
          setAdminData({ userId, userName: userName || 'User' });
        } else {
          setAdminData(null);
        }
      } catch {
        setAdminData(null);
      }
    };

    checkAdminImpersonation();
    window.addEventListener('storage', checkAdminImpersonation);
    const interval = setInterval(checkAdminImpersonation, 1000);

    return () => {
      window.removeEventListener('storage', checkAdminImpersonation);
      clearInterval(interval);
    };
  }, []);

  // Determine impersonation type from auth data (super_admin) or localStorage (admin)
  const isSuperAdminImpersonating = (user as any)?._isImpersonating === true;
  const impersonatedTenantName = (user as any)?._impersonatedTenantName;
  const impersonationType: ImpersonationType = isSuperAdminImpersonating
    ? 'super_admin'
    : adminData
    ? 'admin'
    : null;

  const handleEndImpersonation = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (impersonationType === 'super_admin') {
      // Call backend to clear session cookie, then redirect
      stopImpersonationMutation.mutate();
    } else {
      // Always clear all impersonation data regardless of type
      clearAllImpersonationData();
      // Force a hard page reload — this is the most reliable way to reset all React state
      // We clear localStorage first, then reload. The reload will re-initialize the app
      // without impersonation data in localStorage.
      window.location.href = '/settings';
      // Fallback: if href assignment doesn't trigger a full reload (same URL), force it
      setTimeout(() => {
        window.location.reload();
      }, 100);
    }
  }, [impersonationType, stopImpersonationMutation]);

  if (!impersonationType) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-[200] bg-amber-500 text-amber-950 shadow-lg" style={{ pointerEvents: 'auto' }}>
      <div className="container flex items-center justify-between py-2 px-4">
        <div className="flex items-center gap-3">
          {impersonationType === 'super_admin' ? (
            <UserCheck className="h-5 w-5" />
          ) : (
            <Eye className="h-5 w-5" />
          )}
          <div className="flex items-center gap-2">
            <span className="font-semibold">Viewing as:</span>
            {impersonationType === 'super_admin' && (
              <>
                <span>{impersonatedTenantName || 'Another Tenant'}</span>
                <span className="text-amber-800">•</span>
                <span className="text-sm">{user?.name}</span>
              </>
            )}
            {impersonationType === 'admin' && adminData && (
              <span>{adminData.userName}</span>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleEndImpersonation}
          disabled={stopImpersonationMutation.isPending}
          className="text-amber-950 hover:bg-amber-600 hover:text-amber-950"
          style={{ pointerEvents: 'auto', position: 'relative', zIndex: 201 }}
        >
          <LogOut className="h-4 w-4 mr-2" />
          {stopImpersonationMutation.isPending ? 'Ending...' : 'Stop Viewing'}
        </Button>
      </div>
    </div>
  );
}

// Hook to check if currently impersonating — reads from auth.me for super_admin, localStorage for admin
export function useImpersonation() {
  const { user } = useAuth();
  const [adminImpersonationData, setAdminImpersonationData] = useState<AdminImpersonationData | null>(null);

  // Check for admin impersonation via localStorage
  useEffect(() => {
    const checkAdminImpersonation = () => {
      try {
        const userId = localStorage.getItem('impersonateUserId');
        const userName = localStorage.getItem('impersonateUserName');
        if (userId) {
          setAdminImpersonationData({ userId, userName: userName || 'User' });
        } else {
          setAdminImpersonationData(null);
        }
      } catch {
        setAdminImpersonationData(null);
      }
    };

    checkAdminImpersonation();
    window.addEventListener('storage', checkAdminImpersonation);
    const interval = setInterval(checkAdminImpersonation, 1000);

    return () => {
      window.removeEventListener('storage', checkAdminImpersonation);
      clearInterval(interval);
    };
  }, []);

  // Derive impersonation state from auth.me response
  const isSuperAdminImpersonating = (user as any)?._isImpersonating === true;
  const impersonatedTenantName = (user as any)?._impersonatedTenantName || null;

  const isImpersonating = isSuperAdminImpersonating || !!adminImpersonationData;
  const impersonationType: ImpersonationType = isSuperAdminImpersonating
    ? 'super_admin'
    : adminImpersonationData
    ? 'admin'
    : null;

  return useMemo(() => ({
    isImpersonating,
    impersonationType,
    impersonatedTenantName,
    adminImpersonationData,
  }), [isImpersonating, impersonationType, impersonatedTenantName, adminImpersonationData]);
}
