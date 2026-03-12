import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/useAuth";

export function GoogleAuthCallback() {
  const [, setLocation] = useLocation();
  const { setAuthenticatedUser } = useAuth();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const called = useRef(false);

  const callbackMutation = trpc.auth.googleCallback.useMutation({
    onSuccess: (data) => {
      setAuthenticatedUser(
        {
          id: data.user.id,
          name: data.user.name,
          email: data.user.email,
          role: data.user.role,
          tenantId: data.user.tenantId ?? null,
          profilePicture: data.user.profilePicture ?? null,
        },
        data.token,
      );
      // Short delay so the httpOnly auth_token cookie is fully written before
      // useAuth fires its /me query on the next page, preventing a loop where
      // the cookie isn't available yet and the user gets bounced back to login.
      setTimeout(() => {
        setLocation(data.isNewUser ? "/onboarding" : "/today");
      }, 350);
    },
    onError: (err) => {
      setErrorMsg(err.message || "Google sign-in failed. Please try again.");
    },
  });

  useEffect(() => {
    if (called.current) return;
    if (!code) {
      setLocation("/login");
      return;
    }
    called.current = true;
    const redirectUri = `${window.location.origin}/auth/google/callback`;
    callbackMutation.mutate({ code, redirectUri });
  }, [code]);

  if (errorMsg) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#08080c] px-4">
        <p className="text-red-400 text-center max-w-md text-sm font-mono bg-red-950/30 border border-red-800 rounded-lg px-4 py-3">
          {errorMsg}
        </p>
        <button
          onClick={() => setLocation("/login")}
          className="text-[#f0f0f5] underline text-sm hover:text-white"
        >
          Back to login
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#08080c]">
      <p className="text-[#f0f0f5]">Signing you in...</p>
    </div>
  );
}
