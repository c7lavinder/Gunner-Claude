import { useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

export function GoogleAuthCallback() {
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");

  const callbackMutation = trpc.auth.googleCallback.useMutation({
    onSuccess: () => setLocation("/today"),
    onError: () => setLocation("/login"),
  });

  useEffect(() => {
    if (!code) {
      setLocation("/login");
      return;
    }
    const redirectUri = `${window.location.origin}/auth/google/callback`;
    callbackMutation.mutate({ code, redirectUri });
  }, [code]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#08080c]">
      <p className="text-[#f0f0f5]">Signing you in...</p>
    </div>
  );
}
