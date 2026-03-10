import { useParams } from "wouter";

export function IndustryLanding() {
  const { industry } = useParams() as { industry?: string };
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">
        {industry ? `${industry} Industry` : "Industry"}
      </h1>
      <div className="rounded-lg border border-[var(--g-border-subtle)] bg-[var(--g-bg-card)] p-8 text-center text-muted-foreground">
        Placeholder for {industry ?? "industry"} landing page. Will be populated from industry config files later.
      </div>
    </div>
  );
}
