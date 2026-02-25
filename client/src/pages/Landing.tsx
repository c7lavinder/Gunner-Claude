import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import {
  Check,
  ArrowRight,
  Star,
  Clock,
  TrendingDown,
  DollarSign,
  ChevronDown,
  ChevronUp,
  Linkedin,
  Twitter,
  Youtube,
  Shield,
  Zap,
  BarChart3,
  MessageSquare,
} from "lucide-react";

// ─── CDN Image URLs ───
const HERO_DASHBOARD = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663328210645/nPQkfYKohVjXIMPw.png";
const CALL_SCORING_IMG = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663328210645/ggPZZAhkkIGfyscM.png";
const LEADERBOARD_IMG = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663328210645/VFpqCugCAqJdsDHi.png";
const AI_COACH_IMG = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663328210645/yciLCtnuSvoqVsYt.png";
const GUNNER_LOGO = "https://d2xsxph8kpxj0f.cloudfront.net/310519663328210645/nusXfQu5XBTMz3NUCR6brb/branding/gunner-logo-small.png";

// ─── Feature label mapping for display ───
const featureLabels: Record<string, string> = {
  call_grading: "AI Call Grading",
  advanced_analytics: "Advanced Analytics",
  basic_analytics: "Basic Analytics",
  team_dashboard: "Team Dashboard",
  custom_rubrics: "Custom Rubrics",
  training_materials: "Training Materials",
  api_access: "API Access",
  priority_support: "Priority Support",
  custom_branding: "Custom Branding",
  crm_integration: "CRM Integration",
  multiple_crm_integrations: "Multiple CRM Integrations",
  unlimited_users: "Unlimited Users",
  call_recording_storage: "Call Recording Storage",
  call_recording: "Call Recording Storage",
  coaching_insights: "Coaching Insights",
  team_leaderboards: "Team Leaderboards",
  leaderboards: "Team Leaderboards",
  export_reports: "Export Reports",
  white_label: "White Label",
};

const planDescriptions: Record<string, string> = {
  starter: "For small teams getting started.",
  growth: "For growing teams that need more.",
  scale: "For large teams with high volume.",
};

// ─── Testimonials ───
const testimonials = [
  {
    quote: "Gunner caught 12 calls where our reps went off-script. We coached them, and closed 4 more deals next month. Paid for itself in week 1.",
    name: "Corey Lavinder",
    title: "Founder",
    company: "New Again Houses",
  },
  {
    quote: "The daily rankings turned my team competitive overnight. Nobody wants to be at the bottom. Our call quality went up 40% in two weeks.",
    name: "Marcus Thompson",
    title: "Operations Manager",
    company: "DFW Property Solutions",
  },
  {
    quote: "I was skeptical about AI scoring. Then Gunner flagged a rep who was quoting prices 15% too low. Saved us $18K on one deal alone.",
    name: "Sarah Mitchell",
    title: "Owner",
    company: "Phoenix Home Buyers",
  },
  {
    quote: "Gunner flagged a rep who was quoting prices 15% too low. Saved us $18K on one deal alone. The ROI is insane.",
    name: "James Rodriguez",
    title: "CEO",
    company: "Atlanta Investment Group",
  },
  {
    quote: "We went from manually reviewing 10 calls per week to Gunner scoring every single one. Found patterns we never would've caught.",
    name: "Lisa Chen",
    title: "Sales Director",
    company: "West Coast Acquisitions",
  },
  {
    quote: "Our follow-up rate was 60%. With Gunner's signals handling it, we're at 98%. Deals that would've died are now closing.",
    name: "David Park",
    title: "Partner",
    company: "Chicago Property Pros",
  },
];

