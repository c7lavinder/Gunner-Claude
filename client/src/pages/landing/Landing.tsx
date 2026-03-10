import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export function Landing() {
  return (
    <div className="min-h-screen bg-[var(--g-bg-base)]">
      <nav className="sticky top-0 z-50 flex items-center justify-between px-6 py-4 border-b border-[var(--g-border-subtle)] bg-[var(--g-nav-bg)] backdrop-blur-xl">
        <div className="obs-topnav-brand flex items-center gap-2">
          <div className="obs-logo-mark flex items-center justify-center text-white text-sm font-black">
            G
          </div>
          <span>Gunner</span>
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
        <section className="g-mesh-bg relative py-24 px-6">
          <div className="max-w-3xl mx-auto text-center space-y-8">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
              Empower Your Team to Perform at Their Best
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              AI-powered call coaching that drives results.
            </p>
            <Link href="/login">
              <Button size="lg">Get Started</Button>
            </Link>
          </div>
        </section>
        <section className="py-20 px-6 border-t border-[var(--g-border-subtle)]">
          <div className="max-w-4xl mx-auto grid gap-12 md:grid-cols-3">
            <div className="space-y-2">
              <h3 className="font-semibold text-lg">Training</h3>
              <p className="text-muted-foreground text-sm">
                Structured learning paths and roleplay practice.
              </p>
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-lg">Accountability</h3>
              <p className="text-muted-foreground text-sm">
                Clear metrics and visibility into team performance.
              </p>
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-lg">Efficient Operations</h3>
              <p className="text-muted-foreground text-sm">
                Streamlined workflows and actionable insights.
              </p>
            </div>
          </div>
        </section>
        <section className="py-16 px-6 text-center">
          <Link href="/login">
            <Button size="lg">Start Free Trial</Button>
          </Link>
        </section>
      </main>
    </div>
  );
}
