import { Link, useParams, Redirect } from "wouter";
import { GraduationCap, BarChart3, Zap, Quote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getIndustryConfig } from "./industryConfigs";

const FEATURE_ICONS = [GraduationCap, BarChart3, Zap];

export function IndustryLanding() {
  const { industry } = useParams() as { industry?: string };
  const config = industry ? getIndustryConfig(industry) : null;

  if (!industry || !config) {
    return <Redirect to="/" />;
  }

  return (
    <div className="dark min-h-screen scroll-smooth bg-[var(--g-bg-base)]">
      <nav className="g-glass sticky top-0 z-50 flex items-center justify-between px-6 py-4">
        <Link href="/" className="obs-topnav-brand flex items-center gap-2">
          <div className="obs-logo-mark flex items-center justify-center text-white text-sm font-black">
            G
          </div>
          <span>Gunner</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost">Back to Home</Button>
          </Link>
          <Link href="/signup">
            <Button>Get Started</Button>
          </Link>
        </div>
      </nav>

      <main>
        <section className="g-mesh-bg relative py-24 px-6">
          <div className="max-w-3xl mx-auto text-center space-y-8">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
              <span className="g-gradient-text">{config.headline}</span>
            </h1>
            <p className="text-lg text-[var(--g-text-secondary)] max-w-2xl mx-auto">
              {config.subtext}
            </p>
            <Link href="/signup">
              <Button size="lg">{config.ctaText}</Button>
            </Link>
          </div>
        </section>

        <section className="py-20 px-6 border-t border-[var(--g-border-subtle)]">
          <div className="max-w-5xl mx-auto grid gap-8 md:grid-cols-3">
            {config.features.map((f, i) => {
              const Icon = FEATURE_ICONS[i % FEATURE_ICONS.length];
              return (
                <Card key={f.title} className="border-[var(--g-border-subtle)] bg-[var(--g-bg-card)]">
                  <CardContent className="pt-6">
                    <div className="w-12 h-12 rounded-xl bg-[var(--g-accent-soft)] flex items-center justify-center mb-4">
                      <Icon className="size-6 text-[var(--g-accent-text)]" />
                    </div>
                    <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
                    <p className="text-[var(--g-text-secondary)] text-sm">{f.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        {config.testimonial && (
          <section className="py-20 px-6 border-t border-[var(--g-border-subtle)] bg-[var(--g-bg-surface)]">
            <div className="max-w-2xl mx-auto text-center">
              <Quote className="size-10 text-[var(--g-accent)] mx-auto mb-4 opacity-60" />
              <blockquote className="text-xl font-medium text-[var(--g-text-primary)] mb-4">
                &ldquo;{config.testimonial.quote}&rdquo;
              </blockquote>
              <p className="text-sm text-[var(--g-text-tertiary)]">
                — {config.testimonial.author}, {config.testimonial.company}
              </p>
            </div>
          </section>
        )}

        <section className="py-24 px-6 border-t border-[var(--g-border-subtle)]">
          <div className="max-w-2xl mx-auto text-center space-y-6">
            <h2 className="text-3xl font-bold">Ready to Empower Your {config.name} Team?</h2>
            <Link href="/signup">
              <Button size="lg">{config.ctaText}</Button>
            </Link>
          </div>
        </section>

        <footer className="py-12 px-6 border-t border-[var(--g-border-subtle)]">
          <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
            <Link href="/" className="obs-topnav-brand flex items-center gap-2">
              <div className="obs-logo-mark flex items-center justify-center text-white text-xs font-black">
                G
              </div>
              <span>Gunner</span>
            </Link>
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
