import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
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
  Target,
  Users,
  Trophy,
  Brain,
  Phone,
  TrendingUp,
  Play,
  Sparkles,
} from "lucide-react";

// ─── CDN Image URLs ───
const HERO_DASHBOARD = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663328210645/vNQGmAQJzCbyfSPK.png";
const CALL_SCORING_IMG = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663328210645/JFwhthFRYPSiFrvr.png";
const LEADERBOARD_IMG = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663328210645/vNQGmAQJzCbyfSPK.png";
const AI_COACH_IMG = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663328210645/JFwhthFRYPSiFrvr.png";
const GUNNER_LOGO = "https://d2xsxph8kpxj0f.cloudfront.net/310519663328210645/nusXfQu5XBTMz3NUCR6brb/gunner-logo-small-transparent_1ea33474.png";

// ─── Feature label mapping ───
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
  starter: "For solo operators getting started.",
  growth: "For growing teams that need more.",
  scale: "For large teams with high volume.",
};

// ─── Testimonials ───
const testimonials = [
  {
    quote: "Gunner caught 12 calls where our reps went off-script. We coached them, and closed 4 more deals next month. Paid for itself in week 1.",
    name: "Corey L.",
    title: "Founder",
    company: "New Again Houses",
  },
  {
    quote: "I used to spend 15 hours a week listening to call recordings. Now I spend zero. Gunner scores every call automatically and tells me exactly who needs coaching.",
    name: "Pablo M.",
    title: "Operations Manager",
    company: "NAH Kitty Hawk",
  },
  {
    quote: "The leaderboard changed everything. My reps started competing with each other instead of me having to push them. Close rates went up 30% in the first month.",
    name: "Marcus T.",
    title: "Team Lead",
    company: "Wholesaling Company",
  },
  {
    quote: "Gunner flagged a rep who was quoting prices way too low. We caught it before it cost us a deal. That one save paid for 6 months of Gunner.",
    name: "Sarah M.",
    title: "Owner",
    company: "Wholesaling Company",
  },
  {
    quote: "Setup took 5 minutes. Connected GHL, and Gunner started grading calls immediately. By end of day one I had insights I'd never had before.",
    name: "James R.",
    title: "CEO",
    company: "Wholesaling Company",
  },
  {
    quote: "The AI Coach is like having a sales trainer available 24/7. My newer reps are ramping up twice as fast because they get instant feedback after every call.",
    name: "Lisa C.",
    title: "Sales Director",
    company: "Wholesaling Company",
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

// ─── Animated counter hook ───
function useCounter(end: number, duration: number = 2000, startOnView: boolean = true) {
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(!startOnView);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!startOnView) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setStarted(true); },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [startOnView]);

  useEffect(() => {
    if (!started) return;
    let start = 0;
    const step = end / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= end) { setCount(end); clearInterval(timer); }
      else setCount(Math.floor(start));
    }, 16);
    return () => clearInterval(timer);
  }, [started, end, duration]);

  return { count, ref };
}

// ─── Scroll-reveal hook ───
function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.1, rootMargin: "0px 0px -60px 0px" }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return { ref, visible };
}

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
}

