import { Link } from "wouter";
import { GraduationCap, BarChart3, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function Landing() {
  return (
    <div className="dark min-h-screen scroll-smooth bg-[var(--g-bg-base)]">
      <nav className="g-glass sticky top-0 z-50 flex items-center justify-between px-6 py-4">
        <a href="/" className="obs-topnav-brand flex items-center gap-2">
          <div className="obs-logo-mark flex items-center justify-center text-white text-sm font-black">
            G
          </div>
          <span>Gunner</span>
        </a>
        <div className="hidden md:flex items-center gap-1">
          <a href="#features" className="obs-topnav-tab">Features</a>
          <a href="#how-it-works" className="obs-topnav-tab">How It Works</a>
          <a href="#pricing" className="obs-topnav-tab">Pricing</a>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login">
            <Button variant="ghost">Sign In</Button>
          </Link>
          <Link href="/login">
            <Button>Get Started</Button>
          </Link>
        </div>
      </nav>

      <main>
        <section id="hero" className="g-mesh-bg relative py-24 px-6">
          <div className="max-w-3xl mx-auto text-center space-y-8">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
              <span className="g-gradient-text">Empower</span> Your Team to Perform at Their Best
            </h1>
            <p className="text-lg text-[var(--g-text-secondary)] max-w-2xl mx-auto">
              <span className="g-gradient-text">AI-powered</span> coaching that makes every rep better through training, accountability, and efficient operations.
            </p>
            <Link href="/login">
              <Button size="lg">Start Free Trial</Button>
            </Link>
            <p className="text-sm text-[var(--g-text-tertiary)]">
              14-day free trial • 5-minute setup • Cancel anytime
            </p>
          </div>
        </section>

        <section id="features" className="py-20 px-6 border-t border-[var(--g-border-subtle)]">
          <div className="max-w-5xl mx-auto grid gap-8 md:grid-cols-3">
            <Card className="border-[var(--g-border-subtle)] bg-[var(--g-bg-card)]">
              <CardContent className="pt-6">
                <div className="w-12 h-12 rounded-xl bg-[var(--g-accent-soft)] flex items-center justify-center mb-4">
                  <GraduationCap className="size-6 text-[var(--g-accent-text)]" />
                </div>
                <h3 className="font-semibold text-lg mb-2">Training</h3>
                <p className="text-[var(--g-text-secondary)] text-sm">
                  AI coaching that turns every call into a learning moment.
                </p>
              </CardContent>
            </Card>
            <Card className="border-[var(--g-border-subtle)] bg-[var(--g-bg-card)]">
              <CardContent className="pt-6">
                <div className="w-12 h-12 rounded-xl bg-[var(--g-accent-soft)] flex items-center justify-center mb-4">
                  <BarChart3 className="size-6 text-[var(--g-accent-text)]" />
                </div>
                <h3 className="font-semibold text-lg mb-2">Accountability</h3>
                <p className="text-[var(--g-text-secondary)] text-sm">
                  Grades, KPIs, and leaderboards that drive performance.
                </p>
              </CardContent>
            </Card>
            <Card className="border-[var(--g-border-subtle)] bg-[var(--g-bg-card)]">
              <CardContent className="pt-6">
                <div className="w-12 h-12 rounded-xl bg-[var(--g-accent-soft)] flex items-center justify-center mb-4">
                  <Zap className="size-6 text-[var(--g-accent-text)]" />
                </div>
                <h3 className="font-semibold text-lg mb-2">Efficient Operations</h3>
                <p className="text-[var(--g-text-secondary)] text-sm">
                  One-click actions — AI does the busywork so your team closes deals.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        <section id="how-it-works" className="py-20 px-6 border-t border-[var(--g-border-subtle)] bg-[var(--g-bg-surface)]">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold text-center mb-16">How It Works</h2>
            <div className="grid gap-12 md:grid-cols-3">
              <div className="text-center">
                <div className="w-14 h-14 rounded-full bg-[var(--g-accent-soft)] border-2 border-[var(--g-accent-medium)] flex items-center justify-center mx-auto mb-4 text-xl font-bold text-[var(--g-accent-text)]">
                  1
                </div>
                <h3 className="font-semibold text-lg mb-2">Connect Your CRM</h3>
                <p className="text-[var(--g-text-secondary)] text-sm">
                  Sync calls automatically. No manual uploads.
                </p>
              </div>
              <div className="text-center">
                <div className="w-14 h-14 rounded-full bg-[var(--g-accent-soft)] border-2 border-[var(--g-accent-medium)] flex items-center justify-center mx-auto mb-4 text-xl font-bold text-[var(--g-accent-text)]">
                  2
                </div>
                <h3 className="font-semibold text-lg mb-2">AI Grades Every Call</h3>
                <p className="text-[var(--g-text-secondary)] text-sm">
                  Instant feedback and coaching insights.
                </p>
              </div>
              <div className="text-center">
                <div className="w-14 h-14 rounded-full bg-[var(--g-accent-soft)] border-2 border-[var(--g-accent-medium)] flex items-center justify-center mx-auto mb-4 text-xl font-bold text-[var(--g-accent-text)]">
                  3
                </div>
                <h3 className="font-semibold text-lg mb-2">Team Levels Up</h3>
                <p className="text-[var(--g-text-secondary)] text-sm">
                  Continuous improvement across the board.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="pricing" className="py-24 px-6 border-t border-[var(--g-border-subtle)]">
          <div className="max-w-2xl mx-auto text-center space-y-6">
            <h2 className="text-3xl font-bold">Ready to Empower Your Team?</h2>
            <Link href="/login">
              <Button size="lg">Get Started</Button>
            </Link>
          </div>
        </section>

        <footer className="py-12 px-6 border-t border-[var(--g-border-subtle)]">
          <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
            <a href="/" className="obs-topnav-brand flex items-center gap-2">
              <div className="obs-logo-mark flex items-center justify-center text-white text-xs font-black">
                G
              </div>
              <span>Gunner</span>
            </a>
            <div className="flex items-center gap-6 text-sm text-[var(--g-text-tertiary)]">
              <a href="#" className="hover:text-[var(--g-text-secondary)]">Privacy</a>
              <a href="#" className="hover:text-[var(--g-text-secondary)]">Terms</a>
            </div>
          </div>
          <p className="text-center text-xs text-[var(--g-text-tertiary)] mt-6">
            © {new Date().getFullYear()} Gunner. All rights reserved.
          </p>
        </footer>
      </main>
    </div>
  );
}
