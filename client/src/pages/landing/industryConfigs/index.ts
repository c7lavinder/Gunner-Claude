export interface IndustryConfig {
  code: string;
  name: string;
  headline: string;
  subtext: string;
  features: Array<{ title: string; description: string }>;
  testimonial?: { quote: string; author: string; company: string };
  ctaText: string;
}

export const INDUSTRY_CONFIGS: Record<string, IndustryConfig> = {
  "wholesaling-real-estate": {
    code: "wholesaling_re",
    name: "Real Estate Wholesaling",
    headline: "Close More Deals with AI-Coached Acquisition Teams",
    subtext: "Gunner grades every seller call, coaches your lead managers, and keeps your pipeline moving — so your team performs like A-players.",
    features: [
      { title: "Seller Call Grading", description: "Every qualification and offer call graded instantly by AI" },
      { title: "Pipeline Accountability", description: "See which leads are stuck and who needs to follow up" },
      { title: "Team Leaderboards", description: "Gamified performance tracking that motivates your team" },
    ],
    testimonial: { quote: "Gunner helped us double our contact rate in 30 days.", author: "Sales Manager", company: "Leading Wholesale Company" },
    ctaText: "Start Closing More Deals",
  },
  "solar-sales": {
    code: "solar",
    name: "Solar Sales",
    headline: "Turn Every Solar Rep Into a Top Closer",
    subtext: "AI coaching for door-to-door and phone sales teams that need consistent performance across every appointment.",
    features: [
      { title: "Appointment Call Review", description: "Grade every customer interaction automatically" },
      { title: "Objection Handling Training", description: "AI identifies missed objections and coaches responses" },
      { title: "Rep Performance Tracking", description: "See who's improving and who needs help" },
    ],
    ctaText: "Empower Your Solar Team",
  },
  "insurance": {
    code: "insurance",
    name: "Insurance Sales",
    headline: "AI Coaching That Makes Every Agent Better",
    subtext: "From cold calls to policy reviews — Gunner grades every interaction and helps your agents sell with confidence.",
    features: [
      { title: "Call Quality Scoring", description: "Automated grading for compliance and sales effectiveness" },
      { title: "Compliance Monitoring", description: "Flag risky language and missing disclosures" },
      { title: "Agent Development", description: "Personalized coaching paths for each agent" },
    ],
    ctaText: "Improve Agent Performance",
  },
  "saas-sales": {
    code: "saas",
    name: "SaaS Sales",
    headline: "Scale Your SDR Team Without Scaling Your Managers",
    subtext: "AI grades discovery calls, demos, and follow-ups so your reps get instant feedback and your managers focus on strategy.",
    features: [
      { title: "Discovery Call Grading", description: "Ensure reps ask the right questions every time" },
      { title: "Demo Effectiveness", description: "Score presentations and identify improvement areas" },
      { title: "Pipeline Velocity", description: "Track which reps move deals fastest" },
    ],
    ctaText: "Accelerate Your Pipeline",
  },
  "recruiting": {
    code: "recruiting",
    name: "Recruiting & Staffing",
    headline: "Train Recruiters to Close Candidates Faster",
    subtext: "Grade candidate screens, client calls, and intake meetings with AI that understands the recruiting process.",
    features: [
      { title: "Screen Call Grading", description: "Ensure quality candidate screening every time" },
      { title: "Client Relationship Tracking", description: "Monitor client call quality and satisfaction" },
      { title: "Recruiter Accountability", description: "Leaderboards and KPIs for your recruiting team" },
    ],
    ctaText: "Level Up Your Recruiters",
  },
};

export function getIndustryConfig(slug: string): IndustryConfig | null {
  return INDUSTRY_CONFIGS[slug] ?? null;
}