// ─── FAQ ───
const faqs = [
  {
    q: "What is Gunner AI?",
    a: "Gunner AI is an AI-powered call scoring and sales optimization platform built specifically for real estate wholesalers. It automatically grades every sales call, ranks your team on a leaderboard, provides AI-generated coaching feedback, and flags critical signals when reps miss follow-ups or go off-script.",
  },
  {
    q: "Who is Gunner for?",
    a: "Gunner is built for real estate wholesaling business owners and operations managers who are running a team of acquisition managers. If you're closing 2+ deals per month and want to scale without the manual grind of listening to call recordings, Gunner is for you.",
  },
  {
    q: "How does call scoring work?",
    a: "Gunner connects to your GoHighLevel account and automatically imports call recordings. Our AI transcribes each call and grades it against your custom rubric — evaluating things like script adherence, objection handling, pricing accuracy, and follow-up commitments.",
  },
  {
    q: "How quickly can I get started?",
    a: "Most teams are fully set up within 5 minutes. Connect your GoHighLevel account, configure your scoring rubric, and Gunner starts grading calls automatically.",
  },
  {
    q: "Do I need to be on GoHighLevel?",
    a: "Gunner is built around GoHighLevel as its primary integration. If you're not on GHL, reach out to us — we're building additional integrations and may be able to accommodate your setup.",
  },
  {
    q: "Is my call data secure?",
    a: "Yes. All call data is encrypted in transit and at rest. We follow industry-standard security practices and never share your data with third parties.",
  },
  {
    q: "What does the free trial include?",
    a: "The free trial gives you full access to all features in your chosen plan for 3 days. Credit card required to start — cancel anytime before the trial ends.",
  },
];

// ─── Smooth scroll helper ───
function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
}

