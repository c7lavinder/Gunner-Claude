import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

export interface AuthUser {
  id: number;
  name: string | null;
  email: string | null;
  role: string;
  tenantId: number | null;
}

const ROLE_LEVEL: Record<string, number> = {
  user: 0,
  member: 0,
  manager: 1,
  admin: 2,
  super_admin: 2,
};

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isAdmin: boolean;
  isManager: boolean;
  isMember: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string, companyName: string) => Promise<void>;
  loginWithGoogle: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (meQuery.isLoading) return;
    // #region agent log
    console.error('[DEBUG-dfb296] auth.me resolved', JSON.stringify({hasData:!!meQuery.data,errorCode:meQuery.error?.data?.code,errorMsg:meQuery.error?.message,path:window.location.pathname}));
    // #endregion
    if (meQuery.data) {
      setUser({
        id: meQuery.data.id,
        name: meQuery.data.name,
        email: meQuery.data.email,
        role: meQuery.data.role,
        tenantId: meQuery.data.tenantId,
      });
      setIsLoading(false);
    } else if (!meQuery.error || meQuery.error.data?.code === "UNAUTHORIZED") {
      // Only clear the user for UNAUTHORIZED errors (not logged in).
      // Transient errors (network, 500s) keep the current auth state to avoid
      // bouncing authenticated users back to the login screen.
      setUser(null);
      setIsLoading(false);
    } else {
      // Non-auth server/network error — stop the loading spinner but keep
      // current user state so an authenticated user isn't logged out.
      setIsLoading(false);
    }
  }, [meQuery.isLoading, meQuery.data, meQuery.error]);

  const loginMutation = trpc.auth.login.useMutation();
  const signupMutation = trpc.auth.signup.useMutation();
  const logoutMutation = trpc.auth.logout.useMutation();
  const googleAuthUrlQuery = trpc.auth.googleAuthUrl.useQuery(
    { redirectUri: `${window.location.origin}/auth/google/callback` },
    { enabled: false }
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await loginMutation.mutateAsync({ email, password });
      setUser({
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        role: result.user.role,
        tenantId: result.user.tenantId ?? null,
      });
      setLocation("/today");
    },
    [loginMutation, setLocation]
  );

  const signup = useCallback(
    async (name: string, email: string, password: string, companyName: string) => {
      const result = await signupMutation.mutateAsync({
        name,
        email,
        password,
        companyName,
      });
      setUser({
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        role: result.user.role,
        tenantId: result.user.tenantId ?? null,
      });
      setLocation("/today");
    },
    [signupMutation, setLocation]
  );

  const loginWithGoogle = useCallback(() => {
    googleAuthUrlQuery.refetch().then((res) => {
      if (res.data) window.location.href = res.data;
    });
  }, [googleAuthUrlQuery]);

  const logout = useCallback(async () => {
    await logoutMutation.mutateAsync();
    setUser(null);
    setLocation("/login");
  }, [logoutMutation, setLocation]);

  const roleLevel = ROLE_LEVEL[user?.role ?? ""] ?? 0;

  const value: AuthContextValue = {
    user,
    isAuthenticated: !!user,
    isLoading,
    isAdmin: roleLevel >= 2,
    isManager: roleLevel >= 1,
    isMember: roleLevel >= 0,
    login,
    signup,
    loginWithGoogle,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
