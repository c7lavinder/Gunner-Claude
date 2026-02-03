import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Phone, BarChart3, Trophy, Brain, Users, Zap, ArrowRight, Star } from "lucide-react";

const features = [
  {
    icon: Brain,
    title: "AI-Powered Call Grading",
    description: "Every call automatically transcribed and graded against proven sales methodologies. Get instant feedback on what worked and what didn't."
  },
  {
    icon: BarChart3,
    title: "Performance Analytics",
    description: "Track team performance with detailed analytics. See trends, identify coaching opportunities, and measure improvement over time."
  },
  {
    icon: Trophy,
    title: "Gamification & Leaderboards",
    description: "Keep your team motivated with XP, badges, streaks, and leaderboards. Turn improvement into a game everyone wants to win."
  },
  {
    icon: Users,
    title: "Team Management",
    description: "Organize your team by role, track individual performance, and provide targeted coaching based on AI insights."
  },
  {
    icon: Phone,
    title: "CRM Integration",
    description: "Connect to GoHighLevel and automatically sync calls. No manual uploads needed - calls flow in and get graded automatically."
  },
  {
    icon: Zap,
    title: "Instant Coaching Tips",
    description: "AI-generated coaching suggestions for every call. Help your team improve with actionable, specific feedback."
  }
];

const plans = [
  {
    name: "Starter",
    price: 99,
    description: "Perfect for small teams getting started",
    features: [
      "Up to 3 team members",
      "500 calls/month",
      "AI call grading",
      "Basic analytics",
      "GoHighLevel integration",
      "Email support"
    ],
    popular: false
  },
  {
    name: "Growth",
    price: 249,
    description: "For growing teams that need more",
    features: [
      "Up to 10 team members",
      "2,000 calls/month",
      "AI call grading",
      "Advanced analytics",
      "Gamification & badges",
      "Team leaderboards",
      "Priority support"
    ],
    popular: true
  },
  {
    name: "Scale",
    price: 499,
    description: "For large teams with high volume",
    features: [
      "Unlimited team members",
      "Unlimited calls",
      "AI call grading",
      "Advanced analytics",
      "Gamification & badges",
      "Team leaderboards",
      "Custom integrations",
      "Dedicated support"
    ],
    popular: false
  }
];

const testimonials = [
  {
    quote: "Gunner transformed how we coach our sales team. We went from guessing to knowing exactly where each rep needs help.",
    author: "Sales Director",
    company: "Real Estate Investment Firm"
  },
  {
    quote: "The gamification keeps our team engaged. They actually look forward to seeing their scores and competing on the leaderboard.",
    author: "Team Lead",
    company: "Property Acquisitions Company"
  }
];

export default function Landing() {
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-lg">G</span>
            </div>
            <span className="font-bold text-xl">Gunner</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login">
              <Button variant="ghost">Sign In</Button>
            </Link>
            <Link href="/signup">
              <Button>Start Free Trial</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="py-20 md:py-32">
        <div className="container">
          <div className="max-w-3xl mx-auto text-center">
            <Badge variant="secondary" className="mb-4">
              AI-Powered Call Coaching
            </Badge>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
              Turn Every Sales Call Into a{" "}
              <span className="text-primary">Coaching Opportunity</span>
            </h1>
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Gunner automatically grades your team's calls, provides instant coaching feedback, 
              and gamifies improvement. Stop guessing. Start winning.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/signup">
                <Button size="lg" className="gap-2">
                  Start 14-Day Free Trial <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Button size="lg" variant="outline">
                Watch Demo
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mt-4">
              No credit card required for trial • Cancel anytime
            </p>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-muted/50">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Everything You Need to Build a Winning Team
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              From automatic call grading to gamified leaderboards, Gunner gives you 
              the tools to coach your team to success.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <Card key={index} className="border-0 shadow-lg">
                <CardHeader>
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle>{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-20" id="pricing">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Simple, Transparent Pricing
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
              Choose the plan that fits your team. All plans include a 14-day free trial.
            </p>
            <div className="inline-flex items-center gap-4 p-1 bg-muted rounded-lg">
              <button
                onClick={() => setBillingPeriod('monthly')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  billingPeriod === 'monthly' 
                    ? 'bg-background shadow-sm' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingPeriod('yearly')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  billingPeriod === 'yearly' 
                    ? 'bg-background shadow-sm' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Yearly <span className="text-primary ml-1">Save 20%</span>
              </button>
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {plans.map((plan, index) => (
              <Card 
                key={index} 
                className={`relative ${plan.popular ? 'border-primary shadow-xl scale-105' : ''}`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary">Most Popular</Badge>
                  </div>
                )}
                <CardHeader className="text-center pb-2">
                  <CardTitle className="text-2xl">{plan.name}</CardTitle>
                  <CardDescription>{plan.description}</CardDescription>
                </CardHeader>
                <CardContent className="text-center">
                  <div className="mb-6">
                    <span className="text-4xl font-bold">
                      ${billingPeriod === 'yearly' ? Math.round(plan.price * 0.8) : plan.price}
                    </span>
                    <span className="text-muted-foreground">/month</span>
                    {billingPeriod === 'yearly' && (
                      <p className="text-sm text-muted-foreground">
                        billed annually
                      </p>
                    )}
                  </div>
                  <Link href={`/signup?plan=${plan.name.toLowerCase()}`}>
                    <Button 
                      className="w-full mb-6" 
                      variant={plan.popular ? 'default' : 'outline'}
                    >
                      Start Free Trial
                    </Button>
                  </Link>
                  <ul className="space-y-3 text-left">
                    {plan.features.map((feature, featureIndex) => (
                      <li key={featureIndex} className="flex items-start gap-2">
                        <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-20 bg-muted/50">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Trusted by Sales Teams
            </h2>
          </div>
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {testimonials.map((testimonial, index) => (
              <Card key={index} className="border-0 shadow-lg">
                <CardContent className="pt-6">
                  <div className="flex gap-1 mb-4">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="h-5 w-5 fill-primary text-primary" />
                    ))}
                  </div>
                  <p className="text-lg mb-4 italic">"{testimonial.quote}"</p>
                  <div>
                    <p className="font-semibold">{testimonial.author}</p>
                    <p className="text-sm text-muted-foreground">{testimonial.company}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="container">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Ready to Transform Your Sales Team?
            </h2>
            <p className="text-xl text-muted-foreground mb-8">
              Start your 14-day free trial today. No credit card required.
            </p>
            <Link href="/signup">
              <Button size="lg" className="gap-2">
                Get Started Free <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-12">
        <div className="container">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-lg">G</span>
              </div>
              <span className="font-bold text-xl">Gunner</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} Gunner. All rights reserved.
            </p>
            <div className="flex gap-6">
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground">
                Privacy Policy
              </a>
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground">
                Terms of Service
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