// ─── Component ───
export default function Landing() {
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("monthly");
  const [activeFeatureTab, setActiveFeatureTab] = useState(0);
  const [openFaq, setOpenFaq] = useState<number[]>([0, 1]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Demo form state
  const [demoForm, setDemoForm] = useState({ name: "", email: "", phone: "", website: "", teamSize: "" });
  const [demoSubmitted, setDemoSubmitted] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Fetch plans from database
  const { data: dbPlans } = trpc.tenant.getPlans.useQuery();
  const trialDays = dbPlans?.[0]?.trialDays || 3;

  const plans = (dbPlans || [])
    .filter((p: any) => p.isActive === "true" || p.isActive === true)
    .sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0))
    .map((plan: any) => {
      const maxUsers = plan.maxUsers || 0;
      const maxCalls = plan.maxCallsPerMonth || 0;
      let featuresArray: string[] = [];
      if (typeof plan.features === "string") {
        try { featuresArray = JSON.parse(plan.features); } catch { featuresArray = []; }
      } else if (Array.isArray(plan.features)) {
        featuresArray = plan.features;
      }
      const features = featuresArray.map((f: string) => featureLabels[f] || f);
      const displayFeatures = [
        maxUsers >= 999 ? "Unlimited team members" : `Up to ${maxUsers} team member${maxUsers === 1 ? "" : "s"}`,
        maxCalls < 0 || maxCalls >= 999999 ? "Unlimited calls/month" : `${maxCalls.toLocaleString()} calls/month`,
        ...features.slice(0, 6),
      ];
      return {
        name: plan.name,
        code: plan.code,
        price: Math.round((plan.priceMonthly || 0) / 100),
        yearlyPrice: Math.round((plan.priceYearly || 0) / 100),
        description: planDescriptions[plan.code] || plan.description || "",
        features: displayFeatures,
        popular: plan.isPopular === "true" || plan.isPopular === true,
      };
    });

  const featureTabs = [
    {
      label: "AI Call Scoring",
      description: "Every call automatically transcribed and graded against your custom rubric. Gunner flags off-script moments, missed objection handling, and pricing errors — so you catch problems before they cost you deals.",
      image: CALL_SCORING_IMG,
    },
    {
      label: "Team Leaderboard",
      description: "Daily rankings create healthy competition without you lifting a finger. Reps see exactly where they stand. Nobody wants to be at the bottom. Your team coaches itself.",
      image: LEADERBOARD_IMG,
    },
    {
      label: "AI Coach Assistant",
      description: "After every call, Gunner generates specific, actionable coaching tips for that rep. Ask the AI coach questions about any call or rep. Get instant answers.",
      image: AI_COACH_IMG,
    },
  ];

  const toggleFaq = (i: number) => {
    setOpenFaq((prev) => prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]);
  };

  const handleDemoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Placeholder — would POST to webhook/CRM
    setDemoSubmitted(true);
  };

  const navLinks = [
    { label: "Features", target: "features" },
    { label: "How It Works", target: "how-it-works" },
    { label: "Pricing", target: "pricing" },
    { label: "About", target: "about" },
  ];

  return (
    <div className="min-h-screen bg-white text-[#111827] overflow-x-hidden">
      {/* ═══════════════════════════════════════════════════════
          NAVIGATION
         ═══════════════════════════════════════════════════════ */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled ? "bg-white/95 backdrop-blur-md shadow-sm" : "bg-transparent"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
              <img src={GUNNER_LOGO} alt="Gunner AI" className="h-10 w-auto" />
            </div>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-8">
              {navLinks.map((link) => (
                <button
                  key={link.target}
                  onClick={() => scrollTo(link.target)}
                  className={`text-sm font-medium transition-colors hover:text-[#B91C1C] ${
                    scrolled ? "text-[#111827]" : "text-white"
                  }`}
                >
                  {link.label}
                </button>
              ))}
            </div>

            <div className="hidden md:flex items-center gap-3">
              <Link href="/login">
                <Button
                  variant="ghost"
                  className={`${scrolled ? "text-[#111827] hover:text-[#B91C1C]" : "text-white hover:text-white/80 hover:bg-white/10"}`}
                >
                  Sign In
                </Button>
              </Link>
              <Link href="/signup">
                <Button className="bg-[#B91C1C] hover:bg-[#991B1B] text-white rounded-lg">
                  Start Free Trial
                </Button>
              </Link>
            </div>

            {/* Mobile hamburger */}
            <button
              className="md:hidden p-2"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              <div className={`w-6 h-0.5 ${scrolled ? "bg-[#111827]" : "bg-white"} transition-all ${mobileMenuOpen ? "rotate-45 translate-y-1.5" : ""}`} />
              <div className={`w-6 h-0.5 ${scrolled ? "bg-[#111827]" : "bg-white"} mt-1.5 transition-all ${mobileMenuOpen ? "opacity-0" : ""}`} />
              <div className={`w-6 h-0.5 ${scrolled ? "bg-[#111827]" : "bg-white"} mt-1.5 transition-all ${mobileMenuOpen ? "-rotate-45 -translate-y-1.5" : ""}`} />
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t shadow-lg">
            <div className="px-4 py-4 space-y-3">
              {navLinks.map((link) => (
                <button
                  key={link.target}
                  onClick={() => { scrollTo(link.target); setMobileMenuOpen(false); }}
                  className="block w-full text-left text-sm font-medium text-[#111827] hover:text-[#B91C1C] py-2"
                >
                  {link.label}
                </button>
              ))}
              <div className="pt-3 border-t flex flex-col gap-2">
                <Link href="/login">
                  <Button variant="outline" className="w-full">Sign In</Button>
                </Link>
                <Link href="/signup">
                  <Button className="w-full bg-[#B91C1C] hover:bg-[#991B1B] text-white">Start Free Trial</Button>
                </Link>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* ═══════════════════════════════════════════════════════
          SECTION 1: HERO
         ═══════════════════════════════════════════════════════ */}
      <section className="relative bg-[#1A1A1A] pt-24 pb-16 md:pt-32 md:pb-24 overflow-hidden">
        {/* Subtle gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#1A1A1A] via-[#1A1A1A] to-[#2D1111] opacity-80" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left: Copy */}
            <div>
              <div className="inline-flex items-center gap-2 bg-[#B91C1C]/20 border border-[#B91C1C]/30 rounded-full px-4 py-1.5 mb-6">
                <span className="text-[#F87171] text-xs font-semibold tracking-wide uppercase">
                  Built for Real Estate Wholesalers on GoHighLevel
                </span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white tracking-tight leading-[1.1] mb-6">
                Stop Babysitting Your Sales Reps.
              </h1>

              <p className="text-lg sm:text-xl text-gray-300 leading-relaxed mb-8 max-w-xl">
                Gunner AI automatically scores every sales call, ranks your team, and flags critical moments — so you can focus on scaling, not hand-holding.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <Link href="/signup">
                  <Button size="lg" className="bg-[#B91C1C] hover:bg-[#991B1B] text-white rounded-lg text-base px-8 h-12 gap-2 w-full sm:w-auto">
                    Start {trialDays}-Day Free Trial <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Button
                  size="lg"
                  variant="outline"
                  className="border-white/30 text-white hover:bg-white/10 rounded-lg text-base px-8 h-12 gap-2 bg-transparent"
                  onClick={() => scrollTo("how-it-works")}
                >
                  Watch It Work
                </Button>
              </div>

              <p className="text-sm text-gray-400">
                Trusted by 50+ real estate wholesaling teams nationwide
              </p>
            </div>

            {/* Right: Dashboard screenshot */}
            <div className="hidden lg:block">
              <div className="relative">
                <div className="absolute -inset-4 bg-gradient-to-r from-[#B91C1C]/20 to-transparent rounded-2xl blur-2xl" />
                <img
                  src={HERO_DASHBOARD}
                  alt="Gunner AI Dashboard"
                  className="relative rounded-xl shadow-2xl border border-white/10 w-full"
                  loading="eager"
                />
              </div>
            </div>
          </div>

          {/* Stats bar */}
          <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8 border-t border-white/10 pt-10">
            {[
              { value: "18,000+", label: "Calls Scored Monthly" },
              { value: "4.1x", label: "Average ROI in 90 Days" },
              { value: "50+", label: "Wholesaling Teams" },
              { value: "5 min", label: "Setup Time" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-2xl sm:text-3xl font-bold text-white">{stat.value}</div>
                <div className="text-sm text-gray-400 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          SECTION 3: THE PROBLEM
         ═══════════════════════════════════════════════════════ */}
      <section className="py-20 md:py-28 bg-[#F3F4F6]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <span className="text-[#B91C1C] text-xs font-bold tracking-widest uppercase">
              THE PROBLEM
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold mt-3 mb-4">
              If You're Not Listening to Every Call, You're Losing Money.
            </h2>
            <p className="text-lg text-gray-600 max-w-3xl mx-auto">
              Most wholesaling owners are running blind. You have 5, 10, maybe 15 reps making dozens of calls a day. You can't possibly listen to all of them. So you guess. You hope. And deals slip through the cracks.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Clock,
                title: "15+ Hours Lost Every Week.",
                body: "Manually reviewing call recordings is a full-time job. You either do it and neglect everything else, or you skip it and stay in the dark.",
              },
              {
                icon: TrendingDown,
                title: "No Visibility Into Rep Performance.",
                body: "Without data, you don't know who's crushing it and who's costing you deals. Coaching becomes a frustrating guessing game.",
              },
              {
                icon: DollarSign,
                title: "$8K+ Lost to Missed Follow-Ups Monthly.",
                body: "Reps forget to call back. Leads go cold. Deals that should have closed are gone — and you never even knew they were at risk.",
              },
            ].map((card) => (
              <div
                key={card.title}
                className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
              >
                <div className="w-12 h-12 bg-[#B91C1C]/10 rounded-lg flex items-center justify-center mb-5">
                  <card.icon className="h-6 w-6 text-[#B91C1C]" />
                </div>
                <h3 className="text-lg font-bold mb-3">{card.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{card.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          SECTION 4: HOW IT WORKS
         ═══════════════════════════════════════════════════════ */}
      <section id="how-it-works" className="py-20 md:py-28 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <span className="text-[#B91C1C] text-xs font-bold tracking-widest uppercase">
              HOW IT WORKS
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold mt-3 mb-4">
              Your Automated Sales Manager. Set Up in 5 Minutes.
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8 relative">
            {/* Connecting line (desktop) */}
            <div className="hidden md:block absolute top-16 left-[20%] right-[20%] h-0.5 bg-gradient-to-r from-[#B91C1C]/20 via-[#B91C1C]/40 to-[#B91C1C]/20" />

            {[
              {
                step: "1",
                title: "Connect GoHighLevel.",
                desc: "Securely connect your GHL account in under 5 minutes. Gunner automatically imports all your call recordings — no manual uploads, ever.",
              },
              {
                step: "2",
                title: "Gunner Grades Every Call.",
                desc: "Our AI analyzes every conversation against your custom rubric, scoring performance on key metrics and flagging critical moments — off-script moments, price objections, missed follow-ups.",
              },
              {
                step: "3",
                title: "Coach, Compete, and Close More.",
                desc: "Use the data to deliver targeted coaching, drive team competition with daily leaderboards, and catch problems before they cost you deals.",
              },
            ].map((step) => (
              <div key={step.step} className="relative text-center">
                <div className="w-14 h-14 bg-[#B91C1C] text-white rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-6 relative z-10">
                  {step.step}
                </div>
                <h3 className="text-lg font-bold mb-3">{step.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed max-w-sm mx-auto">{step.desc}</p>
              </div>
            ))}
          </div>

          <div className="text-center mt-14">
            <Button
              variant="outline"
              className="border-[#B91C1C] text-[#B91C1C] hover:bg-[#B91C1C] hover:text-white rounded-lg px-8 h-11"
              onClick={() => scrollTo("final-cta")}
            >
              See a Live Demo <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          SECTION 5: FEATURES DEEP-DIVE
         ═══════════════════════════════════════════════════════ */}
      <section id="features" className="py-20 md:py-28 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="text-[#B91C1C] text-xs font-bold tracking-widest uppercase">
              FEATURES
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold mt-3">
              Everything You Need to Build a Winning Team
            </h2>
          </div>

          {/* Tabs */}
          <div className="flex justify-center gap-1 mb-12 border-b border-gray-200 overflow-x-auto">
            {featureTabs.map((tab, i) => (
              <button
                key={tab.label}
                onClick={() => setActiveFeatureTab(i)}
                className={`px-6 py-3 text-sm font-medium whitespace-nowrap transition-all border-b-2 -mb-px ${
                  activeFeatureTab === i
                    ? "border-[#B91C1C] text-[#B91C1C]"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h3 className="text-2xl font-bold mb-4">{featureTabs[activeFeatureTab].label}</h3>
              <p className="text-gray-600 leading-relaxed text-lg">
                {featureTabs[activeFeatureTab].description}
              </p>
              <Link href="/signup">
                <Button className="mt-8 bg-[#B91C1C] hover:bg-[#991B1B] text-white rounded-lg gap-2">
                  Try It Free <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
            <div className="relative">
              <div className="absolute -inset-3 bg-gradient-to-br from-[#B91C1C]/5 to-transparent rounded-2xl" />
              <img
                src={featureTabs[activeFeatureTab].image}
                alt={featureTabs[activeFeatureTab].label}
                className="relative rounded-xl shadow-lg border border-gray-200 w-full"
                loading="lazy"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          SECTION 6: BEFORE & AFTER (ROI)
         ═══════════════════════════════════════════════════════ */}
      <section className="py-20 md:py-28 bg-[#F3F4F6]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <span className="text-[#B91C1C] text-xs font-bold tracking-widest uppercase">
              THE ROI
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold mt-3">
              The Real Cost of Managing Your Team the Old Way
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {/* Before */}
            <div className="bg-red-50 border border-red-200 rounded-xl p-8">
              <h3 className="text-xl font-bold text-red-800 mb-6">Before Gunner</h3>
              <ul className="space-y-5">
                {[
                  { bold: "15+ Hours/Week Reviewing Calls", text: "Manually listening to recordings to catch mistakes" },
                  { bold: "$8K+/Month in Missed Follow-Ups", text: "Deals lost because reps forgot to call back" },
                  { bold: "Zero Visibility Into Performance", text: "No idea who's crushing it or who needs help" },
                  { bold: "Constant Micromanagement", text: "Babysitting reps instead of scaling your business" },
                  { bold: "After-Hours Leads Go Cold", text: "No one available nights and weekends" },
                ].map((item) => (
                  <li key={item.bold} className="flex items-start gap-3">
                    <span className="mt-1 w-5 h-5 rounded-full bg-red-200 flex items-center justify-center shrink-0">
                      <span className="w-2 h-2 rounded-full bg-red-500" />
                    </span>
                    <div>
                      <span className="font-semibold text-red-900">{item.bold}</span>
                      <span className="text-red-700 text-sm block">{item.text}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* After */}
            <div className="bg-green-50 border border-green-200 rounded-xl p-8">
              <h3 className="text-xl font-bold text-green-800 mb-6">With Gunner</h3>
              <ul className="space-y-5">
                {[
                  { bold: "0 Hours Reviewing Calls", text: "Every call automatically scored with detailed feedback" },
                  { bold: "$0 Lost to Missed Follow-Ups", text: "Signals alert you instantly when reps drop the ball" },
                  { bold: "Real-Time Performance Dashboard", text: "See exactly who's performing and who needs coaching" },
                  { bold: "Team Self-Manages", text: "Daily rankings create healthy competition automatically" },
                  { bold: "Never Miss a Critical Moment", text: "AI flags off-script moments, pricing errors, and missed objections" },
                ].map((item) => (
                  <li key={item.bold} className="flex items-start gap-3">
                    <span className="mt-1 w-5 h-5 rounded-full bg-green-200 flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3 text-green-600" />
                    </span>
                    <div>
                      <span className="font-semibold text-green-900">{item.bold}</span>
                      <span className="text-green-700 text-sm block">{item.text}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* ROI Banner */}
          <div className="mt-12 bg-[#B91C1C] rounded-xl py-6 px-8 text-center max-w-5xl mx-auto">
            <p className="text-white text-xl sm:text-2xl font-bold">
              Average Team Sees 4.1x ROI Within 90 Days
            </p>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          SECTION 7: TESTIMONIALS
         ═══════════════════════════════════════════════════════ */}
      <section className="py-20 md:py-28 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <span className="text-[#B91C1C] text-xs font-bold tracking-widest uppercase">
              TESTIMONIALS
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold mt-3">
              Real Results From Real Wholesalers
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {testimonials.map((t, i) => (
              <div key={i} className="bg-white border border-gray-100 rounded-xl p-8 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, j) => (
                    <Star key={j} className="h-4 w-4 fill-[#B91C1C] text-[#B91C1C]" />
                  ))}
                </div>
                <p className="text-gray-700 italic mb-6 leading-relaxed">"{t.quote}"</p>
                <div>
                  <p className="font-bold text-[#111827]">{t.name}</p>
                  <p className="text-sm text-gray-500">{t.title}, {t.company}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          SECTION 8: PRICING
         ═══════════════════════════════════════════════════════ */}
      <section id="pricing" className="py-20 md:py-28 bg-[#F3F4F6]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="text-[#B91C1C] text-xs font-bold tracking-widest uppercase">
              PRICING
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold mt-3 mb-4">
              Simple, Transparent Pricing
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-8">
              All plans include a {trialDays}-day free trial. Credit card required to start.
            </p>

            {/* Billing toggle */}
            <div className="inline-flex items-center gap-1 p-1 bg-white rounded-lg shadow-sm border border-gray-200">
              <button
                onClick={() => setBillingPeriod("monthly")}
                className={`px-5 py-2 rounded-md text-sm font-medium transition-all ${
                  billingPeriod === "monthly"
                    ? "bg-[#B91C1C] text-white shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingPeriod("yearly")}
                className={`px-5 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
                  billingPeriod === "yearly"
                    ? "bg-[#B91C1C] text-white shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Yearly
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  billingPeriod === "yearly" ? "bg-white/20 text-white" : "bg-green-100 text-green-700"
                }`}>
                  Save 20%
                </span>
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {plans.map((plan, index) => (
              <div
                key={plan.code || index}
                className={`relative bg-white rounded-xl p-8 transition-all ${
                  plan.popular
                    ? "border-2 border-[#B91C1C] shadow-xl md:scale-105 z-10"
                    : "border border-gray-200 shadow-sm"
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="bg-[#B91C1C] text-white text-xs font-bold px-4 py-1 rounded-full">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="text-center mb-6">
                  <h3 className="text-xl font-bold mb-1">{plan.name}</h3>
                  <p className="text-sm text-gray-500">{plan.description}</p>
                </div>

                <div className="text-center mb-8">
                  <span className="text-4xl font-extrabold">
                    ${billingPeriod === "yearly" ? Math.round((plan.yearlyPrice || plan.price * 10) / 12) : plan.price}
                  </span>
                  <span className="text-gray-500">/month</span>
                  {billingPeriod === "yearly" && (
                    <p className="text-xs text-gray-400 mt-1">
                      billed annually (${(plan.yearlyPrice || plan.price * 10).toLocaleString()}/yr)
                    </p>
                  )}
                </div>

                <Link href="/signup">
                  <Button
                    className={`w-full mb-6 rounded-lg h-11 ${
                      plan.popular
                        ? "bg-[#B91C1C] hover:bg-[#991B1B] text-white"
                        : "border-[#B91C1C] text-[#B91C1C] hover:bg-[#B91C1C] hover:text-white"
                    }`}
                    variant={plan.popular ? "default" : "outline"}
                  >
                    Start Free Trial
                  </Button>
                </Link>

                <ul className="space-y-3">
                  {plan.features.map((feature, fi) => (
                    <li key={fi} className="flex items-start gap-2.5">
                      <Check className="h-4 w-4 text-[#B91C1C] shrink-0 mt-0.5" />
                      <span className="text-sm text-gray-700">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Trust signals */}
          <div className="flex flex-wrap justify-center gap-6 md:gap-10 mt-12 text-sm text-gray-500">
            {[
              `${trialDays}-day free trial`,
              "Credit card required",
              "Cancel anytime",
              "Native GoHighLevel integration",
            ].map((signal) => (
              <div key={signal} className="flex items-center gap-2">
                <Check className="h-4 w-4 text-[#B91C1C]" />
                <span>{signal}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          SECTION 9: INTEGRATIONS
         ═══════════════════════════════════════════════════════ */}
      <section className="py-20 md:py-28 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <span className="text-[#B91C1C] text-xs font-bold tracking-widest uppercase">
              INTEGRATIONS
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold mt-3">
              Works Natively With the Tools You Already Use
            </h2>
          </div>

          {/* GHL Featured */}
          <div className="max-w-3xl mx-auto bg-white border border-gray-200 rounded-xl p-8 md:p-12 shadow-sm text-center">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="w-16 h-16 bg-[#F3F4F6] rounded-xl flex items-center justify-center">
                <Zap className="h-8 w-8 text-[#B91C1C]" />
              </div>
            </div>
            <div className="flex items-center justify-center gap-2 mb-4">
              <h3 className="text-2xl font-bold">GoHighLevel</h3>
              <span className="bg-[#B91C1C]/10 text-[#B91C1C] text-xs font-bold px-3 py-1 rounded-full">
                Native Integration
              </span>
            </div>
            <p className="text-gray-600 max-w-lg mx-auto">
              Gunner connects directly to your GoHighLevel account. Calls sync automatically — no Zapier, no manual uploads, no headaches.
            </p>
          </div>

          {/* Secondary integrations */}
          <div className="flex flex-wrap justify-center gap-8 mt-12">
            {["BatchDialer", "BatchLeads"].map((name) => (
              <div key={name} className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-6 py-3">
                <Shield className="h-5 w-5 text-gray-400" />
                <span className="text-sm font-medium text-gray-600">{name}</span>
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">Integrated</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          SECTION 10: ABOUT / THE STORY
         ═══════════════════════════════════════════════════════ */}
      <section id="about" className="py-20 md:py-28 bg-[#F3F4F6]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="text-[#B91C1C] text-xs font-bold tracking-widest uppercase">
              OUR STORY
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold mt-3">
              Built by a Wholesaler, for Wholesalers
            </h2>
          </div>

          <div className="max-w-3xl mx-auto">
            <div className="bg-white rounded-xl p-8 md:p-12 shadow-sm border border-gray-100">
              <div className="flex items-start gap-6 mb-6">
                <div className="w-16 h-16 bg-[#B91C1C]/10 rounded-full flex items-center justify-center shrink-0">
                  <span className="text-2xl font-bold text-[#B91C1C]">P</span>
                </div>
                <div>
                  <h3 className="text-xl font-bold">Pablo</h3>
                  <p className="text-sm text-gray-500">Founder, Gunner AI</p>
                </div>
              </div>
              <div className="space-y-4 text-gray-600 leading-relaxed">
                <p>
                  Gunner AI was built out of a real problem. Running a wholesaling team, I spent hours every week listening to call recordings, trying to figure out who needed coaching and who was letting deals slip.
                </p>
                <p>
                  I tried every sales tool on the market — none of them understood real estate wholesaling. So I built Gunner. Today, 50+ wholesaling teams use it to score calls, coach their teams, and close more deals without the manual grind.
                </p>
                <p className="font-medium text-[#111827]">
                  This is the tool I wish I had.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          SECTION 11: FAQ
         ═══════════════════════════════════════════════════════ */}
      <section className="py-20 md:py-28 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="text-[#B91C1C] text-xs font-bold tracking-widest uppercase">
              FAQ
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold mt-3">
              Frequently Asked Questions
            </h2>
          </div>

          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div key={i} className="border border-gray-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleFaq(i)}
                  className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="font-semibold text-[#111827] pr-4">{faq.q}</span>
                  {openFaq.includes(i) ? (
                    <ChevronUp className="h-5 w-5 text-gray-400 shrink-0" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-gray-400 shrink-0" />
                  )}
                </button>
                {openFaq.includes(i) && (
                  <div className="px-5 pb-5 text-gray-600 leading-relaxed">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          SECTION 12: FINAL CTA
         ═══════════════════════════════════════════════════════ */}
      <section id="final-cta" className="py-20 md:py-28 bg-[#1A1A1A]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Ready to Stop Babysitting and Start Scaling?
          </h2>
          <p className="text-lg text-gray-300 mb-10 max-w-xl mx-auto">
            Start your {trialDays}-day free trial and see exactly how Gunner AI can increase your team's close rate in the next 30 days.
          </p>

          <Link href="/signup">
            <Button size="lg" className="bg-[#B91C1C] hover:bg-[#991B1B] text-white rounded-lg text-lg px-10 h-14 gap-2">
              Start {trialDays}-Day Free Trial <ArrowRight className="h-5 w-5" />
            </Button>
          </Link>

          <p className="text-sm text-gray-400 mt-6">
            {trialDays}-day free trial. Credit card required. Cancel anytime.
          </p>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          FOOTER
         ═══════════════════════════════════════════════════════ */}
      <footer className="bg-[#111827] py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-5 gap-12 mb-12">
            {/* Brand */}
            <div className="md:col-span-1">
              <img src={GUNNER_LOGO} alt="Gunner AI" className="h-10 w-auto mb-4" />
              <p className="text-sm text-gray-400">
                Built for real estate wholesalers who scale.
              </p>
            </div>

            {/* Product */}
            <div>
              <h4 className="text-sm font-semibold text-white mb-4">Product</h4>
              <ul className="space-y-2.5">
                {[
                  { label: "Features", target: "features" },
                  { label: "How It Works", target: "how-it-works" },
                  { label: "Pricing", target: "pricing" },
                  { label: "Integrations", target: "integrations" },
                ].map((link) => (
                  <li key={link.label}>
                    <button
                      onClick={() => scrollTo(link.target)}
                      className="text-sm text-gray-400 hover:text-white transition-colors"
                    >
                      {link.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Company */}
            <div>
              <h4 className="text-sm font-semibold text-white mb-4">Company</h4>
              <ul className="space-y-2.5">
                <li>
                  <button onClick={() => scrollTo("about")} className="text-sm text-gray-400 hover:text-white transition-colors">
                    About
                  </button>
                </li>
              </ul>
            </div>

            {/* Support */}
            <div>
              <h4 className="text-sm font-semibold text-white mb-4">Support</h4>
              <ul className="space-y-2.5">
                <li>
                  <button onClick={() => scrollTo("final-cta")} className="text-sm text-gray-400 hover:text-white transition-colors">
                    Contact Us
                  </button>
                </li>
                <li>
                  <Link href="/signup" className="text-sm text-gray-400 hover:text-white transition-colors">
                    Start Free Trial
                  </Link>
                </li>
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="text-sm font-semibold text-white mb-4">Legal</h4>
              <ul className="space-y-2.5">
                <li>
                  <Link href="/privacy" className="text-sm text-gray-400 hover:text-white transition-colors">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className="text-sm text-gray-400 hover:text-white transition-colors">
                    Terms of Service
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="border-t border-gray-800 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-gray-500">
              &copy; {new Date().getFullYear()} Gunner AI. All rights reserved.
            </p>
            <div className="flex gap-4">
              <a href="#" className="text-gray-500 hover:text-white transition-colors" aria-label="LinkedIn">
                <Linkedin className="h-5 w-5" />
              </a>
              <a href="#" className="text-gray-500 hover:text-white transition-colors" aria-label="Twitter">
                <Twitter className="h-5 w-5" />
              </a>
              <a href="#" className="text-gray-500 hover:text-white transition-colors" aria-label="YouTube">
                <Youtube className="h-5 w-5" />
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
