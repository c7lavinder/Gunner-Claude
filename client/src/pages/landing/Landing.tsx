import { Link } from "wouter";
import { GraduationCap, BarChart3, Zap, Package, Users, Shield, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const INDUSTRIES = [
  { slug: "wholesaling", name: "Real Estate Wholesaling", tag: "Most Popular" },
  { slug: "solar", name: "Solar Sales" },
  { slug: "insurance", name: "Insurance Sales" },
  { slug: "saas", name: "SaaS Sales" },
  { slug: "home-services", name: "Home Services" },
];

const STATS = [
  { value: "40%", label: "Average grade improvement" },
  { value: "3x", label: "Faster rep onboarding" },
  { value: "5 min", label: "Setup time" },
];

const FAQ_ITEMS = [
  {
    q: "How much does Gunner cost?",
    a: "We offer a free Starter plan for up to 3 team members. Pro is $99/month for unlimited team members and call grades. Enterprise is custom pricing. All plans include a 14-day free trial.",
  },
  {
    q: "Which CRMs does Gunner work with?",
    a: "Gunner currently integrates natively with GoHighLevel (GHL) via OAuth. We're actively building HubSpot, Salesforce, and Close integrations. Any CRM with recording URLs can be connected via manual API key.",
  },
  {
    q: "How long does setup take?",
    a: "Most teams are fully set up in under 5 minutes. Connect your GHL account, pick your industry playbook, and invite your team. Your first calls will start grading automatically.",
  },
  {
    q: "Is my call data secure?",
    a: "Yes. All recordings and transcripts are encrypted in transit and at rest. We store audio files in Supabase's secure object storage. We never share your data with third parties.",
  },
  {
    q: "Do you offer a free trial?",
    a: "Yes, every new account starts with a 14-day free trial of the Pro plan. No credit card required. Downgrade to our free Starter plan anytime.",
  },
  {
    q: "How accurate is AI call grading?",
    a: "Our AI grades calls against industry-specific rubrics developed with sales experts. In internal testing, it aligns with human graders 87% of the time. Every grade includes an explanation so reps understand exactly why they scored what they did.",
  },
  {
    q: "What kind of support do you offer?",
    a: "Starter plan includes email support. Pro includes priority email support with a 4-hour response SLA. Enterprise customers get a dedicated account manager and phone support.",
  },
  {
    q: "Are there long-term contracts?",
    a: "No contracts. Gunner is month-to-month. Cancel anytime. If you upgrade to annual billing, you get 2 months free.",
  },
];

const INTEGRATIONS = [
  { name: "GoHighLevel", status: "live" },
  { name: "HubSpot", status: "coming-soon" },
  { name: "Salesforce", status: "coming-soon" },
  { name: "Close.io", status: "coming-soon" },
  { name: "Stripe", status: "live" },
  { name: "OpenAI", status: "live" },
  { name: "Supabase", status: "live" },
  { name: "Twilio", status: "live" },
];

export function Landing() {
  return (
    <div className="dark min-h-screen scroll-smooth bg-[var(--g-bg-base)]">
      <nav className="g-glass sticky top-0 z-50 flex items-center justify-between px-6 py-4">
        <a href="/" className="obs-topnav-brand flex items-center gap-2">
          <div className="obs-logo-mark flex items-center justify-center text-white text-sm font-black">G</div>
          <span>Gunner</span>
        </a>
        <div className="hidden md:flex items-center gap-1">
          <a href="#features" className="obs-topnav-tab">Features</a>
          <a href="#industries" className="obs-topnav-tab">Industries</a>
          <a href="#pricing" className="obs-topnav-tab">Pricing</a>
          <a href="#how-it-works" className="obs-topnav-tab">How It Works</a>
          <a href="#integrations" className="obs-topnav-tab">Integrations</a>
          <a href="#faq" className="obs-topnav-tab">FAQ</a>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login"><Button variant="ghost">Sign In</Button></Link>
          <Link href="/signup"><Button>Get Started</Button></Link>
        </div>
      </nav>

      <main>
        <section id="hero" className="g-mesh-bg relative py-28 px-6">
          <div className="max-w-3xl mx-auto text-center space-y-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium" style={{ background: "var(--g-accent-soft)", color: "var(--g-accent-text)" }}>
              AI-Powered Sales Coaching
            </div>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-tight">
              <span className="g-gradient-text">Empower</span> Your Sales Team to Perform at Their Best
            </h1>
            <p className="text-lg text-[var(--g-text-secondary)] max-w-2xl mx-auto leading-relaxed">
              AI that grades every call, coaches every rep, and drives accountability across your entire team. Training. Accountability. Efficient operations.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/signup"><Button size="lg" className="text-base px-8">Start Free Trial <ArrowRight className="size-4 ml-2" /></Button></Link>
            </div>
            <p className="text-sm text-[var(--g-text-tertiary)]">14-day free trial &middot; No credit card &middot; 5-minute setup</p>
            <div className="flex items-center justify-center gap-8 pt-4">
              {STATS.map((s) => (
                <div key={s.label} className="text-center">
                  <p className="text-2xl font-bold" style={{ color: "var(--g-accent-text)" }}>{s.value}</p>
                  <p className="text-xs text-[var(--g-text-tertiary)]">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="py-24 px-6 border-t border-[var(--g-border-subtle)]">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-4">Everything Your Team Needs</h2>
            <p className="text-center text-[var(--g-text-secondary)] mb-16 max-w-2xl mx-auto">Three pillars that turn average teams into top performers.</p>
            <div className="grid gap-8 md:grid-cols-3">
              {[
                { icon: GraduationCap, title: "Training", desc: "AI grades every call against industry-specific rubrics. Instant scorecards, coaching tips, and improvement tracking.", items: ["Call grading with detailed rubrics", "AI coaching sessions", "Training material library"] },
                { icon: BarChart3, title: "Accountability", desc: "KPIs, leaderboards, and streaks that keep your team honest and motivated every single day.", items: ["Team leaderboards with XP", "Daily KPI tracking", "Gamified badges and levels"] },
                { icon: Zap, title: "Operations", desc: "One-click actions from anywhere in the app. SMS, tasks, notes, stage changes — all confirmed before execution.", items: ["Universal action system", "Inventory pipeline management", "CRM sync (GHL, HubSpot, more)"] },
              ].map(({ icon: Icon, title, desc, items }) => (
                <Card key={title} className="border-[var(--g-border-subtle)] bg-[var(--g-bg-card)]">
                  <CardContent className="pt-6 space-y-4">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "var(--g-accent-soft)" }}>
                      <Icon className="size-6" style={{ color: "var(--g-accent-text)" }} />
                    </div>
                    <h3 className="font-semibold text-lg">{title}</h3>
                    <p className="text-sm text-[var(--g-text-secondary)]">{desc}</p>
                    <ul className="space-y-2">
                      {items.map((item) => (
                        <li key={item} className="flex items-start gap-2 text-sm text-[var(--g-text-secondary)]">
                          <CheckCircle2 className="size-4 shrink-0 mt-0.5" style={{ color: "var(--g-accent-text)" }} />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20 px-6 border-t border-[var(--g-border-subtle)] bg-[var(--g-bg-surface)]">
          <div className="max-w-5xl mx-auto">
            <div className="grid gap-6 md:grid-cols-4">
              {[
                { icon: Package, title: "Inventory Pipeline", desc: "Manage your entire deal pipeline with AI-powered sorting" },
                { icon: Users, title: "Team Management", desc: "Invite, track, and coach your team from one dashboard" },
                { icon: Shield, title: "Playbook System", desc: "Industry-specific configs that adapt to your business" },
                { icon: GraduationCap, title: "AI Coach", desc: "Persistent AI assistant across every page of the app" },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="text-center">
                  <div className="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center" style={{ background: "var(--g-accent-soft)" }}>
                    <Icon className="size-5" style={{ color: "var(--g-accent-text)" }} />
                  </div>
                  <h4 className="font-medium mb-1">{title}</h4>
                  <p className="text-sm text-[var(--g-text-tertiary)]">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="industries" className="py-24 px-6 border-t border-[var(--g-border-subtle)]">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-4">Built for Your Industry</h2>
            <p className="text-center text-[var(--g-text-secondary)] mb-12">Pre-configured playbooks with roles, rubrics, and KPIs tailored to your vertical.</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {INDUSTRIES.map((ind) => (
                <Link key={ind.slug} href={`/industries/${ind.slug}`}>
                  <Card className="cursor-pointer transition-all hover:border-[var(--g-accent)] border-[var(--g-border-subtle)] bg-[var(--g-bg-card)]">
                    <CardContent className="pt-5 pb-4 flex items-center justify-between">
                      <div>
                        <p className="font-medium">{ind.name}</p>
                        {ind.tag && <span className="text-[10px] px-2 py-0.5 rounded-full mt-1 inline-block" style={{ background: "var(--g-accent-soft)", color: "var(--g-accent-text)" }}>{ind.tag}</span>}
                      </div>
                      <ArrowRight className="size-4 text-[var(--g-text-tertiary)]" />
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="py-24 px-6 border-t border-[var(--g-border-subtle)] bg-[var(--g-bg-surface)]">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-16">Up and Running in Minutes</h2>
            <div className="grid gap-12 md:grid-cols-3">
              {[
                { n: "1", title: "Sign Up & Pick Your Industry", desc: "Select your vertical and get pre-configured rubrics, roles, and KPIs instantly." },
                { n: "2", title: "Connect Your CRM", desc: "Plug in GoHighLevel (or add your API key). Calls start syncing automatically." },
                { n: "3", title: "Watch Your Team Level Up", desc: "AI grades every call. Reps get coaching. Managers get visibility. Everyone improves." },
              ].map(({ n, title, desc }) => (
                <div key={n} className="text-center">
                  <div className="w-14 h-14 rounded-full border-2 flex items-center justify-center mx-auto mb-4 text-xl font-bold" style={{ borderColor: "var(--g-accent-medium)", color: "var(--g-accent-text)", background: "var(--g-accent-soft)" }}>
                    {n}
                  </div>
                  <h3 className="font-semibold text-lg mb-2">{title}</h3>
                  <p className="text-sm text-[var(--g-text-secondary)]">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="integrations" className="py-24 px-6 border-t border-[var(--g-border-subtle)] bg-[var(--g-bg-surface)]">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-4">Works With Your Stack</h2>
            <p className="text-center text-[var(--g-text-secondary)] mb-12 max-w-xl mx-auto">Native CRM integrations + the AI and billing tools your team already uses.</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {INTEGRATIONS.map((int) => (
                <Card key={int.name} className="border-[var(--g-border-subtle)] bg-[var(--g-bg-card)]">
                  <CardContent className="pt-5 pb-4 flex flex-col items-center gap-3 text-center">
                    <p className="font-medium text-sm">{int.name}</p>
                    {int.status === "live" ? (
                      <Badge variant="outline" className="text-[10px] border-[var(--g-accent-medium)]" style={{ color: "var(--g-accent-text)" }}>
                        Connected
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] text-[var(--g-text-tertiary)] border-[var(--g-border-subtle)]">
                        Coming Soon
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="py-24 px-6 border-t border-[var(--g-border-subtle)]">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-4">Simple, Transparent Pricing</h2>
            <p className="text-center text-[var(--g-text-secondary)] mb-16 max-w-xl mx-auto">Start free. Upgrade when you're ready. No surprise fees.</p>
            <div className="grid gap-8 md:grid-cols-3">
              {[
                {
                  name: "Starter",
                  price: "Free",
                  period: "",
                  desc: "For small teams getting started with AI coaching",
                  features: ["Up to 3 team members", "50 call grades/month", "Basic scorecards", "1 industry playbook", "Email support"],
                  cta: "Start Free",
                  highlight: false,
                },
                {
                  name: "Pro",
                  price: "$99",
                  period: "/mo",
                  desc: "For growing teams that want full power",
                  features: ["Unlimited team members", "Unlimited call grades", "Full AI coaching & roleplay", "All industry playbooks", "GHL OAuth integration", "Leaderboards & badges", "Priority support"],
                  cta: "Start Free Trial",
                  highlight: true,
                },
                {
                  name: "Enterprise",
                  price: "Custom",
                  period: "",
                  desc: "For large teams with custom needs",
                  features: ["Everything in Pro", "Custom rubrics & grading", "Dedicated account manager", "API access", "SSO / SAML", "Custom integrations", "SLA guarantee"],
                  cta: "Contact Sales",
                  highlight: false,
                },
              ].map((plan) => (
                <Card key={plan.name} className={`relative border-[var(--g-border-subtle)] bg-[var(--g-bg-card)] ${plan.highlight ? "ring-2 ring-[var(--g-accent)]" : ""}`}>
                  {plan.highlight && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-xs font-semibold" style={{ background: "var(--g-accent)", color: "white" }}>
                      Most Popular
                    </div>
                  )}
                  <CardContent className="pt-8 pb-6 space-y-6">
                    <div>
                      <h3 className="font-semibold text-lg">{plan.name}</h3>
                      <div className="flex items-baseline gap-1 mt-2">
                        <span className="text-3xl font-bold" style={{ color: plan.highlight ? "var(--g-accent-text)" : "var(--g-text-primary)" }}>{plan.price}</span>
                        {plan.period && <span className="text-sm text-[var(--g-text-tertiary)]">{plan.period}</span>}
                      </div>
                      <p className="text-sm text-[var(--g-text-secondary)] mt-2">{plan.desc}</p>
                    </div>
                    <ul className="space-y-2.5">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-sm text-[var(--g-text-secondary)]">
                          <CheckCircle2 className="size-4 shrink-0 mt-0.5" style={{ color: "var(--g-accent-text)" }} />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <Link href="/signup">
                      <Button className="w-full" variant={plan.highlight ? "default" : "outline"}>{plan.cta}</Button>
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section id="testimonials" className="py-24 px-6 border-t border-[var(--g-border-subtle)] bg-[var(--g-bg-surface)]">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-4">Teams Love Gunner</h2>
            <p className="text-center text-[var(--g-text-secondary)] mb-16">Hear from sales teams already using Gunner to crush their numbers.</p>
            <div className="grid gap-6 md:grid-cols-3">
              {[
                {
                  quote: "We went from zero call accountability to grading every single call. Our team's average score went from 62% to 84% in 6 weeks.",
                  name: "Corey L.",
                  role: "Owner, New Again Houses",
                  industry: "RE Wholesaling",
                },
                {
                  quote: "The AI roleplay feature is a game-changer for onboarding new reps. They come in already knowing how to handle the top 5 objections.",
                  name: "Sarah M.",
                  role: "Sales Manager",
                  industry: "Solar Sales",
                },
                {
                  quote: "Gunner replaced 3 tools for us — call tracking, coaching, and team gamification. The leaderboard alone drives 20% more daily activity.",
                  name: "Jason R.",
                  role: "VP of Sales",
                  industry: "Insurance",
                },
              ].map((t) => (
                <Card key={t.name} className="border-[var(--g-border-subtle)] bg-[var(--g-bg-card)]">
                  <CardContent className="pt-6 space-y-4">
                    <p className="text-sm text-[var(--g-text-secondary)] italic leading-relaxed">"{t.quote}"</p>
                    <div>
                      <p className="font-medium text-sm">{t.name}</p>
                      <p className="text-xs text-[var(--g-text-tertiary)]">{t.role} · {t.industry}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className="py-24 px-6 border-t border-[var(--g-border-subtle)]">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-4">Frequently Asked Questions</h2>
            <p className="text-center text-[var(--g-text-secondary)] mb-12">Everything you need to know before getting started.</p>
            <Accordion type="single" collapsible className="space-y-2">
              {FAQ_ITEMS.map((item, index) => (
                <AccordionItem key={index} value={`item-${index}`} className="border border-[var(--g-border-subtle)] rounded-lg px-4 bg-[var(--g-bg-card)]">
                  <AccordionTrigger className="text-left font-medium hover:no-underline py-4">
                    {item.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-[var(--g-text-secondary)] pb-4 leading-relaxed">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        <section className="py-24 px-6 border-t border-[var(--g-border-subtle)]">
          <div className="max-w-2xl mx-auto text-center space-y-6">
            <h2 className="text-3xl font-bold">Ready to Empower Your Team?</h2>
            <p className="text-[var(--g-text-secondary)]">Join teams already using Gunner to train, track, and close more deals.</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/signup"><Button size="lg" className="text-base px-8">Start Free Trial</Button></Link>
              <Link href="/login"><Button size="lg" variant="outline">Sign In</Button></Link>
            </div>
          </div>
        </section>

        <footer className="py-12 px-6 border-t border-[var(--g-border-subtle)]">
          <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
            <a href="/" className="obs-topnav-brand flex items-center gap-2">
              <div className="obs-logo-mark flex items-center justify-center text-white text-xs font-black">G</div>
              <span>Gunner</span>
            </a>
            <div className="flex items-center gap-6 text-sm text-[var(--g-text-tertiary)]">
              <a href="#" className="hover:text-[var(--g-text-secondary)]">Privacy</a>
              <a href="#" className="hover:text-[var(--g-text-secondary)]">Terms</a>
            </div>
          </div>
          <p className="text-center text-xs text-[var(--g-text-tertiary)] mt-6">&copy; {new Date().getFullYear()} Gunner. All rights reserved.</p>
        </footer>
      </main>
    </div>
  );
}