// ─── Component ───
export default function Landing() {
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">("monthly");
  const [activeFeatureTab, setActiveFeatureTab] = useState(0);
  const [openFaq, setOpenFaq] = useState<number[]>([0]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Auto-rotate feature tabs
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveFeatureTab((prev) => (prev + 1) % 3);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

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
      icon: Target,
      description: "Every call automatically transcribed and graded against your custom rubric. Gunner flags off-script moments, missed objection handling, and pricing errors — so you catch problems before they cost you deals.",
      image: CALL_SCORING_IMG,
      stats: [
        { label: "Accuracy", value: "97%" },
        { label: "Time Saved", value: "15h/wk" },
        { label: "Avg. Processing", value: "<30s" },
      ],
    },
    {
      label: "Team Leaderboard",
      icon: Trophy,
      description: "Daily rankings create healthy competition without you lifting a finger. Reps see exactly where they stand. Nobody wants to be at the bottom. Your team coaches itself.",
      image: LEADERBOARD_IMG,
      stats: [
        { label: "Engagement", value: "+85%" },
        { label: "Performance", value: "+40%" },
        { label: "Retention", value: "+25%" },
      ],
    },
    {
      label: "AI Coach",
      icon: Brain,
      description: "After every call, Gunner generates specific, actionable coaching tips for that rep. Ask the AI coach questions about any call or rep. Get instant answers.",
      image: AI_COACH_IMG,
      stats: [
        { label: "Coaching Tips", value: "Auto" },
        { label: "Response Time", value: "<2s" },
        { label: "Improvement", value: "+35%" },
      ],
    },
  ];

  const toggleFaq = (i: number) => {
    setOpenFaq((prev) => prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]);
  };

  const navLinks = [
    { label: "Features", target: "features" },
    { label: "How It Works", target: "how-it-works" },
    { label: "Pricing", target: "pricing" },
    { label: "About", target: "about" },
  ];

  // Scroll reveal refs
  const heroReveal = useReveal();
  const problemReveal = useReveal();
  const howReveal = useReveal();
  const featuresReveal = useReveal();
  const roiReveal = useReveal();
  const testimonialsReveal = useReveal();
  const pricingReveal = useReveal();

  // Animated counters
  const callsCounter = useCounter(5000, 2000);
  const roiCounter = useCounter(41, 1500);
  const teamsCounter = useCounter(10, 1500);

  return (
    <div className="min-h-screen bg-[#08080c] text-[#f0f0f5] overflow-x-hidden">
      {/* ═══════════════════════════════════════════════════════
          NAVIGATION — Glass morphism
         ═══════════════════════════════════════════════════════ */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          scrolled
            ? "bg-[#08080c]/80 backdrop-blur-2xl border-b border-white/[0.06] shadow-lg shadow-black/20"
            : "bg-transparent"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 lg:h-18 items-center justify-between">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
              <img src={GUNNER_LOGO} alt="Gunner AI" className="h-9 w-auto" style={{ mixBlendMode: 'screen' }} />
            </div>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => (
                <button
                  key={link.target}
                  onClick={() => scrollTo(link.target)}
                  className="px-4 py-2 text-sm font-medium text-white/50 hover:text-white transition-colors rounded-lg hover:bg-white/[0.04]"
                >
                  {link.label}
                </button>
              ))}
            </div>

            <div className="hidden md:flex items-center gap-3">
              <Link href="/login">
                <Button
                  variant="ghost"
                  className="text-white/60 hover:text-white hover:bg-white/[0.06]"
                >
                  Sign In
                </Button>
              </Link>
              <Link href="/signup">
                <Button className="bg-gradient-to-r from-[#c41e3a] to-[#a01830] hover:from-[#d42040] hover:to-[#b01e38] text-white rounded-lg shadow-lg shadow-[#c41e3a]/20 hover:shadow-[#c41e3a]/30 transition-all">
                  Start Free Trial
                </Button>
              </Link>
            </div>

            {/* Mobile hamburger */}
            <button className="md:hidden p-2" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              <div className={`w-5 h-0.5 bg-white transition-all duration-300 ${mobileMenuOpen ? "rotate-45 translate-y-[5px]" : ""}`} />
              <div className={`w-5 h-0.5 bg-white mt-1 transition-all duration-300 ${mobileMenuOpen ? "opacity-0" : ""}`} />
              <div className={`w-5 h-0.5 bg-white mt-1 transition-all duration-300 ${mobileMenuOpen ? "-rotate-45 -translate-y-[5px]" : ""}`} />
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-[#0e0e14]/95 backdrop-blur-2xl border-t border-white/[0.06]">
            <div className="px-4 py-4 space-y-1">
              {navLinks.map((link) => (
                <button
                  key={link.target}
                  onClick={() => { scrollTo(link.target); setMobileMenuOpen(false); }}
                  className="block w-full text-left text-sm font-medium text-white/60 hover:text-white py-3 px-3 rounded-lg hover:bg-white/[0.04]"
                >
                  {link.label}
                </button>
              ))}
              <div className="pt-3 border-t border-white/[0.06] flex flex-col gap-2">
                <Link href="/login">
                  <Button variant="outline" className="w-full border-white/10 text-white hover:bg-white/[0.06]">Sign In</Button>
                </Link>
                <Link href="/signup">
                  <Button className="w-full bg-gradient-to-r from-[#c41e3a] to-[#a01830] text-white">Start Free Trial</Button>
                </Link>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* ═══════════════════════════════════════════════════════
          HERO — Animated gradient mesh with massive headline
         ═══════════════════════════════════════════════════════ */}
      <section className="relative min-h-screen flex items-center pt-20 pb-20 overflow-hidden">
        {/* Animated gradient orbs */}
        <div className="absolute inset-0">
          <div className="absolute top-[10%] left-[15%] w-[600px] h-[600px] bg-[#c41e3a]/[0.08] rounded-full blur-[120px] animate-pulse" style={{ animationDuration: "8s" }} />
          <div className="absolute bottom-[20%] right-[10%] w-[500px] h-[500px] bg-[#8B1A1A]/[0.06] rounded-full blur-[100px] animate-pulse" style={{ animationDuration: "12s", animationDelay: "2s" }} />
          <div className="absolute top-[50%] left-[50%] w-[400px] h-[400px] bg-[#f97316]/[0.03] rounded-full blur-[80px] animate-pulse" style={{ animationDuration: "10s", animationDelay: "4s" }} />
          {/* Grid pattern */}
          <div className="absolute inset-0 opacity-[0.03]" style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: "60px 60px",
          }} />
        </div>

        <div
          ref={heroReveal.ref}
          className={`relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full transition-all duration-1000 ${
            heroReveal.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Left: Copy */}
            <div>
              <div className="inline-flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-full px-4 py-1.5 mb-8 backdrop-blur-sm">
                <div className="w-1.5 h-1.5 rounded-full bg-[#c41e3a] animate-pulse" />
                <span className="text-white/60 text-xs font-medium tracking-wide uppercase">
                  Built for Real Estate Wholesalers
                </span>
              </div>

              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-[-0.04em] leading-[1.05] mb-8">
                Stop Babysitting
                <br />
                Your Sales{" "}
                <span className="bg-gradient-to-r from-[#c41e3a] via-[#e8364f] to-[#f97316] bg-clip-text text-transparent">
                  Reps.
                </span>
              </h1>

              <p className="text-lg sm:text-xl text-white/50 leading-relaxed mb-10 max-w-lg">
                Gunner AI automatically scores every sales call, ranks your team, and flags critical moments — so you can focus on scaling, not hand-holding.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 mb-8">
                <Link href="/signup">
                  <Button size="lg" className="bg-gradient-to-r from-[#c41e3a] to-[#a01830] hover:from-[#d42040] hover:to-[#b01e38] text-white rounded-xl text-base px-8 h-13 gap-2 w-full sm:w-auto shadow-xl shadow-[#c41e3a]/25 hover:shadow-[#c41e3a]/40 transition-all duration-300 hover:-translate-y-0.5">
                    Start {trialDays}-Day Free Trial <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <a href="mailto:corey@getgunner.ai?subject=Gunner%20AI%20Demo%20Request&body=Hi%20Corey%2C%0A%0AI%27d%20like%20to%20schedule%20a%20demo%20of%20Gunner%20AI%20for%20my%20team.%0A%0ATeam%20size%3A%20%0ACurrent%20CRM%3A%20%0A%0AThanks!">
                  <Button
                    size="lg"
                    variant="outline"
                    className="border-white/10 text-white/70 hover:text-white hover:bg-white/[0.06] hover:border-white/20 rounded-xl text-base px-8 h-13 gap-2 bg-transparent transition-all duration-300 w-full sm:w-auto"
                  >
                    <MessageSquare className="h-4 w-4" /> Book a Demo
                  </Button>
                </a>
              </div>

              <div className="flex items-center gap-6 text-sm text-white/30">
                <div className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-[#c41e3a]" />
                  <span>{trialDays}-day free trial</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-[#c41e3a]" />
                  <span>5-minute setup</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-[#c41e3a]" />
                  <span>Cancel anytime</span>
                </div>
              </div>
            </div>

            {/* Right: Dashboard screenshot with glass frame */}
            <div className="hidden lg:block">
              <div className="relative group">
                {/* Glow behind */}
                <div className="absolute -inset-8 bg-gradient-to-r from-[#c41e3a]/20 via-[#c41e3a]/5 to-transparent rounded-3xl blur-3xl group-hover:from-[#c41e3a]/25 transition-all duration-700" />
                {/* Glass frame */}
                <div className="relative bg-white/[0.03] border border-white/[0.08] rounded-2xl p-2 backdrop-blur-sm">
                  <img
                    src={HERO_DASHBOARD}
                    alt="Gunner AI Dashboard"
                    className="rounded-xl w-full shadow-2xl"
                    loading="eager"
                  />
                  {/* Floating badge */}
                  <div className="absolute -bottom-4 -left-4 bg-[#0e0e14] border border-white/[0.1] rounded-xl px-4 py-3 shadow-xl backdrop-blur-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#22c55e] to-[#16a34a] flex items-center justify-center text-white font-bold text-sm">A</div>
                      <div>
                        <div className="text-xs text-white/40">Latest Score</div>
                        <div className="text-sm font-bold text-white font-mono">94/100</div>
                      </div>
                    </div>
                  </div>
                  {/* Floating badge 2 */}
                  <div className="absolute -top-4 -right-4 bg-[#0e0e14] border border-white/[0.1] rounded-xl px-4 py-3 shadow-xl backdrop-blur-sm">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-[#22c55e]" />
                      <span className="text-sm font-bold text-[#22c55e] font-mono">+40%</span>
                      <span className="text-xs text-white/40">this month</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Stats bar */}
          <div className="mt-24 grid grid-cols-2 md:grid-cols-4 gap-8 border-t border-white/[0.06] pt-12">
            {[
              { value: "5,000+", label: "Calls Scored Monthly", ref: callsCounter.ref },
              { value: "4.1x", label: "Average ROI in 90 Days" },
              { value: "10+", label: "Wholesaling Teams" },
              { value: "5 min", label: "Setup Time" },
            ].map((stat) => (
              <div key={stat.label} className="text-center group">
                <div className="text-3xl sm:text-4xl font-extrabold text-white font-mono tracking-tight group-hover:text-[#c41e3a] transition-colors duration-300">
                  {stat.value}
                </div>
                <div className="text-sm text-white/30 mt-2 font-medium">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          THE PROBLEM — Dark cards with red accent glow
         ═══════════════════════════════════════════════════════ */}
      <section className="relative py-24 md:py-32">
        <div className="absolute inset-0 bg-gradient-to-b from-[#08080c] via-[#0a0a10] to-[#08080c]" />
        <div
          ref={problemReveal.ref}
          className={`relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 transition-all duration-1000 ${
            problemReveal.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-[#c41e3a]/[0.08] border border-[#c41e3a]/[0.15] rounded-full px-4 py-1.5 mb-6">
              <span className="text-[#e8364f] text-xs font-semibold tracking-wider uppercase">The Problem</span>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-[-0.03em] mb-5">
              If You're Not Listening to Every Call,
              <br className="hidden sm:block" />
              <span className="text-white/40">You're Losing Money.</span>
            </h2>
            <p className="text-lg text-white/40 max-w-3xl mx-auto leading-relaxed">
              Most wholesaling owners are running blind. You have 5, 10, maybe 15 reps making dozens of calls a day. You can't possibly listen to all of them.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: Clock,
                title: "15+ Hours Lost Every Week.",
                body: "Manually reviewing call recordings is a full-time job. You either do it and neglect everything else, or you skip it and stay in the dark.",
                gradient: "from-[#c41e3a]/20 to-transparent",
              },
              {
                icon: TrendingDown,
                title: "No Visibility Into Performance.",
                body: "Without data, you don't know who's crushing it and who's costing you deals. Coaching becomes a frustrating guessing game.",
                gradient: "from-[#f97316]/20 to-transparent",
              },
              {
                icon: DollarSign,
                title: "$8K+ Lost Monthly.",
                body: "Reps forget to call back. Leads go cold. Deals that should have closed are gone — and you never even knew they were at risk.",
                gradient: "from-[#eab308]/20 to-transparent",
              },
            ].map((card, i) => (
              <div
                key={card.title}
                className="group relative bg-[#0e0e14] border border-white/[0.06] rounded-2xl p-8 hover:border-white/[0.12] transition-all duration-500"
                style={{ transitionDelay: `${i * 100}ms` }}
              >
                {/* Hover glow */}
                <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient} rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
                <div className="relative">
                  <div className="w-12 h-12 bg-white/[0.04] border border-white/[0.08] rounded-xl flex items-center justify-center mb-6 group-hover:border-[#c41e3a]/30 transition-colors duration-500">
                    <card.icon className="h-5 w-5 text-[#c41e3a]" />
                  </div>
                  <h3 className="text-lg font-bold mb-3 tracking-tight">{card.title}</h3>
                  <p className="text-white/40 text-sm leading-relaxed">{card.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          HOW IT WORKS — Numbered steps with gradient line
         ═══════════════════════════════════════════════════════ */}
      <section id="how-it-works" className="relative py-24 md:py-32">
        <div
          ref={howReveal.ref}
          className={`relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 transition-all duration-1000 ${
            howReveal.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <div className="text-center mb-20">
            <div className="inline-flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-full px-4 py-1.5 mb-6">
              <span className="text-white/60 text-xs font-semibold tracking-wider uppercase">How It Works</span>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-[-0.03em]">
              Your Automated Sales Manager.
              <br className="hidden sm:block" />
              <span className="text-white/40">Set Up in 5 Minutes.</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8 relative">
            {/* Connecting gradient line */}
            <div className="hidden md:block absolute top-[52px] left-[20%] right-[20%] h-px bg-gradient-to-r from-[#c41e3a]/40 via-[#c41e3a]/20 to-[#c41e3a]/40" />

            {[
              {
                step: "01",
                title: "Connect GoHighLevel.",
                desc: "Securely connect your GHL account in under 5 minutes. Gunner automatically imports all your call recordings — no manual uploads, ever.",
                icon: Zap,
              },
              {
                step: "02",
                title: "Gunner Grades Every Call.",
                desc: "Our AI analyzes every conversation against your custom rubric, scoring performance on key metrics and flagging critical moments.",
                icon: Brain,
              },
              {
                step: "03",
                title: "Coach, Compete, Close.",
                desc: "Use the data to deliver targeted coaching, drive team competition with daily leaderboards, and catch problems before they cost you deals.",
                icon: Trophy,
              },
            ].map((step, i) => (
              <div key={step.step} className="relative text-center group">
                <div className="w-[104px] h-[104px] mx-auto mb-8 relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-[#c41e3a]/20 to-transparent rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="relative w-full h-full bg-[#0e0e14] border border-white/[0.08] rounded-2xl flex flex-col items-center justify-center group-hover:border-[#c41e3a]/30 transition-all duration-500">
                    <span className="text-[#c41e3a] text-xs font-mono font-bold tracking-widest">{step.step}</span>
                    <step.icon className="h-6 w-6 text-white/60 mt-1 group-hover:text-white transition-colors" />
                  </div>
                </div>
                <h3 className="text-lg font-bold mb-3 tracking-tight">{step.title}</h3>
                <p className="text-white/40 text-sm leading-relaxed max-w-xs mx-auto">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          FEATURES — Tab-based with floating screenshot
         ═══════════════════════════════════════════════════════ */}
      <section id="features" className="relative py-24 md:py-32">
        <div className="absolute inset-0 bg-gradient-to-b from-[#08080c] via-[#0a0a10] to-[#08080c]" />
        <div
          ref={featuresReveal.ref}
          className={`relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 transition-all duration-1000 ${
            featuresReveal.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-full px-4 py-1.5 mb-6">
              <Sparkles className="h-3.5 w-3.5 text-[#c41e3a]" />
              <span className="text-white/60 text-xs font-semibold tracking-wider uppercase">Features</span>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-[-0.03em]">
              Everything You Need to Build
              <br className="hidden sm:block" />
              <span className="bg-gradient-to-r from-[#c41e3a] to-[#f97316] bg-clip-text text-transparent">a Winning Team</span>
            </h2>
          </div>

          {/* Feature tabs */}
          <div className="flex justify-center gap-2 mb-16">
            {featureTabs.map((tab, i) => (
              <button
                key={tab.label}
                onClick={() => setActiveFeatureTab(i)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ${
                  activeFeatureTab === i
                    ? "bg-[#c41e3a]/10 border border-[#c41e3a]/30 text-[#e8364f] shadow-lg shadow-[#c41e3a]/10"
                    : "bg-white/[0.03] border border-white/[0.06] text-white/40 hover:text-white/60 hover:bg-white/[0.05]"
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <h3 className="text-2xl sm:text-3xl font-bold mb-5 tracking-tight">{featureTabs[activeFeatureTab].label}</h3>
              <p className="text-white/40 leading-relaxed text-lg mb-8">
                {featureTabs[activeFeatureTab].description}
              </p>

              {/* Mini stats */}
              <div className="grid grid-cols-3 gap-4 mb-8">
                {featureTabs[activeFeatureTab].stats.map((stat) => (
                  <div key={stat.label} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 text-center">
                    <div className="text-lg font-bold text-white font-mono">{stat.value}</div>
                    <div className="text-xs text-white/30 mt-1">{stat.label}</div>
                  </div>
                ))}
              </div>

              <Link href="/signup">
                <Button className="bg-gradient-to-r from-[#c41e3a] to-[#a01830] hover:from-[#d42040] hover:to-[#b01e38] text-white rounded-xl gap-2 shadow-lg shadow-[#c41e3a]/20 hover:shadow-[#c41e3a]/30 transition-all">
                  Try It Free <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>

            <div className="relative group">
              <div className="absolute -inset-6 bg-gradient-to-br from-[#c41e3a]/10 to-transparent rounded-3xl blur-2xl group-hover:from-[#c41e3a]/15 transition-all duration-700" />
              <div className="relative bg-white/[0.03] border border-white/[0.08] rounded-2xl p-2">
                <img
                  src={featureTabs[activeFeatureTab].image}
                  alt={featureTabs[activeFeatureTab].label}
                  className="rounded-xl w-full shadow-2xl transition-all duration-500"
                  loading="lazy"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          ROI — Before & After with glass cards
         ═══════════════════════════════════════════════════════ */}
      <section className="relative py-24 md:py-32">
        <div
          ref={roiReveal.ref}
          className={`relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 transition-all duration-1000 ${
            roiReveal.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-full px-4 py-1.5 mb-6">
              <span className="text-white/60 text-xs font-semibold tracking-wider uppercase">The ROI</span>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-[-0.03em]">
              The Real Cost of Managing
              <br className="hidden sm:block" />
              <span className="text-white/40">Your Team the Old Way</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
            {/* Before */}
            <div className="relative bg-[#0e0e14] border border-white/[0.06] rounded-2xl p-8 overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-[#ef4444] to-[#ef4444]/20" />
              <h3 className="text-xl font-bold text-[#ef4444] mb-6 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#ef4444]" />
                Before Gunner
              </h3>
              <ul className="space-y-5">
                {[
                  { bold: "15+ Hours/Week Reviewing Calls", text: "Manually listening to recordings to catch mistakes" },
                  { bold: "$8K+/Month in Missed Follow-Ups", text: "Deals lost because reps forgot to call back" },
                  { bold: "Zero Visibility Into Performance", text: "No idea who's crushing it or who needs help" },
                  { bold: "Constant Micromanagement", text: "Babysitting reps instead of scaling your business" },
                  { bold: "After-Hours Leads Go Cold", text: "No one available nights and weekends" },
                ].map((item) => (
                  <li key={item.bold} className="flex items-start gap-3">
                    <span className="mt-1.5 w-4 h-4 rounded-full bg-[#ef4444]/10 border border-[#ef4444]/20 flex items-center justify-center shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#ef4444]" />
                    </span>
                    <div>
                      <span className="font-semibold text-white/80 text-sm">{item.bold}</span>
                      <span className="text-white/30 text-xs block mt-0.5">{item.text}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* After */}
            <div className="relative bg-[#0e0e14] border border-[#22c55e]/20 rounded-2xl p-8 overflow-hidden shadow-lg shadow-[#22c55e]/5">
              <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-[#22c55e] to-[#22c55e]/20" />
              <h3 className="text-xl font-bold text-[#22c55e] mb-6 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#22c55e]" />
                With Gunner
              </h3>
              <ul className="space-y-5">
                {[
                  { bold: "0 Hours Reviewing Calls", text: "Every call automatically scored with detailed feedback" },
                  { bold: "$0 Lost to Missed Follow-Ups", text: "Signals alert you instantly when reps drop the ball" },
                  { bold: "Real-Time Performance Dashboard", text: "See exactly who's performing and who needs coaching" },
                  { bold: "Team Self-Manages", text: "Daily rankings create healthy competition automatically" },
                  { bold: "Never Miss a Critical Moment", text: "AI flags off-script moments, pricing errors, and missed objections" },
                ].map((item) => (
                  <li key={item.bold} className="flex items-start gap-3">
                    <span className="mt-1 w-4 h-4 rounded-full bg-[#22c55e]/10 border border-[#22c55e]/20 flex items-center justify-center shrink-0">
                      <Check className="w-2.5 h-2.5 text-[#22c55e]" />
                    </span>
                    <div>
                      <span className="font-semibold text-white/80 text-sm">{item.bold}</span>
                      <span className="text-white/30 text-xs block mt-0.5">{item.text}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* ROI Banner */}
          <div className="mt-12 relative max-w-5xl mx-auto">
            <div className="absolute inset-0 bg-gradient-to-r from-[#c41e3a] to-[#a01830] rounded-2xl blur-xl opacity-30" />
            <div className="relative bg-gradient-to-r from-[#c41e3a] to-[#a01830] rounded-2xl py-8 px-8 text-center">
              <p className="text-white text-xl sm:text-2xl font-extrabold tracking-tight">
                Average Team Sees <span className="font-mono">4.1x</span> ROI Within 90 Days
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          TESTIMONIALS — Glass cards
         ═══════════════════════════════════════════════════════ */}
      <section className="relative py-24 md:py-32">
        <div className="absolute inset-0 bg-gradient-to-b from-[#08080c] via-[#0a0a10] to-[#08080c]" />
        <div
          ref={testimonialsReveal.ref}
          className={`relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 transition-all duration-1000 ${
            testimonialsReveal.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-full px-4 py-1.5 mb-6">
              <span className="text-white/60 text-xs font-semibold tracking-wider uppercase">Testimonials</span>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-[-0.03em]">
              Real Results From
              <br className="hidden sm:block" />
              <span className="text-white/40">Real Wholesalers</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <div
                key={i}
                className="group bg-[#0e0e14] border border-white/[0.06] rounded-2xl p-8 hover:border-white/[0.12] transition-all duration-500"
              >
                <div className="flex gap-1 mb-5">
                  {[...Array(5)].map((_, j) => (
                    <Star key={j} className="h-3.5 w-3.5 fill-[#c41e3a] text-[#c41e3a]" />
                  ))}
                </div>
                <p className="text-white/50 text-sm leading-relaxed mb-6">"{t.quote}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#c41e3a]/30 to-[#c41e3a]/10 flex items-center justify-center border border-white/[0.08]">
                    <span className="text-sm font-bold text-white/80">{t.name.charAt(0)}</span>
                  </div>
                  <div>
                    <p className="font-semibold text-white/80 text-sm">{t.name}</p>
                    <p className="text-xs text-white/30">{t.title}, {t.company}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          PRICING — Glass cards with gradient borders
         ═══════════════════════════════════════════════════════ */}
      <section id="pricing" className="relative py-24 md:py-32">
        <div
          ref={pricingReveal.ref}
          className={`relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 transition-all duration-1000 ${
            pricingReveal.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-full px-4 py-1.5 mb-6">
              <span className="text-white/60 text-xs font-semibold tracking-wider uppercase">Pricing</span>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-[-0.03em] mb-5">
              Simple, Transparent
              <br className="hidden sm:block" />
              <span className="text-white/40">Pricing</span>
            </h2>
            <p className="text-lg text-white/40 max-w-2xl mx-auto mb-8">
              All plans include a {trialDays}-day free trial. Credit card required to start.
            </p>

            {/* Billing toggle */}
            <div className="inline-flex items-center gap-1 p-1 bg-white/[0.04] rounded-xl border border-white/[0.06]">
              <button
                onClick={() => setBillingPeriod("monthly")}
                className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 ${
                  billingPeriod === "monthly"
                    ? "bg-[#c41e3a] text-white shadow-lg shadow-[#c41e3a]/20"
                    : "text-white/40 hover:text-white/60"
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingPeriod("yearly")}
                className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 flex items-center gap-2 ${
                  billingPeriod === "yearly"
                    ? "bg-[#c41e3a] text-white shadow-lg shadow-[#c41e3a]/20"
                    : "text-white/40 hover:text-white/60"
                }`}
              >
                Yearly
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  billingPeriod === "yearly" ? "bg-white/20 text-white" : "bg-[#22c55e]/10 text-[#22c55e]"
                }`}>
                  Save 20%
                </span>
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {plans.map((plan, index) => (
              <div
                key={plan.code || index}
                className={`relative bg-[#0e0e14] rounded-2xl p-8 transition-all duration-500 ${
                  plan.popular
                    ? "border-2 border-[#c41e3a]/40 shadow-xl shadow-[#c41e3a]/10 md:scale-105 z-10"
                    : "border border-white/[0.06] hover:border-white/[0.12]"
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="bg-gradient-to-r from-[#c41e3a] to-[#a01830] text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-lg shadow-[#c41e3a]/20">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="text-center mb-6">
                  <h3 className="text-xl font-bold mb-1">{plan.name}</h3>
                  <p className="text-sm text-white/30">{plan.description}</p>
                </div>

                <div className="text-center mb-8">
                  <span className="text-5xl font-extrabold font-mono tracking-tight">
                    ${billingPeriod === "yearly" ? Math.round((plan.yearlyPrice || plan.price * 10) / 12) : plan.price}
                  </span>
                  <span className="text-white/30 ml-1">/mo</span>
                  {billingPeriod === "yearly" && (
                    <p className="text-xs text-white/20 mt-1">
                      billed annually (${(plan.yearlyPrice || plan.price * 10).toLocaleString()}/yr)
                    </p>
                  )}
                </div>

                <Link href="/signup">
                  <Button
                    className={`w-full mb-6 rounded-xl h-11 transition-all duration-300 ${
                      plan.popular
                        ? "bg-gradient-to-r from-[#c41e3a] to-[#a01830] hover:from-[#d42040] hover:to-[#b01e38] text-white shadow-lg shadow-[#c41e3a]/20"
                        : "bg-white/[0.06] hover:bg-white/[0.1] text-white border border-white/[0.1]"
                    }`}
                  >
                    Start Free Trial
                  </Button>
                </Link>

                <ul className="space-y-3">
                  {plan.features.map((feature, fi) => (
                    <li key={fi} className="flex items-start gap-2.5">
                      <Check className="h-4 w-4 text-[#c41e3a] shrink-0 mt-0.5" />
                      <span className="text-sm text-white/50">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Trust signals */}
          <div className="flex flex-wrap justify-center gap-6 md:gap-10 mt-12 text-sm text-white/25">
            {[
              `${trialDays}-day free trial`,
              "Credit card required",
              "Cancel anytime",
              "Native GoHighLevel integration",
            ].map((signal) => (
              <div key={signal} className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 text-[#c41e3a]/60" />
                <span>{signal}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          INTEGRATIONS
         ═══════════════════════════════════════════════════════ */}
      <section className="relative py-24 md:py-32">
        <div className="absolute inset-0 bg-gradient-to-b from-[#08080c] via-[#0a0a10] to-[#08080c]" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-full px-4 py-1.5 mb-6">
              <span className="text-white/60 text-xs font-semibold tracking-wider uppercase">Integrations</span>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-[-0.03em]">
              Works Natively With
              <br className="hidden sm:block" />
              <span className="text-white/40">the Tools You Already Use</span>
            </h2>
          </div>

          <div className="max-w-3xl mx-auto bg-[#0e0e14] border border-white/[0.06] rounded-2xl p-8 md:p-12 text-center">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="w-16 h-16 bg-white/[0.04] border border-white/[0.08] rounded-2xl flex items-center justify-center">
                <Zap className="h-8 w-8 text-[#c41e3a]" />
              </div>
            </div>
            <div className="flex items-center justify-center gap-2 mb-4">
              <h3 className="text-2xl font-bold">GoHighLevel</h3>
              <span className="bg-[#c41e3a]/10 border border-[#c41e3a]/20 text-[#e8364f] text-xs font-bold px-3 py-1 rounded-full">
                Native
              </span>
            </div>
            <p className="text-white/40 max-w-lg mx-auto">
              Gunner connects directly to your GoHighLevel account. Calls sync automatically — no Zapier, no manual uploads, no friction.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-4 mt-8">
            {["BatchDialer", "BatchLeads"].map((name) => (
              <div key={name} className="flex items-center gap-2 bg-white/[0.03] border border-white/[0.06] rounded-xl px-6 py-3">
                <Shield className="h-4 w-4 text-white/20" />
                <span className="text-sm font-medium text-white/40">{name}</span>
                <span className="text-xs text-white/20 bg-white/[0.04] px-2 py-0.5 rounded">Integrated</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          ABOUT / THE STORY
         ═══════════════════════════════════════════════════════ */}
      <section id="about" className="relative py-24 md:py-32">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-full px-4 py-1.5 mb-6">
              <span className="text-white/60 text-xs font-semibold tracking-wider uppercase">Our Story</span>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-[-0.03em]">
              Built by a Wholesaler,
              <br className="hidden sm:block" />
              <span className="text-white/40">for Wholesalers</span>
            </h2>
          </div>

          <div className="max-w-3xl mx-auto">
            <div className="bg-[#0e0e14] border border-white/[0.06] rounded-2xl p-8 md:p-12">
              <div className="flex items-start gap-5 mb-6">
                <div className="flex -space-x-3">
                  <div className="w-14 h-14 bg-gradient-to-br from-[#c41e3a]/30 to-[#c41e3a]/10 rounded-full flex items-center justify-center shrink-0 border-2 border-[#0e0e14] z-10">
                    <span className="text-xl font-bold text-white/80">C</span>
                  </div>
                  <div className="w-14 h-14 bg-gradient-to-br from-[#f97316]/30 to-[#f97316]/10 rounded-full flex items-center justify-center shrink-0 border-2 border-[#0e0e14]">
                    <span className="text-xl font-bold text-white/80">P</span>
                  </div>
                </div>
                <div>
                  <h3 className="text-xl font-bold">Corey & Pablo</h3>
                  <p className="text-sm text-white/30">Co-Founders, Gunner AI</p>
                </div>
              </div>
              <div className="space-y-4 text-white/40 leading-relaxed">
                <p>
                  Gunner AI was built out of a real problem. Running wholesaling teams with 10+ reps, we spent hours every week listening to call recordings, trying to figure out who needed coaching and who was letting deals slip.
                </p>
                <p>
                  We tried every sales tool on the market — none of them understood real estate wholesaling. The generic call analytics tools didn't know what an ARV was, couldn't tell if a rep was building rapport or wasting time, and had no idea what a good acquisition call sounds like.
                </p>
                <p>
                  So we built Gunner. Purpose-built for wholesalers, by wholesalers. It grades calls the way an experienced operations manager would — but it does it instantly, for every single call, without ever taking a day off.
                </p>
                <p className="font-medium text-white/70">
                  This is the tool we wish we had when we started scaling.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          FAQ — Minimal accordion
         ═══════════════════════════════════════════════════════ */}
      <section className="relative py-24 md:py-32">
        <div className="absolute inset-0 bg-gradient-to-b from-[#08080c] via-[#0a0a10] to-[#08080c]" />
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-full px-4 py-1.5 mb-6">
              <span className="text-white/60 text-xs font-semibold tracking-wider uppercase">FAQ</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-[-0.03em]">
              Frequently Asked Questions
            </h2>
          </div>

          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div key={i} className="bg-[#0e0e14] border border-white/[0.06] rounded-xl overflow-hidden hover:border-white/[0.1] transition-colors">
                <button
                  onClick={() => toggleFaq(i)}
                  className="w-full flex items-center justify-between p-5 text-left"
                >
                  <span className="font-semibold text-white/80 pr-4 text-sm">{faq.q}</span>
                  <ChevronDown className={`h-4 w-4 text-white/20 shrink-0 transition-transform duration-300 ${openFaq.includes(i) ? "rotate-180" : ""}`} />
                </button>
                <div className={`overflow-hidden transition-all duration-300 ${openFaq.includes(i) ? "max-h-96" : "max-h-0"}`}>
                  <div className="px-5 pb-5 text-white/40 text-sm leading-relaxed">
                    {faq.a}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          FINAL CTA — Gradient banner
         ═══════════════════════════════════════════════════════ */}
      <section id="final-cta" className="relative py-24 md:py-32">
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-r from-[#c41e3a]/20 via-[#c41e3a]/10 to-transparent" />
          <div className="absolute top-0 left-[30%] w-[500px] h-[500px] bg-[#c41e3a]/[0.08] rounded-full blur-[120px]" />
        </div>
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-[-0.03em] mb-5">
            Ready to Stop Babysitting
            <br className="hidden sm:block" />
            <span className="bg-gradient-to-r from-[#c41e3a] to-[#f97316] bg-clip-text text-transparent">and Start Scaling?</span>
          </h2>
          <p className="text-lg text-white/40 mb-10 max-w-xl mx-auto">
            Start your {trialDays}-day free trial and see exactly how Gunner AI can increase your team's close rate in the next 30 days.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/signup">
              <Button size="lg" className="bg-gradient-to-r from-[#c41e3a] to-[#a01830] hover:from-[#d42040] hover:to-[#b01e38] text-white rounded-xl text-lg px-10 h-14 gap-2 font-bold shadow-xl shadow-[#c41e3a]/25 hover:shadow-[#c41e3a]/40 transition-all duration-300 hover:-translate-y-0.5">
                Start {trialDays}-Day Free Trial <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
            <a href="mailto:corey@getgunner.ai?subject=Gunner%20AI%20Demo%20Request&body=Hi%20Corey%2C%0A%0AI%27d%20like%20to%20schedule%20a%20demo%20of%20Gunner%20AI%20for%20my%20team.%0A%0ATeam%20size%3A%20%0ACurrent%20CRM%3A%20%0A%0AThanks!">
              <Button size="lg" variant="outline" className="border-white/10 text-white/70 hover:text-white hover:bg-white/[0.06] hover:border-white/20 rounded-xl text-lg px-10 h-14 gap-2 font-bold bg-transparent transition-all duration-300">
                <MessageSquare className="h-5 w-5" /> Book a Demo
              </Button>
            </a>
          </div>

          <p className="text-sm text-white/20 mt-6">
            {trialDays}-day free trial. Credit card required. Cancel anytime.
          </p>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          FOOTER — Dark with grid pattern
         ═══════════════════════════════════════════════════════ */}
      <footer className="relative border-t border-white/[0.06] py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-5 gap-12 mb-12">
            <div className="md:col-span-1">
              <img src={GUNNER_LOGO} alt="Gunner AI" className="h-9 w-auto mb-4" style={{ mixBlendMode: 'screen' }} />
              <p className="text-sm text-white/25">
                Built for real estate wholesalers who scale.
              </p>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-white/60 mb-4">Product</h4>
              <ul className="space-y-2.5">
                {[
                  { label: "Features", target: "features" },
                  { label: "How It Works", target: "how-it-works" },
                  { label: "Pricing", target: "pricing" },
                ].map((link) => (
                  <li key={link.label}>
                    <button
                      onClick={() => scrollTo(link.target)}
                      className="text-sm text-white/25 hover:text-white/60 transition-colors"
                    >
                      {link.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-white/60 mb-4">Company</h4>
              <ul className="space-y-2.5">
                <li>
                  <button onClick={() => scrollTo("about")} className="text-sm text-white/25 hover:text-white/60 transition-colors">
                    About
                  </button>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-white/60 mb-4">Support</h4>
              <ul className="space-y-2.5">
                <li>
                  <a href="mailto:corey@getgunner.ai" className="text-sm text-white/25 hover:text-white/60 transition-colors">
                    corey@getgunner.ai
                  </a>
                </li>
                <li>
                  <Link href="/signup" className="text-sm text-white/25 hover:text-white/60 transition-colors">
                    Start Free Trial
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-white/60 mb-4">Legal</h4>
              <ul className="space-y-2.5">
                <li>
                  <Link href="/privacy" className="text-sm text-white/25 hover:text-white/60 transition-colors">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className="text-sm text-white/25 hover:text-white/60 transition-colors">
                    Terms of Service
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-white/[0.06] pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-white/20">
              &copy; {new Date().getFullYear()} Gunner AI. All rights reserved.
            </p>
            <div className="flex gap-4">
              <a href="#" className="text-white/20 hover:text-white/50 transition-colors" aria-label="LinkedIn">
                <Linkedin className="h-4 w-4" />
              </a>
              <a href="#" className="text-white/20 hover:text-white/50 transition-colors" aria-label="Twitter">
                <Twitter className="h-4 w-4" />
              </a>
              <a href="#" className="text-white/20 hover:text-white/50 transition-colors" aria-label="YouTube">
                <Youtube className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
