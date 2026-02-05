import { useState, useEffect } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, ArrowLeft, Check } from "lucide-react";
import { toast } from "sonner";

// Google icon component
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

interface GoogleUserData {
  googleId: string;
  email: string;
  name: string;
  picture?: string;
}

export default function Signup() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const googleDataParam = searchParams.get('google');
  
  // Check if user is already logged in
  const { user, loading: authLoading } = useAuth();
  const { data: tenantSettings } = trpc.tenant.getSettings.useQuery(undefined, {
    enabled: !!user,
  });
  
  // Redirect logged-in users to appropriate page
  useEffect(() => {
    if (!authLoading && user) {
      if (tenantSettings?.onboardingCompleted === 'true') {
        setLocation('/dashboard');
      } else {
        setLocation('/onboarding');
      }
    }
  }, [user, authLoading, tenantSettings, setLocation]);

  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  
  // Google user data (if coming from Google OAuth)
  const [googleUser, setGoogleUser] = useState<GoogleUserData | null>(null);
  
  // Form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  // Validation
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Check for Google user data in URL params
  useEffect(() => {
    if (googleDataParam) {
      try {
        const googleData = JSON.parse(decodeURIComponent(googleDataParam)) as GoogleUserData;
        setGoogleUser(googleData);
        setEmail(googleData.email);
        setName(googleData.name);
        window.history.replaceState({}, '', '/signup');
        toast.success("Google account connected! Please complete your registration.");
      } catch (e) {
        console.error('Failed to parse Google data:', e);
      }
    }
  }, [googleDataParam]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (!email) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = "Please enter a valid email";
    }
    
    // Only validate password for non-Google users
    if (!googleUser) {
      if (!password) {
        newErrors.password = "Password is required";
      } else if (password.length < 8) {
        newErrors.password = "Password must be at least 8 characters";
      }
      
      if (password !== confirmPassword) {
        newErrors.confirmPassword = "Passwords do not match";
      }
    }
    
    if (!name) {
      newErrors.name = "Name is required";
    }
    
    if (!companyName) {
      newErrors.companyName = "Company name is required";
    }
    
    if (!agreedToTerms) {
      newErrors.terms = "You must agree to the Terms of Service and Privacy Policy";
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleGoogleSignUp = async () => {
    setGoogleLoading(true);
    
    try {
      const response = await fetch('/api/auth/google/url');
      const data = await response.json();
      
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error("Failed to initialize Google sign-up");
        setGoogleLoading(false);
      }
    } catch (error) {
      toast.error("Failed to connect to Google. Please try again.");
      setGoogleLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setLoading(true);
    
    try {
      if (googleUser) {
        // Google signup - no plan selection, go straight to onboarding
        const response = await fetch('/api/auth/google/complete-signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            googleId: googleUser.googleId,
            email: googleUser.email,
            name,
            picture: googleUser.picture,
            companyName,
          }),
        });

        const data = await response.json();

        if (data.success) {
          localStorage.setItem('authToken', data.token);
          toast.success("Account created! Let's set up your workspace.");
          setLocation('/onboarding');
        } else {
          toast.error(data.error || "Failed to create account");
        }
      } else {
        // Email signup - no plan selection, go straight to onboarding
        const response = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            password,
            name,
            companyName,
          }),
        });

        const data = await response.json();

        if (data.success) {
          localStorage.setItem('authToken', data.token);
          toast.success("Account created! Let's set up your workspace.");
          setLocation('/onboarding');
        } else {
          toast.error(data.error || "Failed to create account");
        }
      }
    } catch (error) {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      {/* Header */}
      <nav className="border-b bg-background">
        <div className="container flex h-16 items-center">
          <Link href="/">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
        </div>
      </nav>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Create your account</CardTitle>
              <CardDescription>
                Get started with your 3-day free trial
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Google Sign-Up Button (only show if not already using Google) */}
              {!googleUser && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full gap-3 h-11"
                    onClick={handleGoogleSignUp}
                    disabled={googleLoading || loading}
                  >
                    {googleLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <GoogleIcon className="h-5 w-5" />
                    )}
                    Continue with Google
                  </Button>

                  {/* Divider */}
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground">
                        Or continue with email
                      </span>
                    </div>
                  </div>
                </>
              )}

              {/* Google User Badge */}
              {googleUser && (
                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                  {googleUser.picture && (
                    <img 
                      src={googleUser.picture} 
                      alt={googleUser.name} 
                      className="w-10 h-10 rounded-full"
                    />
                  )}
                  <div className="flex-1">
                    <p className="font-medium">{googleUser.name}</p>
                    <p className="text-sm text-muted-foreground">{googleUser.email}</p>
                  </div>
                  <div className="flex items-center gap-1 text-green-600">
                    <Check className="h-4 w-4" />
                    <span className="text-sm">Connected</span>
                  </div>
                </div>
              )}

              <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Your Name</Label>
                  <Input
                    id="name"
                    placeholder="John Smith"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={loading || !!googleUser}
                  />
                  {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="companyName">Company Name</Label>
                  <Input
                    id="companyName"
                    placeholder="Acme Real Estate"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    disabled={loading}
                  />
                  {errors.companyName && <p className="text-sm text-destructive">{errors.companyName}</p>}
                </div>
                
                {/* Only show email/password fields for non-Google users */}
                {!googleUser && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="john@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={loading}
                      />
                      {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <Input
                        id="password"
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={loading}
                      />
                      {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword">Confirm Password</Label>
                      <Input
                        id="confirmPassword"
                        type="password"
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        disabled={loading}
                      />
                      {errors.confirmPassword && <p className="text-sm text-destructive">{errors.confirmPassword}</p>}
                    </div>
                  </>
                )}

                <div className="flex items-start gap-2">
                  <Checkbox
                    id="terms"
                    checked={agreedToTerms}
                    onCheckedChange={(checked) => setAgreedToTerms(checked === true)}
                    disabled={loading}
                  />
                  <Label htmlFor="terms" className="text-sm leading-tight cursor-pointer">
                    I agree to the{" "}
                    <Link href="/terms" className="text-primary hover:underline">
                      Terms of Service
                    </Link>{" "}
                    and{" "}
                    <Link href="/privacy" className="text-primary hover:underline">
                      Privacy Policy
                    </Link>
                  </Label>
                </div>
                {errors.terms && <p className="text-sm text-destructive">{errors.terms}</p>}

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating account...
                    </>
                  ) : (
                    "Create Account"
                  )}
                </Button>
              </form>

              <p className="text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link href="/login" className="text-primary hover:underline">
                  Sign in
                </Link>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
