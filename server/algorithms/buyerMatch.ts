export const BUYER_MATCH_CONFIG = {
  projectTypeWeight: 35,
  buyerTierWeight: 30,
  responseSpeedWeight: 20,
  verifiedFundingWeight: 10,
  pastPurchaseWeight: 5,
  buyerTierScores: {
    Priority: 30,
    Qualified: 20,
    JV_Partner: 15,
    Unqualified: 5,
    Halted: 0,
  } as Record<string, number>,
  responseSpeedScores: {
    Lightning: 20,
    Same_Day: 13,
    Slow: 6,
    Ghost: 0,
  } as Record<string, number>,
  hotMinScore: 65,
  warmMinScore: 35,
  excludeHalted: false,
};

export interface Buyer {
  id: number;
  name: string;
  markets: string[];
  buyBoxType?: string;
  tier?: string;
  responseSpeed?: string;
  verifiedFunding?: boolean;
  hasPurchasedBefore?: boolean;
}

export interface Property {
  id: number;
  market: string;
  projectType?: string;
}

export interface BuyerMatchResult {
  buyer: Buyer;
  score: number;
  temperature: "hot" | "warm" | "cold";
}

function scoreBuyer(
  buyer: Buyer,
  property: Property,
  cfg: typeof BUYER_MATCH_CONFIG
): number {
  const projectTypeMatch =
    property.projectType && buyer.buyBoxType && property.projectType === buyer.buyBoxType
      ? cfg.projectTypeWeight
      : 0;
  const tierScore = cfg.buyerTierScores[buyer.tier ?? ""] ?? 0;
  const responseScore = cfg.responseSpeedScores[buyer.responseSpeed ?? ""] ?? 0;
  const verifiedScore = buyer.verifiedFunding ? cfg.verifiedFundingWeight : 0;
  const pastPurchaseScore = buyer.hasPurchasedBefore ? cfg.pastPurchaseWeight : 0;
  return Math.min(100, projectTypeMatch + tierScore + responseScore + verifiedScore + pastPurchaseScore);
}

export function matchBuyers(
  property: Property,
  buyers: Buyer[],
  config?: Partial<typeof BUYER_MATCH_CONFIG>
): BuyerMatchResult[] {
  const cfg = { ...BUYER_MATCH_CONFIG, ...config };
  let filtered = buyers.filter(
    (b) => b.markets.includes(property.market) || b.markets.includes("Nationwide")
  );
  if (cfg.excludeHalted) filtered = filtered.filter((b) => (b.tier ?? "") !== "Halted");
  const scored = filtered.map((buyer) => {
    const score = scoreBuyer(buyer, property, cfg);
    const temperature: "hot" | "warm" | "cold" =
      score >= cfg.hotMinScore ? "hot" : score >= cfg.warmMinScore ? "warm" : "cold";
    return { buyer, score, temperature };
  });
  return scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const tierA = cfg.buyerTierScores[a.buyer.tier ?? ""] ?? 0;
    const tierB = cfg.buyerTierScores[b.buyer.tier ?? ""] ?? 0;
    if (tierB !== tierA) return tierB - tierA;
    const rsA = cfg.responseSpeedScores[a.buyer.responseSpeed ?? ""] ?? 0;
    const rsB = cfg.responseSpeedScores[b.buyer.responseSpeed ?? ""] ?? 0;
    return rsB - rsA;
  });
}
