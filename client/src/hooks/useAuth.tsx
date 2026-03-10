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

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
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
    if (meQuery.data) {
      setUser({
        id: meQuery.data.id,
        name: meQuery.data.name,
        email: meQuery.data.email,
        role: meQuery.data.role,
        tenantId: meQuery.data.tenantId,
      });
    } else {
      setUser(null);
    }
    setIsLoading(false);
  }, [meQuery.isLoading, meQuery.data]);

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

  const value: AuthContextValue = {
    user,
    isAuthenticated: !!user,
    isLoading,
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
