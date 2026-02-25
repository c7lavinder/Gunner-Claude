import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Mail, Loader2, CheckCircle } from "lucide-react";
import { toast } from "sonner";

export default function VerificationPending() {
  const [, setLocation] = useLocation();
  const [isResending, setIsResending] = useState(false);
  const [resent, setResent] = useState(false);


  const handleResend = async () => {
    setIsResending(true);
    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        credentials: "include",
      });
      const data = await response.json();

      if (data.success) {
        setResent(true);
        toast.success("A new verification email has been sent to your inbox.");
      } else {
        toast.error(data.error || "Failed to resend verification email");
      }
    } catch (error) {
      toast.error("An error occurred. Please try again.");
    } finally {
      setIsResending(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      setLocation("/login");
    } catch (error) {
      setLocation("/login");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="obs-panel w-full max-w-md">
        <div className="text-center" style={{marginBottom: 16}}>
          <div className="mx-auto mb-4">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Mail className="h-8 w-8 text-primary" />
            </div>
          </div>
          <h3 className="obs-section-title text-2xl">Verify Your Email</h3>
          <p className="text-base" style={{fontSize: 13, color: "var(--obs-text-tertiary)", marginTop: 4}}>
            We've sent a verification email to your inbox. Please click the link in the email to verify your account.
          </p>
        </div>
        <div className="flex flex-col gap-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
            <p className="font-medium mb-1">Check your inbox</p>
            <p>The verification link expires in 24 hours. If you don't see the email, check your spam folder.</p>
          </div>

          <Button 
            onClick={handleResend} 
            disabled={isResending || resent}
            variant="outline"
            className="w-full"
          >
            {isResending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : resent ? (
              <>
                <CheckCircle className="mr-2 h-4 w-4 text-green-500" />
                Email Sent!
              </>
            ) : (
              <>
                <Mail className="mr-2 h-4 w-4" />
                Resend Verification Email
              </>
            )}
          </Button>

          <div className="text-center text-sm text-muted-foreground">
            <button 
              onClick={handleLogout}
              className="text-primary hover:underline"
            >
              Sign in with a different account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
