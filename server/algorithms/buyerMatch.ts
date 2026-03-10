/**
 * Buyer Match — scores buyers against a property for disposition.
 *
 * Step 1: Hard filter by market match
 * Step 2: Score 0-100 based on weighted signals
 * Step 3: Sort by score desc, classify as Hot/Warm/Cold
 *
 * Config values come from Tenant Playbook → Industry Playbook → defaults below.
 */

export interface BuyerMatchConfig {
  projectTypeWeight: number;
  buyerTierWeight: number;
  responseSpeedWeight: number;
  verifiedFundingWeight: number;
  pastPurchaseWeight: number;
  buyerTierScores: Record<string, number>;
  responseSpeedScores: Record<string, number>;
  hotMinScore: number;
  warmMinScore: number;
  excludeHalted: boolean;
}

export const DEFAULT_BUYER_MATCH_CONFIG: BuyerMatchConfig = {
  projectTypeWeight: 35,
  buyerTierWeight: 30,
  responseSpeedWeight: 20,
  verifiedFundingWeight: 10,
  pastPurchaseWeight: 5,
  buyerTierScores: { Priority: 30, Qualified: 20, JV_Partner: 15, Unqualified: 5, Halted: 0 },
  responseSpeedScores: { Lightning: 20, Same_Day: 13, Slow: 6, Ghost: 0 },
  hotMinScore: 65,
  warmMinScore: 35,
  excludeHalted: false,
};

export interface SortableBuyer {
  id: number;
  name: string;
  markets: string[];
  buyBoxType?: string | null;
  buyerTier?: string | null;
  responseSpeed?: string | null;
  verifiedFunding?: boolean;
  hasPurchasedBefore?: boolean;
}

export interface PropertyForMatch {
  market: string;
  projectType?: string | null;
}

export interface ScoredBuyer extends SortableBuyer {
  matchScore: number;
  matchTier: "hot" | "warm" | "cold";
}

export function matchBuyers(
  buyers: SortableBuyer[],
  property: PropertyForMatch,
  config: Partial<BuyerMatchConfig> = {}
): ScoredBuyer[] {
  const c = { ...DEFAULT_BUYER_MATCH_CONFIG, ...config };

  // Step 1: hard filter by market
  const filtered = buyers.filter((b) => {
    if (c.excludeHalted && b.buyerTier === "Halted") return false;
    return b.markets.some(
      (m) => m === property.market || m === "Nationwide" || m === "nationwide"
    );
  });

  // Step 2: score
  const scored: ScoredBuyer[] = filtered.map((b) => {
    let score = 0;

    // Project type match
    if (property.projectType && b.buyBoxType === property.projectType) {
      score += c.projectTypeWeight;
    }

    // Buyer tier
    const tierKey = (b.buyerTier ?? "Unqualified").replace(/\s+/g, "_");
    score += c.buyerTierScores[tierKey] ?? 0;

    // Response speed
    const speedKey = (b.responseSpeed ?? "Ghost").replace(/\s+/g, "_");
    score += c.responseSpeedScores[speedKey] ?? 0;

    // Verified funding
    if (b.verifiedFunding) score += c.verifiedFundingWeight;

    // Past purchase
    if (b.hasPurchasedBefore) score += c.pastPurchaseWeight;

    const matchTier: "hot" | "warm" | "cold" =
      score >= c.hotMinScore ? "hot" : score >= c.warmMinScore ? "warm" : "cold";

    return { ...b, matchScore: score, matchTier };
  });

  // Step 3: sort by score desc, tiebreak by tier then speed
  return scored.sort((a, b) => {
    if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
    const tierOrder = ["Priority", "Qualified", "JV_Partner", "Unqualified", "Halted"];
    const aTier = tierOrder.indexOf((a.buyerTier ?? "Unqualified").replace(/\s+/g, "_"));
    const bTier = tierOrder.indexOf((b.buyerTier ?? "Unqualified").replace(/\s+/g, "_"));
    return aTier - bTier;
  });
}
