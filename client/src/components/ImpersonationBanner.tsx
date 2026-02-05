import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { UserCheck, LogOut, Eye } from "lucide-react";

// Super admin impersonation data (viewing as another tenant)
interface SuperAdminImpersonationData {
  originalUserId: number;
  originalTenantId: number;
  targetUserId: number;
  targetTenantId: number;
  targetTenantName: string;
  targetUserName: string;
  targetUserEmail: string;
}

// Admin impersonation data (viewing as another team member within same tenant)
interface AdminImpersonationData {
  userId: string;
  userName: string;
}

type ImpersonationType = 'super_admin' | 'admin' | null;

export function ImpersonationBanner() {
  const [impersonationType, setImpersonationType] = useState<ImpersonationType>(null);
  const [superAdminData, setSuperAdminData] = useState<SuperAdminImpersonationData | null>(null);
  const [adminData, setAdminData] = useState<AdminImpersonationData | null>(null);

  useEffect(() => {
    // Check localStorage for impersonation data
    const checkImpersonation = () => {
      try {
        // Check for super admin impersonation first
        const superAdminRaw = localStorage.getItem('gunner_impersonation');
        if (superAdminRaw) {
          setSuperAdminData(JSON.parse(superAdminRaw));
          setImpersonationType('super_admin');
          setAdminData(null);
          return;
        }

        // Check for admin impersonation (viewing as team member)
        const userId = localStorage.getItem('impersonateUserId');
        const userName = localStorage.getItem('impersonateUserName');
        if (userId) {
          setAdminData({ userId, userName: userName || 'User' });
          setImpersonationType('admin');
          setSuperAdminData(null);
          return;
        }

        // No impersonation active
        setImpersonationType(null);
        setSuperAdminData(null);
        setAdminData(null);
      } catch {
        setImpersonationType(null);
        setSuperAdminData(null);
        setAdminData(null);
      }
    };

    // Check on mount
    checkImpersonation();

    // Listen for storage changes (in case impersonation starts/ends in another tab)
    window.addEventListener('storage', checkImpersonation);
    
    // Also check periodically in case localStorage changes in same tab
    const interval = setInterval(checkImpersonation, 1000);

    return () => {
      window.removeEventListener('storage', checkImpersonation);
      clearInterval(interval);
    };
  }, []);

  const handleEndImpersonation = () => {
    if (impersonationType === 'super_admin') {
      localStorage.removeItem('gunner_impersonation');
      window.location.href = '/admin-dashboard';
    } else if (impersonationType === 'admin') {
      localStorage.removeItem('impersonateUserId');
      localStorage.removeItem('impersonateUserName');
      window.location.href = '/settings';
    }
  };

  if (!impersonationType) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-amber-950 shadow-lg">
      <div className="container flex items-center justify-between py-2 px-4">
        <div className="flex items-center gap-3">
          {impersonationType === 'super_admin' ? (
            <UserCheck className="h-5 w-5" />
          ) : (
            <Eye className="h-5 w-5" />
          )}
          <div className="flex items-center gap-2">
            <span className="font-semibold">Viewing as:</span>
            {impersonationType === 'super_admin' && superAdminData && (
              <>
                <span>{superAdminData.targetTenantName}</span>
                <span className="text-amber-800">•</span>
                <span className="text-sm">{superAdminData.targetUserName}</span>
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
          className="text-amber-950 hover:bg-amber-600 hover:text-amber-950"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Stop Viewing
        </Button>
      </div>
    </div>
  );
}

// Hook to check if currently impersonating
export function useImpersonation() {
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [impersonationType, setImpersonationType] = useState<ImpersonationType>(null);
  const [impersonationData, setImpersonationData] = useState<SuperAdminImpersonationData | null>(null);
  const [adminImpersonationData, setAdminImpersonationData] = useState<AdminImpersonationData | null>(null);

  useEffect(() => {
    const checkImpersonation = () => {
      try {
        // Check for super admin impersonation first
        const superAdminRaw = localStorage.getItem('gunner_impersonation');
        if (superAdminRaw) {
          setImpersonationData(JSON.parse(superAdminRaw));
          setImpersonationType('super_admin');
          setIsImpersonating(true);
          setAdminImpersonationData(null);
          return;
        }

        // Check for admin impersonation
        const userId = localStorage.getItem('impersonateUserId');
        const userName = localStorage.getItem('impersonateUserName');
        if (userId) {
          setAdminImpersonationData({ userId, userName: userName || 'User' });
          setImpersonationType('admin');
          setIsImpersonating(true);
          setImpersonationData(null);
          return;
        }

        // No impersonation
        setImpersonationData(null);
        setAdminImpersonationData(null);
        setImpersonationType(null);
        setIsImpersonating(false);
      } catch {
        setImpersonationData(null);
        setAdminImpersonationData(null);
        setImpersonationType(null);
        setIsImpersonating(false);
      }
    };

    checkImpersonation();
    window.addEventListener('storage', checkImpersonation);
    const interval = setInterval(checkImpersonation, 1000);

    return () => {
      window.removeEventListener('storage', checkImpersonation);
      clearInterval(interval);
    };
  }, []);

  return { isImpersonating, impersonationType, impersonationData, adminImpersonationData };
}
