import { useState, useEffect } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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

const plans = [
  {
    id: 'starter',
    name: "Starter",
    price: 99,
    description: "Up to 3 team members, 500 calls/month"
  },
  {
    id: 'growth',
    name: "Growth",
    price: 249,
    description: "Up to 10 team members, 2,000 calls/month",
    popular: true
  },
  {
    id: 'scale',
    name: "Scale",
    price: 499,
    description: "Unlimited team members and calls"
  }
];

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
  const preselectedPlan = searchParams.get('plan') || 'growth';
  const googleDataParam = searchParams.get('google');
  
  // Check if user is already logged in
  const { user, loading: authLoading } = useAuth();
  const { data: tenantSettings } = trpc.tenant.getSettings.useQuery(undefined, {
    enabled: !!user,
  });
  
  // Redirect logged-in users to appropriate page
  useEffect(() => {
    if (!authLoading && user) {
      // User is already logged in, redirect them
      if (tenantSettings?.onboardingCompleted === 'true') {
        setLocation('/dashboard');
      } else {
        setLocation('/onboarding');
      }
    }
  }, [user, authLoading, tenantSettings, setLocation]);

  const [step, setStep] = useState(1);
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
  const [selectedPlan, setSelectedPlan] = useState(preselectedPlan);

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
        // Skip to company info step for Google users
        setStep(1);
        // Clear the URL params
        window.history.replaceState({}, '', '/signup');
        toast.success("Google account connected! Please complete your registration.");
      } catch (e) {
        console.error('Failed to parse Google data:', e);
      }
    }
  }, [googleDataParam]);

  const validateStep1 = () => {
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
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleStep1Submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateStep1()) {
      setStep(2);
    }
  };

  const handleGoogleSignUp = async () => {
    setGoogleLoading(true);
    
    try {
      // Get the Google OAuth URL from our backend
      const response = await fetch('/api/auth/google/url');
      const data = await response.json();
      
      if (data.url) {
        // Redirect to Google OAuth
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

  const handleSignup = async () => {
    setLoading(true);
    
    try {
      // Different endpoint for Google vs email signup
      if (googleUser) {
        const response = await fetch('/api/auth/google/complete-signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            googleId: googleUser.googleId,
            email: googleUser.email,
            name,
            picture: googleUser.picture,
            companyName,
            planId: selectedPlan,
          }),
        });

        const data = await response.json();

        if (data.success) {
          localStorage.setItem('authToken', data.token);
          
          if (data.checkoutUrl) {
            toast.success("Account created! Redirecting to payment...");
            window.open(data.checkoutUrl, '_blank');
            setTimeout(() => {
              setLocation('/onboarding');
            }, 1000);
          } else {
            toast.success("Account created! Let's set up your workspace.");
            setLocation('/onboarding');
          }
        } else {
          toast.error(data.error || "Failed to create account");
        }
      } else {
        // Regular email signup
        const response = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            password,
            name,
            companyName,
            planId: selectedPlan,
          }),
        });

        const data = await response.json();

        if (data.success) {
          localStorage.setItem('authToken', data.token);
          
          if (data.checkoutUrl) {
            toast.success("Account created! Redirecting to payment...");
            window.open(data.checkoutUrl, '_blank');
            setTimeout(() => {
              setLocation('/onboarding');
            }, 1000);
          } else {
            toast.success("Account created! Let's set up your workspace.");
            setLocation('/onboarding');
          }
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
        <div className="w-full max-w-lg">
          {/* Progress Steps */}
          <div className="flex items-center justify-center gap-4 mb-8">
            <div className={`flex items-center gap-2 ${step >= 1 ? 'text-primary' : 'text-muted-foreground'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step >= 1 ? 'bg-primary text-primary-foreground' : 'bg-muted'
              }`}>
                {step > 1 ? <Check className="h-4 w-4" /> : '1'}
              </div>
              <span className="text-sm font-medium hidden sm:inline">Account</span>
            </div>
            <div className="w-12 h-px bg-border" />
            <div className={`flex items-center gap-2 ${step >= 2 ? 'text-primary' : 'text-muted-foreground'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step >= 2 ? 'bg-primary text-primary-foreground' : 'bg-muted'
              }`}>
                {step > 2 ? <Check className="h-4 w-4" /> : '2'}
              </div>
              <span className="text-sm font-medium hidden sm:inline">Plan</span>
            </div>
            <div className="w-12 h-px bg-border" />
            <div className={`flex items-center gap-2 ${step >= 3 ? 'text-primary' : 'text-muted-foreground'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step >= 3 ? 'bg-primary text-primary-foreground' : 'bg-muted'
              }`}>
                3
              </div>
              <span className="text-sm font-medium hidden sm:inline">Payment</span>
            </div>
          </div>

          {/* Step 1: Account Details */}
          {step === 1 && (
            <Card>
              <CardHeader className="text-center">
                <CardTitle className="text-2xl">Create your account</CardTitle>
                <CardDescription>
                  Start your 14-day free trial. No credit card required yet.
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
                      <span className="text-sm">Google connected</span>
                    </div>
                  </div>
                )}

                <form onSubmit={handleStep1Submit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Your Name</Label>
                    <Input
                      id="name"
                      placeholder="John Smith"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={loading}
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
                  
                  <Button type="submit" className="w-full" disabled={loading || googleLoading}>
                    Continue
                  </Button>
                </form>
                
                <div className="text-center text-sm text-muted-foreground">
                  Already have an account?{" "}
                  <Link href="/login" className="text-primary hover:underline">
                    Sign in
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Plan Selection */}
          {step === 2 && (
            <Card>
              <CardHeader className="text-center">
                <CardTitle className="text-2xl">Choose your plan</CardTitle>
                <CardDescription>
                  All plans include a 14-day free trial. You can change plans anytime.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RadioGroup value={selectedPlan} onValueChange={setSelectedPlan} className="space-y-4">
                  {plans.map((plan) => (
                    <div key={plan.id}>
                      <RadioGroupItem
                        value={plan.id}
                        id={plan.id}
                        className="peer sr-only"
                      />
                      <Label
                        htmlFor={plan.id}
                        className={`flex items-center justify-between p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                          selectedPlan === plan.id 
                            ? 'border-primary bg-primary/5' 
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{plan.name}</span>
                            {plan.popular && (
                              <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded">
                                Popular
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{plan.description}</p>
                        </div>
                        <div className="text-right">
                          <span className="text-2xl font-bold">${plan.price}</span>
                          <span className="text-muted-foreground">/mo</span>
                        </div>
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
                
                <div className="flex gap-4 mt-6">
                  <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                    Back
                  </Button>
                  <Button onClick={handleSignup} disabled={loading} className="flex-1">
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating account...
                      </>
                    ) : (
                      'Start Free Trial'
                    )}
                  </Button>
                </div>
                
                <p className="text-center text-sm text-muted-foreground mt-4">
                  You'll be asked for payment details after your trial ends.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
