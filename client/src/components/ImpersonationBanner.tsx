import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { UserCheck, LogOut, X } from "lucide-react";

interface ImpersonationData {
  originalUserId: number;
  originalTenantId: number;
  targetUserId: number;
  targetTenantId: number;
  targetTenantName: string;
  targetUserName: string;
  targetUserEmail: string;
}

export function ImpersonationBanner() {
  const [impersonationData, setImpersonationData] = useState<ImpersonationData | null>(null);

  useEffect(() => {
    // Check localStorage for impersonation data
    const checkImpersonation = () => {
      try {
        const data = localStorage.getItem('gunner_impersonation');
        if (data) {
          setImpersonationData(JSON.parse(data));
        } else {
          setImpersonationData(null);
        }
      } catch {
        setImpersonationData(null);
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
    localStorage.removeItem('gunner_impersonation');
    setImpersonationData(null);
    // Reload to reset the app state
    window.location.href = '/admin-dashboard';
  };

  if (!impersonationData) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-amber-950 shadow-lg">
      <div className="container flex items-center justify-between py-2 px-4">
        <div className="flex items-center gap-3">
          <UserCheck className="h-5 w-5" />
          <div className="flex items-center gap-2">
            <span className="font-semibold">Viewing as:</span>
            <span>{impersonationData.targetTenantName}</span>
            <span className="text-amber-800">•</span>
            <span className="text-sm">{impersonationData.targetUserName}</span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleEndImpersonation}
          className="text-amber-950 hover:bg-amber-600 hover:text-amber-950"
        >
          <LogOut className="h-4 w-4 mr-2" />
          End Impersonation
        </Button>
      </div>
    </div>
  );
}

// Hook to check if currently impersonating
export function useImpersonation() {
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [impersonationData, setImpersonationData] = useState<ImpersonationData | null>(null);

  useEffect(() => {
    const checkImpersonation = () => {
      try {
        const data = localStorage.getItem('gunner_impersonation');
        if (data) {
          setImpersonationData(JSON.parse(data));
          setIsImpersonating(true);
        } else {
          setImpersonationData(null);
          setIsImpersonating(false);
        }
      } catch {
        setImpersonationData(null);
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

  return { isImpersonating, impersonationData };
}
