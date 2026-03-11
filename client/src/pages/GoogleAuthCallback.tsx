import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

export function GoogleAuthCallback() {
  const [, setLocation] = useLocation();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const called = useRef(false);

  const callbackMutation = trpc.auth.googleCallback.useMutation({
    onSuccess: (data) => {
      // #region agent log
      console.error('[DEBUG-dfb296] googleCallback OK', JSON.stringify({isNewUser:data.isNewUser,userId:data.user.id,tenantId:data.user.tenantId,redirectTo:data.isNewUser?'/onboarding':'/today'}));
      // #endregion
      window.location.href = data.isNewUser ? "/onboarding" : "/today";
    },
    onError: (err) => {
      // #region agent log
      console.error('[DEBUG-dfb296] googleCallback FAILED', JSON.stringify({error:err.message,code:err.data?.code}));
      // #endregion
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
