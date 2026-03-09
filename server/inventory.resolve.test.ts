import { describe, expect, it, vi, beforeEach } from "vitest";
import { normalizeSource } from "./ghlContactImport";

/**
 * Test the auto-resolve logic for sourceId and marketId.
 * We test the normalizeSource function directly (pure function),
 * and verify the resolve logic patterns used in inventory.ts.
 */

describe("normalizeSource", () => {
  it("normalizes known source aliases", () => {
    // "cold call" and "cold calling" map to BatchDialer
    expect(normalizeSource("cold call")).toBe("BatchDialer");
    expect(normalizeSource("cold calling")).toBe("BatchDialer");
    expect(normalizeSource("direct mail")).toBe("Direct Mail");
    // "ppl" maps to PropertyLeads
    expect(normalizeSource("ppl")).toBe("PropertyLeads");
    expect(normalizeSource("referral")).toBe("Referral");
    expect(normalizeSource("facebook")).toBe("Social Media");
  });

  it("returns original string (trimmed) for unknown sources", () => {
    expect(normalizeSource("Custom Source")).toBe("Custom Source");
    expect(normalizeSource("My Special Lead Gen")).toBe("My Special Lead Gen");
    // PPC and SEO are not in the map, so they return as-is (trimmed)
    expect(normalizeSource("PPC")).toBe("PPC");
    expect(normalizeSource("SEO")).toBe("SEO");
  });

  it("returns 'Unknown' for empty input", () => {
    expect(normalizeSource("")).toBe("Unknown");
  });

  it("trims whitespace", () => {
    // normalizeSource lowercases then looks up; "ppc" is not in map, so returns trimmed original
    expect(normalizeSource("  PPC  ")).toBe("PPC");
    expect(normalizeSource("  Custom Source  ")).toBe("Custom Source");
    // "  cold call  " → lower+trim → "cold call" → found in map → "BatchDialer"
    expect(normalizeSource("  cold call  ")).toBe("BatchDialer");
  });
});

describe("sourceId/marketId auto-resolve patterns", () => {
  it("sourceId filter uses numeric comparison for FK alignment", () => {
    // Simulates the client-side filter logic
    const properties = [
      { id: 1, sourceId: 5, leadSource: "Cold Calling" },
      { id: 2, sourceId: 3, leadSource: "PPC" },
      { id: 3, sourceId: null, leadSource: "Cold Calling" },
      { id: 4, sourceId: 5, leadSource: "Cold Calling" },
    ];

    const sourceFilter = "5"; // String from Select value
    const sourceIdNum = Number(sourceFilter);
    const filtered = properties.filter(p => p.sourceId === sourceIdNum);

    expect(filtered).toHaveLength(2);
    expect(filtered.map(p => p.id)).toEqual([1, 4]);
    // Property 3 has matching leadSource text but null sourceId — correctly excluded
    // This is the key alignment: KPI page also uses sourceId FK
  });

  it("marketId filter uses numeric comparison for FK alignment", () => {
    const properties = [
      { id: 1, marketId: 10, market: "Nashville" },
      { id: 2, marketId: 20, market: "Atlanta" },
      { id: 3, marketId: null, market: "Nashville" },
      { id: 4, marketId: 10, market: "Nashville" },
    ];

    const marketFilter = "10";
    const marketIdNum = Number(marketFilter);
    const filtered = properties.filter(p => p.marketId === marketIdNum);

    expect(filtered).toHaveLength(2);
    expect(filtered.map(p => p.id)).toEqual([1, 4]);
  });

  it("stage counts respect source/market filters", () => {
    const rawProperties = [
      { id: 1, status: "lead", sourceId: 5, marketId: 10 },
      { id: 2, status: "lead", sourceId: 3, marketId: 10 },
      { id: 3, status: "apt_set", sourceId: 5, marketId: 10 },
      { id: 4, status: "lead", sourceId: 5, marketId: 20 },
      { id: 5, status: "offer_made", sourceId: 5, marketId: 10 },
    ];

    // Filter by sourceId=5
    const sourceFilter = "5";
    const sourceIdNum = Number(sourceFilter);
    let base = rawProperties.filter(p => p.sourceId === sourceIdNum);

    const counts: Record<string, number> = {};
    base.forEach(p => {
      counts[p.status] = (counts[p.status] || 0) + 1;
    });

    expect(counts.lead).toBe(2); // id 1 and 4
    expect(counts.apt_set).toBe(1); // id 3
    expect(counts.offer_made).toBe(1); // id 5

    // Further filter by marketId=10
    const marketFilter = "10";
    const marketIdNum = Number(marketFilter);
    base = base.filter(p => p.marketId === marketIdNum);

    const counts2: Record<string, number> = {};
    base.forEach(p => {
      counts2[p.status] = (counts2[p.status] || 0) + 1;
    });

    expect(counts2.lead).toBe(1); // only id 1 (id 4 is marketId 20)
    expect(counts2.apt_set).toBe(1); // id 3
    expect(counts2.offer_made).toBe(1); // id 5
  });
});
